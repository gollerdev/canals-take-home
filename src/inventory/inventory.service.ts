import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import type { GeoPoint } from '../common/types/geo-point';
import { InsufficientStockError } from './exceptions/insufficient-stock.exception';
import { NoWarehouseAvailableError } from './exceptions/no-warehouse-available.exception';
import type { RequestedItemInputDto } from './dto/requested-item-input.dto';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventory: InventoryRepository,
  ) {}

  /**
   * Holds stock at the closest warehouse that can fill the whole order.
   *
   * @param items - products and quantities the order needs
   * @param destination - geocoded shipping location
   * @returns the warehouse now holding the stock
   * @throws NoWarehouseAvailableError when no warehouse could be reserved
   */
  async reserveAtNearest(
    items: readonly RequestedItemInputDto[],
    destination: GeoPoint,
  ): Promise<string> {
    const candidates = await this.inventory.findCandidateWarehouses(
      items,
      destination,
    );

    for (const warehouseId of candidates) {
      try {
        await this.dataSource.transaction((manager) =>
          this.inventory.reserve(warehouseId, items, manager),
        );

        return warehouseId;
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          continue;
        }

        throw error;
      }
    }

    throw new NoWarehouseAvailableError();
  }

  /**
   * Turns a held reservation into a permanent deduction after payment.
   *
   * @param warehouseId - warehouse holding the reservation
   * @param items - products and quantities to settle
   * @param manager - required so this lands atomically with the order update
   */
  async commitReservation(
    warehouseId: string,
    items: readonly RequestedItemInputDto[],
    manager: EntityManager,
  ): Promise<void> {
    await this.inventory.commitReservation(warehouseId, items, manager);
  }

  /**
   * Returns held stock to availability after a failed payment.
   *
   * @param warehouseId - warehouse holding the reservation
   * @param items - products and quantities to release
   * @param manager - required so this lands atomically with the order update
   */
  async releaseReservation(
    warehouseId: string,
    items: readonly RequestedItemInputDto[],
    manager: EntityManager,
  ): Promise<void> {
    await this.inventory.releaseReservation(warehouseId, items, manager);
  }
}
