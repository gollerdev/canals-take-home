import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/database/pg-error';
import type { InsertOrderInputDto } from './dto/insert-order-input.dto';
import { OrderItem } from './entities/order-item.entity';
import { OrderFailureReason, OrderStatus } from './entities/order-status.enum';
import { Order } from './entities/order.entity';
import { CustomerNotFoundError } from './exceptions/customer-not-found.exception';
import { IdempotencyConflictError } from './exceptions/idempotency-conflict.exception';
import { OrderNotPendingError } from './exceptions/order-not-pending.exception';

@Injectable()
export class OrdersRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Records the order as pending, claiming its idempotency key.
   *
   * @param input - customer, address, geocoded location, total and lines
   * @returns the persisted order
   * @throws IdempotencyConflictError when the customer already used the key
   * @throws CustomerNotFoundError when the customer does not exist
   */
  async insertPending(input: InsertOrderInputDto): Promise<Order> {
    const manager = this.dataSource.manager;
    const order = manager.create(Order, {
      customerId: input.customerId,
      idempotencyKey: input.idempotencyKey,
      shippingAddress: input.shippingAddress,
      shippingLocation: input.shippingLocation,
      totalCents: input.totalCents,
      status: OrderStatus.Pending,
      items: input.lines.map((line) =>
        manager.create(OrderItem, {
          productId: line.productId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        }),
      ),
    });

    try {
      return await manager.save(order);
    } catch (error) {
      if (isUniqueViolation(error, 'orders_idempotency_unique')) {
        throw new IdempotencyConflictError(
          input.customerId,
          input.idempotencyKey,
        );
      }

      if (isForeignKeyViolation(error, 'orders')) {
        throw new CustomerNotFoundError(input.customerId);
      }

      throw error;
    }
  }

  /**
   * Finds the order a replay refers to.
   *
   * @param customerId - owner of the key
   * @param idempotencyKey - key the client sent
   * @returns the original order, or null if the key is unused
   */
  async findByIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
  ): Promise<Order | null> {
    return this.dataSource.manager.findOne(Order, {
      where: { customerId, idempotencyKey },
      relations: { items: true },
    });
  }

  /**
   * Loads an order with everything needed to render it to a client.
   *
   * @param id - order identifier
   * @returns the order with items, products, warehouse and customer, or null
   */
  async findByIdWithItems(id: string): Promise<Order | null> {
    return this.dataSource.manager.findOne(Order, {
      where: { id },
      relations: { items: { product: true }, warehouse: true, customer: true },
    });
  }

  /**
   * Records the payment reference as soon as the card is charged.
   *
   * @param orderId - order that was charged
   * @param paymentReference - reference returned by the payment provider
   */
  async recordPaymentReference(
    orderId: string,
    paymentReference: string,
  ): Promise<void> {
    await this.dataSource.manager.update(
      Order,
      { id: orderId },
      { paymentReference },
    );
  }

  /**
   * Settles the order as confirmed.
   *
   * @param orderId - order to confirm
   * @param warehouseId - warehouse the order will ship from
   * @param paymentReference - reference returned by the payment provider
   * @param manager - required so this lands atomically with commitReservation
   * @throws OrderNotPendingError when the order is missing or already settled
   */
  async markConfirmed(
    orderId: string,
    warehouseId: string,
    paymentReference: string,
    manager: EntityManager,
  ): Promise<void> {
    const result = await manager.update(
      Order,
      { id: orderId, status: OrderStatus.Pending },
      {
        status: OrderStatus.Confirmed,
        warehouseId,
        paymentReference,
      },
    );

    if (result.affected !== 1) {
      throw new OrderNotPendingError(orderId);
    }
  }

  /**
   * Settles the order as failed, recording why.
   *
   * Only a pending order can be settled, so a replayed failure cannot undo a
   * confirmed order.
   *
   * @param orderId - order to fail
   * @param reason - why the order could not be completed
   * @param manager - required so this lands atomically with releaseReservation
   * @throws OrderNotPendingError when the order is missing or already settled
   */
  async markFailed(
    orderId: string,
    reason: OrderFailureReason,
    manager: EntityManager,
  ): Promise<void> {
    const result = await manager.update(
      Order,
      { id: orderId, status: OrderStatus.Pending },
      { status: OrderStatus.Failed, failureReason: reason },
    );

    if (result.affected !== 1) {
      throw new OrderNotPendingError(orderId);
    }
  }
}
