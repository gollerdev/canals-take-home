import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  type QueryDeepPartialEntity,
} from 'typeorm';

import type { GeoPoint } from '../common/types/geo-point';
import { InventoryItem } from './entities/inventory-item.entity';
import {
  InsufficientStockError,
  ReservationNotHeldError,
} from './inventory.errors';

export interface RequestedItem {
  productId: string;
  quantity: number;
}

const CANDIDATE_WAREHOUSES = `
  SELECT w.id
  FROM warehouses w
  WHERE w.is_active
    AND NOT EXISTS (
      SELECT 1
      FROM unnest($1::uuid[], $2::int[]) AS r(product_id, quantity)
      LEFT JOIN inventory_items i
             ON i.warehouse_id = w.id
            AND i.product_id   = r.product_id
      WHERE i.product_id IS NULL
         OR i.quantity_on_hand - i.quantity_reserved < r.quantity
    )
  ORDER BY w.location <-> ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
  LIMIT $5
`;

const ENOUGH_AVAILABLE = 'quantity_on_hand - quantity_reserved >= :quantity';
const ENOUGH_RESERVED = 'quantity_reserved >= :quantity';

function inLockOrder(items: readonly RequestedItem[]): RequestedItem[] {
  return [...items].sort((a, b) => a.productId.localeCompare(b.productId));
}

@Injectable()
export class InventoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Finds warehouses that can fill the entire order, nearest first.
   *
   * Advisory: takes no locks, so the caller must still attempt the reservation.
   *
   * @param items - products and quantities the order needs
   * @param destination - geocoded shipping location to measure distance from
   * @param limit - how many candidates to return
   * @returns warehouse ids ordered by distance, closest first
   */
  async findCandidateWarehouses(
    items: readonly RequestedItem[],
    destination: GeoPoint,
    limit: number,
  ): Promise<string[]> {
    if (items.length === 0) {
      return [];
    }

    const [longitude, latitude] = destination.coordinates;

    const rows = await this.dataSource.manager.query<Array<{ id: string }>>(
      CANDIDATE_WAREHOUSES,
      [
        items.map((item) => item.productId),
        items.map((item) => item.quantity),
        longitude,
        latitude,
        limit,
      ],
    );

    return rows.map((row) => row.id);
  }

  /**
   * Holds stock for every line, or throws without holding any.
   *
   * Lines are locked in `productId` order to avoid deadlocks.
   *
   * @param warehouseId - warehouse to hold the stock at
   * @param items - products and quantities to hold
   * @param manager - required so every line commits or rolls back together
   * @throws InsufficientStockError when a line cannot be satisfied
   */
  async reserve(
    warehouseId: string,
    items: readonly RequestedItem[],
    manager: EntityManager,
  ): Promise<void> {
    for (const item of inLockOrder(items)) {
      const applied = await this.adjust(
        manager,
        warehouseId,
        item,
        { quantityReserved: () => 'quantity_reserved + :quantity' },
        ENOUGH_AVAILABLE,
      );

      if (!applied) {
        throw new InsufficientStockError(warehouseId, item.productId);
      }
    }
  }

  /**
   * Turns a held reservation into a permanent deduction after payment.
   *
   * @param warehouseId - warehouse holding the reservation
   * @param items - products and quantities to settle
   * @param manager - required so this lands atomically with markConfirmed
   * @throws ReservationNotHeldError when no matching hold exists
   */
  async commitReservation(
    warehouseId: string,
    items: readonly RequestedItem[],
    manager: EntityManager,
  ): Promise<void> {
    for (const item of inLockOrder(items)) {
      const applied = await this.adjust(
        manager,
        warehouseId,
        item,
        {
          quantityOnHand: () => 'quantity_on_hand - :quantity',
          quantityReserved: () => 'quantity_reserved - :quantity',
        },
        ENOUGH_RESERVED,
      );

      if (!applied) {
        throw new ReservationNotHeldError(warehouseId, item.productId);
      }
    }
  }

  /**
   * Returns held stock to availability after a failed payment.
   *
   * @param warehouseId - warehouse holding the reservation
   * @param items - products and quantities to release
   * @param manager - required so this lands atomically with markFailed
   * @throws ReservationNotHeldError when no matching hold exists
   */
  async releaseReservation(
    warehouseId: string,
    items: readonly RequestedItem[],
    manager: EntityManager,
  ): Promise<void> {
    for (const item of inLockOrder(items)) {
      const applied = await this.adjust(
        manager,
        warehouseId,
        item,
        { quantityReserved: () => 'quantity_reserved - :quantity' },
        ENOUGH_RESERVED,
      );

      if (!applied) {
        throw new ReservationNotHeldError(warehouseId, item.productId);
      }
    }
  }

  /**
   * Applies one conditional stock adjustment to a single inventory row.
   *
   * @param manager - transaction the statement runs in
   * @param warehouseId - warehouse whose row is being adjusted
   * @param item - product and quantity the adjustment applies to
   * @param set - columns to change, as SQL expressions
   * @param guard - WHERE condition preventing oversell, re-checked under the
   *   row lock so a losing order updates zero rows
   * @returns true when the row was adjusted, false when the guard rejected it
   */
  private async adjust(
    manager: EntityManager,
    warehouseId: string,
    item: RequestedItem,
    set: QueryDeepPartialEntity<InventoryItem>,
    guard: string,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(InventoryItem)
      .set(set)
      .where('warehouse_id = :warehouseId')
      .andWhere('product_id = :productId')
      .andWhere(guard)
      .setParameters({
        warehouseId,
        productId: item.productId,
        quantity: item.quantity,
      })
      .execute();

    return result.affected === 1;
  }
}
