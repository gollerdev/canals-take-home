import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
} from '../geocoding/geocoding-provider.interface';
import type { RequestedItemInputDto } from '../inventory/dto/requested-item-input.dto';
import { NoWarehouseAvailableError } from '../inventory/exceptions/no-warehouse-available.exception';
import { InventoryService } from '../inventory/inventory.service';
import {
  PAYMENT_GATEWAY,
  type ChargeResult,
  type PaymentGateway,
} from '../payments/payment-gateway.interface';
import { PaymentRequestRejectedError } from '../payments/payments.errors';
import { UnknownProductsError } from '../products/exceptions/unknown-products.exception';
import { ProductsService } from '../products/products.service';
import type { CreateOrderInputDto } from './dto/create-order-input.dto';
import type { CreateOrderOutputDto } from './dto/create-order-output.dto';
import type { OrderLineInputDto } from './dto/order-line-input.dto';
import { OrderFailureReason, OrderStatus } from './entities/order-status.enum';
import { Order } from './entities/order.entity';
import { DuplicateProductError } from './exceptions/duplicate-product.exception';
import { EmptyOrderError } from './exceptions/empty-order.exception';
import { IdempotencyConflictError } from './exceptions/idempotency-conflict.exception';
import { InvalidCustomerIdError } from './exceptions/invalid-customer-id.exception';
import { InvalidIdempotencyKeyError } from './exceptions/invalid-idempotency-key.exception';
import { InvalidProductIdError } from './exceptions/invalid-product-id.exception';
import { InvalidQuantityError } from './exceptions/invalid-quantity.exception';
import { OrderInProgressError } from './exceptions/order-in-progress.exception';
import { OrderNotFoundError } from './exceptions/order-not-found.exception';
import { OrdersRepository } from './orders.repository';

const CURRENCY = 'USD';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_QUANTITY_PER_LINE = 1000;

interface ValidatedOrder {
  customerId: string;
  idempotencyKey: string;
  items: RequestedItemInputDto[];
}

function validate(input: CreateOrderInputDto): ValidatedOrder {
  const customerId = input.customerId.trim().toLowerCase();

  if (!UUID.test(customerId)) {
    throw new InvalidCustomerIdError(input.customerId);
  }

  const idempotencyKey = input.idempotencyKey.trim();

  if (idempotencyKey.length === 0) {
    throw new InvalidIdempotencyKeyError();
  }

  if (input.items.length === 0) {
    throw new EmptyOrderError();
  }

  const seen = new Set<string>();

  const items = input.items.map((item) => {
    const productId = item.productId.trim().toLowerCase();

    if (!UUID.test(productId)) {
      throw new InvalidProductIdError(item.productId);
    }

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_QUANTITY_PER_LINE
    ) {
      throw new InvalidQuantityError(productId, item.quantity);
    }

    if (seen.has(productId)) {
      throw new DuplicateProductError(productId);
    }

    seen.add(productId);

    return { productId, quantity: item.quantity };
  });

  return { customerId, idempotencyKey, items };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrdersRepository,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    @Inject(GEOCODING_PROVIDER)
    private readonly geocoding: GeocodingProvider,
    @Inject(PAYMENT_GATEWAY)
    private readonly payments: PaymentGateway,
  ) {}

  /**
   * Places an order: prices it, locates it, reserves stock at the nearest
   * warehouse that can fill it, charges the card, and settles the result.
   *
   * @param input - customer, address, card and requested items
   * @returns the settled order, and whether this was an idempotent replay
   * @throws UnknownProductsError when a product id does not exist
   * @throws CustomerNotFoundError when the customer does not exist
   * @throws AddressNotGeocodableError, GeocodingUnavailableError from geocoding
   * @throws OrderInProgressError when a replay arrives while the original is
   *   still settling
   * @throws PaymentUnavailableError when the charge outcome is unknown; the
   *   order stays pending and its stock stays reserved for reconciliation
   */
  async create(input: CreateOrderInputDto): Promise<CreateOrderOutputDto> {
    const { customerId, idempotencyKey, items } = validate(input);

    const alreadyPlaced = await this.orders.findByIdempotencyKey(
      customerId,
      idempotencyKey,
    );

    if (alreadyPlaced) {
      return this.replayOf(alreadyPlaced);
    }

    const products = await this.products.requireAll(
      items.map((item) => item.productId),
    );

    const lines: OrderLineInputDto[] = items.map((item) => {
      const product = products.get(item.productId);

      if (!product) {
        throw new UnknownProductsError([item.productId]);
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
      };
    });

    const totalCents = lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceCents,
      0,
    );

    const located = await this.geocoding.geocode(input.shippingAddress);

    let order: Order;

    try {
      order = await this.orders.insertPending({
        customerId,
        idempotencyKey,
        shippingAddress: input.shippingAddress,
        shippingLocation: located.location,
        totalCents,
        lines,
      });
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        const original = await this.orders.findByIdempotencyKey(
          customerId,
          idempotencyKey,
        );

        if (original) {
          return this.replayOf(original);
        }
      }

      throw error;
    }

    let warehouseId: string;

    try {
      warehouseId = await this.inventory.reserveAtNearest(
        items,
        located.location,
      );
    } catch (error) {
      if (error instanceof NoWarehouseAvailableError) {
        await this.dataSource.transaction((manager) =>
          this.orders.markFailed(
            order.id,
            OrderFailureReason.NoWarehouseAvailable,
            manager,
          ),
        );

        return { order: await this.requireById(order.id), replayed: false };
      }

      throw error;
    }

    let charge: ChargeResult;

    try {
      charge = await this.payments.charge({
        cardNumber: input.cardNumber,
        amountCents: totalCents,
        currency: CURRENCY,
        description: `Order ${order.id}`,
        idempotencyKey: order.id,
      });
    } catch (error) {
      if (error instanceof PaymentRequestRejectedError) {
        await this.releaseAndFail(order.id, warehouseId, items);
      }

      throw error;
    }

    if (charge.status === 'declined') {
      await this.releaseAndFail(order.id, warehouseId, items);

      return { order: await this.requireById(order.id), replayed: false };
    }

    await this.orders.recordPaymentReference(order.id, charge.reference);

    await this.dataSource.transaction(async (manager) => {
      await this.inventory.commitReservation(warehouseId, items, manager);
      await this.orders.markConfirmed(
        order.id,
        warehouseId,
        charge.reference,
        manager,
      );
    });

    return { order: await this.requireById(order.id), replayed: false };
  }

  /**
   * Reads one order back.
   *
   * @param id - order identifier
   * @returns the order with its items, products and warehouse
   * @throws OrderNotFoundError when no such order exists
   */
  async requireById(id: string): Promise<Order> {
    const order = await this.orders.findByIdWithItems(id);

    if (!order) {
      throw new OrderNotFoundError(id);
    }

    return order;
  }

  private async replayOf(original: Order): Promise<CreateOrderOutputDto> {
    if (original.status === OrderStatus.Pending) {
      throw new OrderInProgressError(original.id);
    }

    return { order: await this.requireById(original.id), replayed: true };
  }

  private async releaseAndFail(
    orderId: string,
    warehouseId: string,
    items: readonly RequestedItemInputDto[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.inventory.releaseReservation(warehouseId, items, manager);
      await this.orders.markFailed(
        orderId,
        OrderFailureReason.PaymentDeclined,
        manager,
      );
    });
  }
}
