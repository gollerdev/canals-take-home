import { DataSource, QueryFailedError } from 'typeorm';

import { Address } from '../src/common/entities/address.embedded';
import { geoPoint } from '../src/common/types/geo-point';
import { Customer } from '../src/customers/entities/customer.entity';
import { InventoryItem } from '../src/inventory/entities/inventory-item.entity';
import { Warehouse } from '../src/inventory/entities/warehouse.entity';
import {
  InsufficientStockError,
  ReservationNotHeldError,
} from '../src/inventory/inventory.errors';
import { InventoryRepository } from '../src/inventory/inventory.repository';
import { OrderStatus } from '../src/orders/entities/order-status.enum';
import { Order } from '../src/orders/entities/order.entity';
import { OrderFailureReason } from '../src/orders/entities/order-status.enum';
import {
  CustomerNotFoundError,
  IdempotencyConflictError,
  OrderNotPendingError,
} from '../src/orders/orders.errors';
import { OrdersRepository } from '../src/orders/orders.repository';
import { Product } from '../src/products/entities/product.entity';
import { ProductsRepository } from '../src/products/products.repository';
import { createTestDataSource, truncateAll } from './setup/test-data-source';

const NEW_YORK = { longitude: -74.006, latitude: 40.7128 };
const PHILADELPHIA = { longitude: -75.1652, latitude: 39.9526 };
const LOS_ANGELES = { longitude: -118.2437, latitude: 34.0522 };

const SHIPPING: Address = {
  line1: '1 Main Street',
  line2: null,
  city: 'New York',
  region: 'NY',
  postalCode: '10001',
  country: 'US',
};

