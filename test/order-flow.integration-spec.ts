import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';

import { Address } from '../src/common/entities/address.embedded';
import { geoPoint } from '../src/common/types/geo-point';
import type { Env } from '../src/config/env.schema';
import { Customer } from '../src/customers/entities/customer.entity';
import { MockGeocodingProvider } from '../src/geocoding/mock-geocoding.provider';
import { InventoryItem } from '../src/inventory/entities/inventory-item.entity';
import { Warehouse } from '../src/inventory/entities/warehouse.entity';
import { InventoryRepository } from '../src/inventory/inventory.repository';
import { InventoryService } from '../src/inventory/inventory.service';
import {
  OrderFailureReason,
  OrderStatus,
} from '../src/orders/entities/order-status.enum';
import { CustomerNotFoundError } from '../src/orders/exceptions/customer-not-found.exception';
import { DuplicateProductError } from '../src/orders/exceptions/duplicate-product.exception';
import { EmptyOrderError } from '../src/orders/exceptions/empty-order.exception';
import { InvalidProductIdError } from '../src/orders/exceptions/invalid-product-id.exception';
import { InvalidQuantityError } from '../src/orders/exceptions/invalid-quantity.exception';
import { OrderInProgressError } from '../src/orders/exceptions/order-in-progress.exception';
import { OrdersRepository } from '../src/orders/orders.repository';
import { OrdersService } from '../src/orders/orders.service';
import { MockPaymentGateway } from '../src/payments/mock-payment.gateway';
import { PaymentUnavailableError } from '../src/payments/payments.errors';
import { Product } from '../src/products/entities/product.entity';
import { UnknownProductsError } from '../src/products/exceptions/unknown-products.exception';
import { ProductsRepository } from '../src/products/products.repository';
import { ProductsService } from '../src/products/products.service';
import { createTestDataSource, truncateAll } from './setup/test-data-source';

const NEW_YORK = { longitude: -74.006, latitude: 40.7128 };
const PHILADELPHIA = { longitude: -75.1652, latitude: 39.9526 };
const LOS_ANGELES = { longitude: -118.2437, latitude: 34.0522 };

const GOOD_CARD = '4242424242424242';
const NO_FUNDS_CARD = '4000000000009995';
const SERVER_ERROR_CARD = '4000000000000119';

const SHIPPING: Address = {
  line1: '1 Main Street',
  line2: null,
  city: 'New York',
  region: 'NY',
  postalCode: '10001',
  country: 'US',
};

describe('order flow', () => {
  let dataSource: DataSource;
  let orders: OrdersService;
  let inventoryRepository: InventoryRepository;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();

    const noLatency = { get: () => 0 } as unknown as ConfigService<Env, true>;
    inventoryRepository = new InventoryRepository(dataSource);

    orders = new OrdersService(
      dataSource,
      new OrdersRepository(dataSource),
      new ProductsService(new ProductsRepository(dataSource)),
      new InventoryService(dataSource, inventoryRepository),
      new MockGeocodingProvider(noLatency),
      new MockPaymentGateway(noLatency),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  const aCustomer = () =>
    dataSource.manager.save(
      dataSource.manager.create(Customer, {
        email: 'ana@example.com',
        name: 'Ana',
      }),
    );

  const aProduct = (sku: string, priceCents: number) =>
    dataSource.manager.save(
      dataSource.manager.create(Product, { sku, name: sku, priceCents }),
    );

  const aWarehouse = (
    code: string,
    at: { longitude: number; latitude: number },
  ) =>
    dataSource.manager.save(
      dataSource.manager.create(Warehouse, {
        code,
        name: code,
        address: SHIPPING,
        location: geoPoint(at.longitude, at.latitude),
      }),
    );

  const stock = (warehouseId: string, productId: string, onHand: number) =>
    dataSource.manager.save(
      dataSource.manager.create(InventoryItem, {
        warehouseId,
        productId,
        quantityOnHand: onHand,
      }),
    );

  const stockOf = async (warehouseId: string, productId: string) => {
    const item = await dataSource.manager.findOneByOrFail(InventoryItem, {
      warehouseId,
      productId,
    });
    return { onHand: item.quantityOnHand, reserved: item.quantityReserved };
  };

  const orderFor = (
    customerId: string,
    items: Array<{ productId: string; quantity: number }>,
    overrides: { cardNumber?: string; idempotencyKey?: string } = {},
  ) => ({
    customerId,
    idempotencyKey: overrides.idempotencyKey ?? 'checkout-1',
    shippingAddress: SHIPPING,
    cardNumber: overrides.cardNumber ?? GOOD_CARD,
    items,
  });

  describe('a successful order', () => {
    it('confirms the order and deducts the stock', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      const { order, replayed } = await orders.create(
        orderFor(customer.id, [{ productId: shirt.id, quantity: 2 }]),
      );

      expect(replayed).toBe(false);
      expect(order.status).toBe(OrderStatus.Confirmed);
      expect(order.warehouseId).toBe(nyc.id);
      expect(order.totalCents).toBe(3998);
      expect(order.paymentReference).toMatch(/^ch_/);
      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 8,
        reserved: 0,
      });
    });

    it('prices the order from the database, not the request', async () => {
      const [customer, shirt, hat] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
        aProduct('HAT', 2500),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      await stock(nyc.id, hat.id, 10);

      const { order } = await orders.create(
        orderFor(customer.id, [
          { productId: shirt.id, quantity: 2 },
          { productId: hat.id, quantity: 1 },
        ]),
      );

      expect(order.totalCents).toBe(1999 * 2 + 2500);
    });

    it('ships from a farther warehouse when the nearest cannot fill it', async () => {
      const [customer, shirt, hat] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
        aProduct('HAT', 2500),
      ]);
      const [nyc, philadelphia] = await Promise.all([
        aWarehouse('WH-NYC', NEW_YORK),
        aWarehouse('WH-PHL', PHILADELPHIA),
      ]);
      await stock(nyc.id, shirt.id, 10);
      await stock(philadelphia.id, shirt.id, 10);
      await stock(philadelphia.id, hat.id, 10);

      const { order } = await orders.create(
        orderFor(customer.id, [
          { productId: shirt.id, quantity: 1 },
          { productId: hat.id, quantity: 1 },
        ]),
      );

      expect(order.warehouseId).toBe(philadelphia.id);
    });

    it('reaches the only warehouse that can fill it, however far down the list', async () => {
      const [customer, shirt, hat] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
        aProduct('HAT', 2500),
      ]);

      const nearer = await Promise.all(
        [-75, -80, -85, -90, -95, -100, -105, -110].map((longitude, index) =>
          aWarehouse(`WH-${index}`, { longitude, latitude: 40.7128 }),
        ),
      );
      for (const warehouse of nearer) {
        await stock(warehouse.id, shirt.id, 50);
      }

      const farthest = await aWarehouse('WH-FAR', {
        longitude: -122.4,
        latitude: 37.77,
      });
      await stock(farthest.id, shirt.id, 50);
      await stock(farthest.id, hat.id, 50);

      const { order } = await orders.create(
        orderFor(customer.id, [
          { productId: shirt.id, quantity: 1 },
          { productId: hat.id, quantity: 1 },
        ]),
      );

      expect(order.status).toBe(OrderStatus.Confirmed);
      expect(order.warehouseId).toBe(farthest.id);
    });

    it('falls through every warehouse raced out of stock before it', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);

      const raced = await Promise.all(
        [-75, -80, -85, -90, -95, -100, -105].map((longitude, index) =>
          aWarehouse(`WH-${index}`, { longitude, latitude: 40.7128 }),
        ),
      );
      for (const warehouse of raced) {
        await stock(warehouse.id, shirt.id, 1);
      }

      const survivor = await aWarehouse('WH-LAX', LOS_ANGELES);
      await stock(survivor.id, shirt.id, 5);

      const findCandidates =
        inventoryRepository.findCandidateWarehouses.bind(inventoryRepository);
      const spy = jest
        .spyOn(inventoryRepository, 'findCandidateWarehouses')
        .mockImplementation(async (items, destination) => {
          const candidates = await findCandidates(items, destination);

          await dataSource.manager.update(
            InventoryItem,
            { productId: shirt.id, warehouseId: In(raced.map((w) => w.id)) },
            { quantityReserved: 1 },
          );

          return candidates;
        });

      try {
        const { order } = await orders.create(
          orderFor(customer.id, [{ productId: shirt.id, quantity: 1 }]),
        );

        expect(spy).toHaveBeenCalledTimes(1);
        expect(order.status).toBe(OrderStatus.Confirmed);
        expect(order.warehouseId).toBe(survivor.id);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('when the card is declined', () => {
    it('fails the order and gives the stock back', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      const { order } = await orders.create(
        orderFor(customer.id, [{ productId: shirt.id, quantity: 2 }], {
          cardNumber: NO_FUNDS_CARD,
        }),
      );

      expect(order.status).toBe(OrderStatus.Failed);
      expect(order.failureReason).toBe(OrderFailureReason.PaymentDeclined);
      expect(order.paymentReference).toBeNull();
      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 10,
        reserved: 0,
      });
    });
  });

  describe('when no warehouse can fill the order', () => {
    it('fails the order without touching stock', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 1);

      const { order } = await orders.create(
        orderFor(customer.id, [{ productId: shirt.id, quantity: 5 }]),
      );

      expect(order.status).toBe(OrderStatus.Failed);
      expect(order.failureReason).toBe(OrderFailureReason.NoWarehouseAvailable);
      expect(order.warehouseId).toBeNull();
      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 1,
        reserved: 0,
      });
    });

    it('fails when one product is stocked nowhere', async () => {
      const [customer, shirt, hat] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
        aProduct('HAT', 2500),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await aWarehouse('WH-LAX', LOS_ANGELES);
      await stock(nyc.id, shirt.id, 10);

      const { order } = await orders.create(
        orderFor(customer.id, [
          { productId: shirt.id, quantity: 1 },
          { productId: hat.id, quantity: 1 },
        ]),
      );

      expect(order.status).toBe(OrderStatus.Failed);
      expect(order.failureReason).toBe(OrderFailureReason.NoWarehouseAvailable);
    });
  });

  describe('when the payment outcome is unknown', () => {
    it('refuses to report a still-settling order as a completed replay', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      const command = orderFor(
        customer.id,
        [{ productId: shirt.id, quantity: 2 }],
        { cardNumber: SERVER_ERROR_CARD },
      );
      await expect(orders.create(command)).rejects.toBeInstanceOf(
        PaymentUnavailableError,
      );

      await expect(orders.create(command)).rejects.toBeInstanceOf(
        OrderInProgressError,
      );
    });

    it('leaves the order pending and the stock reserved', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      await expect(
        orders.create(
          orderFor(customer.id, [{ productId: shirt.id, quantity: 2 }], {
            cardNumber: SERVER_ERROR_CARD,
          }),
        ),
      ).rejects.toBeInstanceOf(PaymentUnavailableError);

      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 10,
        reserved: 2,
      });
    });
  });

  describe('idempotency', () => {
    it('returns the original order and charges once', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      const command = orderFor(customer.id, [
        { productId: shirt.id, quantity: 2 },
      ]);

      const first = await orders.create(command);
      const second = await orders.create(command);

      expect(second.replayed).toBe(true);
      expect(second.order.id).toBe(first.order.id);
      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 8,
        reserved: 0,
      });
    });

    it('loads the replayed order with all its relations', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      const command = orderFor(customer.id, [
        { productId: shirt.id, quantity: 2 },
      ]);
      await orders.create(command);

      const { order } = await orders.create(command);

      expect(order.warehouse?.code).toBe('WH-NYC');
      expect(order.customer.email).toBe('ana@example.com');
      expect(order.items[0].product.sku).toBe('SHIRT');
    });

    it('treats a different key as a separate order', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      const first = await orders.create(
        orderFor(customer.id, [{ productId: shirt.id, quantity: 2 }], {
          idempotencyKey: 'a',
        }),
      );
      const second = await orders.create(
        orderFor(customer.id, [{ productId: shirt.id, quantity: 2 }], {
          idempotencyKey: 'b',
        }),
      );

      expect(second.order.id).not.toBe(first.order.id);
      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 6,
        reserved: 0,
      });
    });
  });

  describe('rejected requests', () => {
    it('rejects the same product twice', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);

      await expect(
        orders.create(
          orderFor(customer.id, [
            { productId: shirt.id, quantity: 1 },
            { productId: shirt.id, quantity: 2 },
          ]),
        ),
      ).rejects.toBeInstanceOf(DuplicateProductError);
    });

    it('rejects an unknown product', async () => {
      const customer = await aCustomer();

      await expect(
        orders.create(
          orderFor(customer.id, [
            {
              productId: '019fda00-0000-7000-8000-0000000000ff',
              quantity: 1,
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(UnknownProductsError);
    });

    it('rejects an order with no items', async () => {
      const customer = await aCustomer();

      await expect(
        orders.create(orderFor(customer.id, [])),
      ).rejects.toBeInstanceOf(EmptyOrderError);
    });

    it('accepts a product id in upper case', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      const { order } = await orders.create(
        orderFor(customer.id, [
          { productId: shirt.id.toUpperCase(), quantity: 1 },
        ]),
      );

      expect(order.status).toBe(OrderStatus.Confirmed);
    });

    it.each([0, -1, 1.5])('rejects a quantity of %s', async (quantity) => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);

      await expect(
        orders.create(
          orderFor(customer.id, [{ productId: shirt.id, quantity }]),
        ),
      ).rejects.toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects a product id that is not a uuid', async () => {
      const customer = await aCustomer();

      await expect(
        orders.create(
          orderFor(customer.id, [{ productId: 'not-a-uuid', quantity: 1 }]),
        ),
      ).rejects.toBeInstanceOf(InvalidProductIdError);
    });

    it('rejects an unknown customer', async () => {
      const shirt = await aProduct('SHIRT', 1999);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      await expect(
        orders.create(
          orderFor('019fda00-0000-7000-8000-0000000000ff', [
            { productId: shirt.id, quantity: 1 },
          ]),
        ),
      ).rejects.toBeInstanceOf(CustomerNotFoundError);
    });
  });

  describe('under concurrency', () => {
    it('sells the last unit to exactly one of two orders', async () => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 1);

      const [first, second] = await Promise.all([
        orders.create(
          orderFor(customer.id, [{ productId: shirt.id, quantity: 1 }], {
            idempotencyKey: 'a',
          }),
        ),
        orders.create(
          orderFor(customer.id, [{ productId: shirt.id, quantity: 1 }], {
            idempotencyKey: 'b',
          }),
        ),
      ]);

      const statuses = [first.order.status, second.order.status].sort();
      expect(statuses).toEqual([OrderStatus.Confirmed, OrderStatus.Failed]);
      await expect(stockOf(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 0,
        reserved: 0,
      });
    });
  });
});