describe('repositories', () => {
  let dataSource: DataSource;
  let products: ProductsRepository;
  let inventory: InventoryRepository;
  let orders: OrdersRepository;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
    products = new ProductsRepository(dataSource);
    inventory = new InventoryRepository(dataSource);
    orders = new OrdersRepository(dataSource);
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

  const aProduct = (sku: string, priceCents = 1999) =>
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

  const availability = async (warehouseId: string, productId: string) => {
    const item = await dataSource.manager.findOneByOrFail(InventoryItem, {
      warehouseId,
      productId,
    });
    return {
      onHand: item.quantityOnHand,
      reserved: item.quantityReserved,
      available: item.quantityOnHand - item.quantityReserved,
    };
  };

  describe('ProductsRepository', () => {
    it('loads the requested products in one call', async () => {
      const [first, second] = await Promise.all([
        aProduct('SKU-A', 1000),
        aProduct('SKU-B', 2500),
      ]);

      const found = await products.findByIds([first.id, second.id]);

      expect(found.map((p) => p.priceCents).sort()).toEqual([1000, 2500]);
    });

    it('omits ids that do not exist so callers can detect them', async () => {
      const known = await aProduct('SKU-A');

      const found = await products.findByIds([
        known.id,
        '019fda00-0000-7000-8000-0000000000ff',
      ]);

      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(known.id);
    });

    it('returns nothing for an empty request without querying', async () => {
      await expect(products.findByIds([])).resolves.toEqual([]);
    });
  });

  describe('InventoryRepository.findCandidateWarehouses', () => {
    it('prefers a farther warehouse when the nearest cannot fill the order', async () => {
      const [shirt, hat] = await Promise.all([
        aProduct('SHIRT'),
        aProduct('HAT'),
      ]);
      const [nyc, philadelphia, losAngeles] = await Promise.all([
        aWarehouse('WH-NYC', NEW_YORK),
        aWarehouse('WH-PHL', PHILADELPHIA),
        aWarehouse('WH-LAX', LOS_ANGELES),
      ]);

      await stock(nyc.id, shirt.id, 100);
      await Promise.all([
        stock(philadelphia.id, shirt.id, 100),
        stock(philadelphia.id, hat.id, 100),
        stock(losAngeles.id, shirt.id, 100),
        stock(losAngeles.id, hat.id, 100),
      ]);

      const candidates = await inventory.findCandidateWarehouses(
        [
          { productId: shirt.id, quantity: 1 },
          { productId: hat.id, quantity: 1 },
        ],
        NEW_YORK,
        5,
      );

      expect(candidates).toEqual([philadelphia.id, losAngeles.id]);
      expect(candidates).not.toContain(nyc.id);
    });

    it('excludes a warehouse holding too few units', async () => {
      const shirt = await aProduct('SHIRT');
      const [nyc, philadelphia] = await Promise.all([
        aWarehouse('WH-NYC', NEW_YORK),
        aWarehouse('WH-PHL', PHILADELPHIA),
      ]);
      await stock(nyc.id, shirt.id, 2);
      await stock(philadelphia.id, shirt.id, 50);

      const candidates = await inventory.findCandidateWarehouses(
        [{ productId: shirt.id, quantity: 10 }],
        NEW_YORK,
        5,
      );

      expect(candidates).toEqual([philadelphia.id]);
    });

    it('counts reserved units as unavailable', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 5);
      await dataSource.transaction((manager) =>
        inventory.reserve(
          nyc.id,
          [{ productId: shirt.id, quantity: 5 }],
          manager,
        ),
      );

      const candidates = await inventory.findCandidateWarehouses(
        [{ productId: shirt.id, quantity: 1 }],
        NEW_YORK,
        5,
      );

      expect(candidates).toEqual([]);
    });

    it('ignores inactive warehouses', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      await dataSource.manager.update(
        Warehouse,
        { id: nyc.id },
        { isActive: false },
      );

      const candidates = await inventory.findCandidateWarehouses(
        [{ productId: shirt.id, quantity: 1 }],
        NEW_YORK,
        5,
      );

      expect(candidates).toEqual([]);
    });

    it('respects the candidate limit', async () => {
      const shirt = await aProduct('SHIRT');
      const warehouses = await Promise.all([
        aWarehouse('WH-NYC', NEW_YORK),
        aWarehouse('WH-PHL', PHILADELPHIA),
        aWarehouse('WH-LAX', LOS_ANGELES),
      ]);
      await Promise.all(warehouses.map((w) => stock(w.id, shirt.id, 10)));

      const candidates = await inventory.findCandidateWarehouses(
        [{ productId: shirt.id, quantity: 1 }],
        NEW_YORK,
        2,
      );

      expect(candidates).toHaveLength(2);
    });
  });

  describe('InventoryRepository reservations', () => {
    it('holds stock without changing what is physically on hand', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      await dataSource.transaction((manager) =>
        inventory.reserve(
          nyc.id,
          [{ productId: shirt.id, quantity: 3 }],
          manager,
        ),
      );

      await expect(availability(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 10,
        reserved: 3,
        available: 7,
      });
    });

    it('stamps updated_at whenever stock moves', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      const before = await dataSource.manager.findOneByOrFail(InventoryItem, {
        warehouseId: nyc.id,
        productId: shirt.id,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      await dataSource.transaction((m) =>
        inventory.reserve(nyc.id, [{ productId: shirt.id, quantity: 1 }], m),
      );

      const after = await dataSource.manager.findOneByOrFail(InventoryItem, {
        warehouseId: nyc.id,
        productId: shirt.id,
      });
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
    });

    it('holds nothing when one line of the order is short', async () => {
      const [shirt, hat] = await Promise.all([
        aProduct('SHIRT'),
        aProduct('HAT'),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      await stock(nyc.id, hat.id, 1);

      await expect(
        dataSource.transaction((manager) =>
          inventory.reserve(
            nyc.id,
            [
              { productId: shirt.id, quantity: 5 },
              { productId: hat.id, quantity: 5 },
            ],
            manager,
          ),
        ),
      ).rejects.toBeInstanceOf(InsufficientStockError);

      await expect(availability(nyc.id, shirt.id)).resolves.toMatchObject({
        reserved: 0,
      });
      await expect(availability(nyc.id, hat.id)).resolves.toMatchObject({
        reserved: 0,
      });
    });

    it('settles a reservation into a permanent deduction', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      const line = [{ productId: shirt.id, quantity: 4 }];

      await dataSource.transaction((m) => inventory.reserve(nyc.id, line, m));
      await dataSource.transaction((m) =>
        inventory.commitReservation(nyc.id, line, m),
      );

      await expect(availability(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 6,
        reserved: 0,
        available: 6,
      });
    });

    it('returns held stock to availability when released', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      const line = [{ productId: shirt.id, quantity: 4 }];

      await dataSource.transaction((m) => inventory.reserve(nyc.id, line, m));
      await dataSource.transaction((m) =>
        inventory.releaseReservation(nyc.id, line, m),
      );

      await expect(availability(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 10,
        reserved: 0,
        available: 10,
      });
    });

    it('refuses to settle stock that was never held', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      await expect(
        dataSource.transaction((m) =>
          inventory.commitReservation(
            nyc.id,
            [{ productId: shirt.id, quantity: 1 }],
            m,
          ),
        ),
      ).rejects.toBeInstanceOf(ReservationNotHeldError);
    });

    it('lets exactly one of two concurrent orders take the last unit', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 1);

      const takeTheLastOne = () =>
        dataSource.transaction((manager) =>
          inventory.reserve(
            nyc.id,
            [{ productId: shirt.id, quantity: 1 }],
            manager,
          ),
        );

      const outcomes = await Promise.allSettled([
        takeTheLastOne(),
        takeTheLastOne(),
      ]);

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
      await expect(availability(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 1,
        reserved: 1,
        available: 0,
      });
    });

    it('never oversells under sustained concurrency', async () => {
      const shirt = await aProduct('SHIRT');
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);

      const attempts = Array.from({ length: 25 }, () =>
        dataSource.transaction((manager) =>
          inventory.reserve(
            nyc.id,
            [{ productId: shirt.id, quantity: 1 }],
            manager,
          ),
        ),
      );
      const outcomes = await Promise.allSettled(attempts);

      const won = outcomes.filter((o) => o.status === 'fulfilled').length;
      expect(won).toBe(10);
      await expect(availability(nyc.id, shirt.id)).resolves.toEqual({
        onHand: 10,
        reserved: 10,
        available: 0,
      });
    });

    it('does not deadlock when two orders list the same products in opposite order', async () => {
      const [shirt, hat] = await Promise.all([
        aProduct('SHIRT'),
        aProduct('HAT'),
      ]);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await stock(nyc.id, shirt.id, 10);
      await stock(nyc.id, hat.id, 10);

      const forward = dataSource.transaction((m) =>
        inventory.reserve(
          nyc.id,
          [
            { productId: shirt.id, quantity: 1 },
            { productId: hat.id, quantity: 1 },
          ],
          m,
        ),
      );
      const reversed = dataSource.transaction((m) =>
        inventory.reserve(
          nyc.id,
          [
            { productId: hat.id, quantity: 1 },
            { productId: shirt.id, quantity: 1 },
          ],
          m,
        ),
      );

      await expect(Promise.all([forward, reversed])).resolves.toHaveLength(2);
      await expect(availability(nyc.id, shirt.id)).resolves.toMatchObject({
        reserved: 2,
      });
    });
  });

  describe('OrdersRepository', () => {
    const newOrder = async (idempotencyKey = 'key-1') => {
      const [customer, shirt] = await Promise.all([
        aCustomer(),
        aProduct('SHIRT', 1999),
      ]);
      return {
        customer,
        shirt,
        input: {
          customerId: customer.id,
          idempotencyKey,
          shippingAddress: SHIPPING,
          shippingLocation: geoPoint(NEW_YORK.longitude, NEW_YORK.latitude),
          totalCents: 3998,
          lines: [{ productId: shirt.id, quantity: 2, unitPriceCents: 1999 }],
        },
      };
    };

    it('records a pending order with its lines', async () => {
      const { input } = await newOrder();

      const saved = await orders.insertPending(input);

      expect(saved.status).toBe(OrderStatus.Pending);
      expect(saved.warehouseId).toBeNull();
      const loaded = await orders.findByIdWithItems(saved.id);
      expect(loaded?.items).toHaveLength(1);
      expect(loaded?.items[0].unitPriceCents).toBe(1999);
      expect(loaded?.shippingLocation?.coordinates).toEqual([
        NEW_YORK.longitude,
        NEW_YORK.latitude,
      ]);
    });

    it('rejects a replay of the same idempotency key', async () => {
      const { input } = await newOrder();
      await orders.insertPending(input);

      await expect(orders.insertPending(input)).rejects.toBeInstanceOf(
        IdempotencyConflictError,
      );
    });

    it('rejects an order for a customer that does not exist', async () => {
      const { input } = await newOrder();

      await expect(
        orders.insertPending({
          ...input,
          customerId: '019fda00-0000-7000-8000-0000000000ff',
        }),
      ).rejects.toBeInstanceOf(CustomerNotFoundError);
    });

    it('finds the original order behind a replay', async () => {
      const { input } = await newOrder('replayed');
      const saved = await orders.insertPending(input);

      const found = await orders.findByIdempotencyKey(
        input.customerId,
        'replayed',
      );

      expect(found?.id).toBe(saved.id);
    });

    it('confirms an order with its warehouse and payment reference', async () => {
      const { input } = await newOrder();
      const saved = await orders.insertPending(input);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);

      await dataSource.transaction((m) =>
        orders.markConfirmed(saved.id, nyc.id, 'pay_123', m),
      );

      const loaded = await orders.findByIdWithItems(saved.id);
      expect(loaded?.status).toBe(OrderStatus.Confirmed);
      expect(loaded?.warehouse?.code).toBe('WH-NYC');
      expect(loaded?.paymentReference).toBe('pay_123');
      expect(loaded?.failureReason).toBeNull();
    });

    it('fails an order with a reason', async () => {
      const { input } = await newOrder();
      const saved = await orders.insertPending(input);

      await dataSource.transaction((m) =>
        orders.markFailed(saved.id, OrderFailureReason.PaymentDeclined, m),
      );

      const loaded = await orders.findByIdWithItems(saved.id);
      expect(loaded?.status).toBe(OrderStatus.Failed);
      expect(loaded?.failureReason).toBe(OrderFailureReason.PaymentDeclined);
    });

    it('refuses to settle an order that is already settled', async () => {
      const { input } = await newOrder();
      const saved = await orders.insertPending(input);
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);
      await dataSource.transaction((m) =>
        orders.markFailed(saved.id, OrderFailureReason.PaymentDeclined, m),
      );

      await expect(
        dataSource.transaction((m) =>
          orders.markConfirmed(saved.id, nyc.id, 'pay_456', m),
        ),
      ).rejects.toBeInstanceOf(OrderNotPendingError);

      const loaded = await dataSource.manager.findOneByOrFail(Order, {
        id: saved.id,
      });
      expect(loaded.status).toBe(OrderStatus.Failed);
    });

    it('refuses to confirm an order that does not exist', async () => {
      const nyc = await aWarehouse('WH-NYC', NEW_YORK);

      await expect(
        dataSource.transaction((m) =>
          orders.markConfirmed(
            '019fda00-0000-7000-8000-0000000000ff',
            nyc.id,
            'pay_789',
            m,
          ),
        ),
      ).rejects.toBeInstanceOf(OrderNotPendingError);
    });

    it('does not report an unknown product as a missing customer', async () => {
      const { input } = await newOrder();

      const error: unknown = await orders
        .insertPending({
          ...input,
          lines: [
            {
              productId: '019fda00-0000-7000-8000-0000000000fe',
              quantity: 1,
              unitPriceCents: 100,
            },
          ],
        })
        .catch((caught: unknown) => caught);

      expect(error).not.toBeInstanceOf(CustomerNotFoundError);
      expect(error).toBeInstanceOf(QueryFailedError);
    });
  });
});
