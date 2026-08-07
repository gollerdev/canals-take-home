import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { Address } from '../src/common/entities/address.embedded';
import { geoPoint } from '../src/common/types/geo-point';
import { Customer } from '../src/customers/entities/customer.entity';
import { InventoryItem } from '../src/inventory/entities/inventory-item.entity';
import { Warehouse } from '../src/inventory/entities/warehouse.entity';
import { OrderItem } from '../src/orders/entities/order-item.entity';
import {
  OrderFailureReason,
  OrderStatus,
} from '../src/orders/entities/order-status.enum';
import { Order } from '../src/orders/entities/order.entity';
import { Product } from '../src/products/entities/product.entity';
import { createTestDataSource, truncateAll } from './setup/test-data-source';

const NEW_YORK = { longitude: -74.006, latitude: 40.7128 };

function address(overrides: Partial<Address> = {}): Address {
  return {
    line1: '1 Main Street',
    line2: null,
    city: 'New York',
    region: 'NY',
    postalCode: '10001',
    country: 'US',
    ...overrides,
  };
}

async function constraintViolated(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof QueryFailedError) {
      return (error.driverError as { constraint?: string }).constraint ?? '';
    }
    throw error;
  }
  throw new Error(
    'expected the database to reject this write, but it succeeded',
  );
}

describe('domain model', () => {
  let dataSource: DataSource;
  let customers: Repository<Customer>;
  let products: Repository<Product>;
  let warehouses: Repository<Warehouse>;
  let inventory: Repository<InventoryItem>;
  let orders: Repository<Order>;
  let orderItems: Repository<OrderItem>;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
    customers = dataSource.getRepository(Customer);
    products = dataSource.getRepository(Product);
    warehouses = dataSource.getRepository(Warehouse);
    inventory = dataSource.getRepository(InventoryItem);
    orders = dataSource.getRepository(Order);
    orderItems = dataSource.getRepository(OrderItem);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  const aCustomer = () =>
    customers.save(customers.create({ email: 'ana@example.com', name: 'Ana' }));

  const aProduct = (sku = 'TSHIRT-BLK-M', priceCents = 1999) =>
    products.save(products.create({ sku, name: 'Black T-Shirt', priceCents }));

  const aWarehouse = (code = 'WH-NYC') =>
    warehouses.save(
      warehouses.create({
        code,
        name: 'New York DC',
        address: address(),
        location: geoPoint(NEW_YORK.longitude, NEW_YORK.latitude),
      }),
    );

  describe('identifiers and timestamps', () => {
    it('assigns a version 7 uuid on insert', async () => {
      const customer = await aCustomer();

      expect(customer.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('generates identifiers that sort in creation order', async () => {
      const created: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const product = await aProduct(`SKU-${i}`);
        created.push(product.id);
      }

      expect([...created].sort()).toEqual(created);
    });

    it('populates created_at and updated_at', async () => {
      const customer = await aCustomer();

      expect(customer.createdAt).toBeInstanceOf(Date);
      expect(customer.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('warehouse geography', () => {
    it('round-trips a point without swapping longitude and latitude', async () => {
      const saved = await aWarehouse();
      const loaded = await warehouses.findOneByOrFail({ id: saved.id });

      expect(loaded.location.coordinates).toEqual([
        NEW_YORK.longitude,
        NEW_YORK.latitude,
      ]);
    });

    it('stores longitude as X and latitude as Y in PostGIS', async () => {
      const saved = await aWarehouse();

      const [row] = await dataSource.query<Array<{ x: number; y: number }>>(
        `SELECT ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y
           FROM warehouses WHERE id = $1`,
        [saved.id],
      );

      expect(row.x).toBeCloseTo(NEW_YORK.longitude, 6);
      expect(row.y).toBeCloseTo(NEW_YORK.latitude, 6);
    });

    it('measures distance in metres', async () => {
      await aWarehouse();

      const [row] = await dataSource.query<Array<{ metres: number }>>(
        `SELECT location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS metres
           FROM warehouses`,
        [-73.9857, 40.7484],
      );

      expect(row.metres).toBeGreaterThan(4_000);
      expect(row.metres).toBeLessThan(5_000);
    });
  });

  describe('embedded address', () => {
    it('maps to snake_case columns rather than camelCase', async () => {
      const saved = await aWarehouse();

      const [row] = await dataSource.query<Array<Record<string, string>>>(
        `SELECT address_line1, address_city, address_postal_code, address_country
           FROM warehouses WHERE id = $1`,
        [saved.id],
      );

      expect(row).toEqual({
        address_line1: '1 Main Street',
        address_city: 'New York',
        address_postal_code: '10001',
        address_country: 'US',
      });
    });

    it('reads back as a nested object', async () => {
      const saved = await aWarehouse();
      const loaded = await warehouses.findOneByOrFail({ id: saved.id });

      expect(loaded.address.line1).toBe('1 Main Street');
      expect(loaded.address.line2).toBeNull();
      expect(loaded.address.country).toBe('US');
    });
  });

  describe('inventory items', () => {
    it('is keyed by the warehouse and product pair', async () => {
      const [warehouse, product] = await Promise.all([
        aWarehouse(),
        aProduct(),
      ]);
      await inventory.save(
        inventory.create({
          warehouseId: warehouse.id,
          productId: product.id,
          quantityOnHand: 10,
        }),
      );

      const loaded = await inventory.findOneOrFail({
        where: { warehouseId: warehouse.id, productId: product.id },
        relations: { warehouse: true, product: true },
      });

      expect(loaded.quantityOnHand).toBe(10);
      expect(loaded.quantityReserved).toBe(0);
      expect(loaded.warehouse.code).toBe('WH-NYC');
      expect(loaded.product.sku).toBe('TSHIRT-BLK-M');
    });

    it('rejects a second row for the same warehouse and product', async () => {
      const [warehouse, product] = await Promise.all([
        aWarehouse(),
        aProduct(),
      ]);
      const row = {
        warehouseId: warehouse.id,
        productId: product.id,
        quantityOnHand: 5,
      };
      await inventory.insert(row);

      await expect(inventory.insert(row)).rejects.toBeInstanceOf(
        QueryFailedError,
      );
    });

    it('retrieves every stocked product for a warehouse', async () => {
      const warehouse = await aWarehouse();
      const stocked = await Promise.all([
        aProduct('SKU-A'),
        aProduct('SKU-B'),
        aProduct('SKU-C'),
      ]);
      await inventory.save(
        stocked.map((product, index) =>
          inventory.create({
            warehouseId: warehouse.id,
            productId: product.id,
            quantityOnHand: (index + 1) * 10,
          }),
        ),
      );

      const items = await inventory.find({
        where: { warehouseId: warehouse.id },
        relations: { product: true },
        order: { product: { sku: 'ASC' } },
      });

      expect(items.map((item) => item.product.sku)).toEqual([
        'SKU-A',
        'SKU-B',
        'SKU-C',
      ]);
      expect(items.map((item) => item.quantityOnHand)).toEqual([10, 20, 30]);
    });

    it('retrieves every warehouse stocking a product', async () => {
      const product = await aProduct();
      const stocking = await Promise.all([
        aWarehouse('WH-NYC'),
        aWarehouse('WH-LAX'),
      ]);
      const elsewhere = await aWarehouse('WH-CHI');
      await inventory.save(
        stocking.map((warehouse) =>
          inventory.create({
            warehouseId: warehouse.id,
            productId: product.id,
            quantityOnHand: 5,
          }),
        ),
      );

      const items = await inventory.find({
        where: { productId: product.id },
        relations: { warehouse: true },
      });

      const codes = items.map((item) => item.warehouse.code).sort();
      expect(codes).toEqual(['WH-LAX', 'WH-NYC']);
      expect(codes).not.toContain(elsewhere.code);
    });

    it('removes stock rows when its warehouse is deleted', async () => {
      const [warehouse, product] = await Promise.all([
        aWarehouse(),
        aProduct(),
      ]);
      await inventory.insert({
        warehouseId: warehouse.id,
        productId: product.id,
        quantityOnHand: 5,
      });

      await warehouses.delete({ id: warehouse.id });

      await expect(
        inventory.countBy({ warehouseId: warehouse.id }),
      ).resolves.toBe(0);
    });
  });

  describe('orders', () => {
    const anOrder = async (overrides: Partial<Order> = {}) => {
      const [customer, product] = await Promise.all([aCustomer(), aProduct()]);
      return orders.save(
        orders.create({
          customerId: customer.id,
          idempotencyKey: 'key-1',
          totalCents: 3998,
          shippingAddress: address(),
          items: [
            orderItems.create({
              productId: product.id,
              quantity: 2,
              unitPriceCents: 1999,
            }),
          ],
          ...overrides,
        }),
      );
    };

    it('cascades line items on insert', async () => {
      const saved = await anOrder();

      const loaded = await orders.findOneOrFail({
        where: { id: saved.id },
        relations: { items: { product: true }, customer: true },
      });

      expect(loaded.status).toBe(OrderStatus.Pending);
      expect(loaded.warehouseId).toBeNull();
      expect(loaded.items).toHaveLength(1);
      expect(loaded.items[0].quantity).toBe(2);
      expect(loaded.items[0].unitPriceCents).toBe(1999);
      expect(loaded.items[0].product.sku).toBe('TSHIRT-BLK-M');
      expect(loaded.customer.email).toBe('ana@example.com');
    });

    it('carries several distinct products on one order', async () => {
      const [customer, first, second] = await Promise.all([
        aCustomer(),
        aProduct('SKU-A', 1000),
        aProduct('SKU-B', 2500),
      ]);

      const saved = await orders.save(
        orders.create({
          customerId: customer.id,
          idempotencyKey: 'multi-line',
          totalCents: 1000 * 2 + 2500,
          shippingAddress: address(),
          items: [
            orderItems.create({
              productId: first.id,
              quantity: 2,
              unitPriceCents: 1000,
            }),
            orderItems.create({
              productId: second.id,
              quantity: 1,
              unitPriceCents: 2500,
            }),
          ],
        }),
      );

      const loaded = await orders.findOneOrFail({
        where: { id: saved.id },
        relations: { items: { product: true } },
      });
      const total = loaded.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0,
      );

      expect(loaded.items).toHaveLength(2);
      expect(total).toBe(loaded.totalCents);
    });

    it('resolves the warehouse once one is assigned', async () => {
      const [saved, warehouse] = await Promise.all([anOrder(), aWarehouse()]);
      await orders.update(
        { id: saved.id },
        {
          warehouseId: warehouse.id,
          paymentReference: 'pay_123',
          status: OrderStatus.Confirmed,
        },
      );

      const loaded = await orders.findOneOrFail({
        where: { id: saved.id },
        relations: { warehouse: true },
      });

      expect(loaded.status).toBe(OrderStatus.Confirmed);
      expect(loaded.warehouse?.code).toBe('WH-NYC');
      expect(loaded.warehouse?.location.coordinates).toEqual([
        NEW_YORK.longitude,
        NEW_YORK.latitude,
      ]);
    });

    it('deletes line items along with the order', async () => {
      const saved = await anOrder();
      await orders.delete({ id: saved.id });

      await expect(orderItems.countBy({ orderId: saved.id })).resolves.toBe(0);
    });

    it('refuses to delete a product that appears on an order', async () => {
      const saved = await anOrder();
      const [item] = await orderItems.findBy({ orderId: saved.id });

      const constraint = await constraintViolated(
        products.delete({ id: item.productId }),
      );

      expect(constraint).toContain('FK');
    });
  });

  describe('constraints the database enforces', () => {
    it('refuses to reserve more stock than is on hand', async () => {
      const [warehouse, product] = await Promise.all([
        aWarehouse(),
        aProduct(),
      ]);
      await inventory.insert({
        warehouseId: warehouse.id,
        productId: product.id,
        quantityOnHand: 5,
        quantityReserved: 0,
      });

      const constraint = await constraintViolated(
        dataSource.query(`UPDATE inventory_items SET quantity_reserved = 6`),
      );

      expect(constraint).toBe('inventory_not_oversold');
    });

    it('refuses a negative reservation', async () => {
      const [warehouse, product] = await Promise.all([
        aWarehouse(),
        aProduct(),
      ]);
      await inventory.insert({
        warehouseId: warehouse.id,
        productId: product.id,
        quantityOnHand: 5,
      });

      const constraint = await constraintViolated(
        dataSource.query(`UPDATE inventory_items SET quantity_reserved = -1`),
      );

      expect(constraint).toBe('inventory_reserved_non_negative');
    });

    it('refuses a negative product price', async () => {
      const constraint = await constraintViolated(
        products.insert(
          products.create({ sku: 'BAD', name: 'Bad', priceCents: -1 }),
        ),
      );

      expect(constraint).toBe('products_price_non_negative');
    });

    it('refuses a country code that is not ISO alpha-2', async () => {
      const constraint = await constraintViolated(
        warehouses.insert(
          warehouses.create({
            code: 'WH-BAD',
            name: 'Bad',
            address: address({ country: 'us' }),
            location: geoPoint(0, 0),
          }),
        ),
      );

      expect(constraint).toBe('warehouses_country_is_iso_alpha2');
    });

    it('refuses a confirmed order with no payment reference', async () => {
      const [customer, warehouse] = await Promise.all([
        aCustomer(),
        aWarehouse(),
      ]);

      const constraint = await constraintViolated(
        orders.insert(
          orders.create({
            customerId: customer.id,
            warehouseId: warehouse.id,
            idempotencyKey: 'confirmed-no-payment',
            status: OrderStatus.Confirmed,
            totalCents: 1999,
            shippingAddress: address(),
          }),
        ),
      );

      expect(constraint).toBe('orders_confirmed_is_complete');
    });

    it('refuses a failed order with no reason', async () => {
      const customer = await aCustomer();

      const constraint = await constraintViolated(
        orders.insert(
          orders.create({
            customerId: customer.id,
            idempotencyKey: 'failed-no-reason',
            status: OrderStatus.Failed,
            totalCents: 1999,
            shippingAddress: address(),
          }),
        ),
      );

      expect(constraint).toBe('orders_failed_has_reason');
    });

    it('accepts a failed order that states its reason', async () => {
      const customer = await aCustomer();

      const saved = await orders.save(
        orders.create({
          customerId: customer.id,
          idempotencyKey: 'failed-with-reason',
          status: OrderStatus.Failed,
          failureReason: OrderFailureReason.PaymentDeclined,
          totalCents: 1999,
          shippingAddress: address(),
        }),
      );

      expect(saved.failureReason).toBe(OrderFailureReason.PaymentDeclined);
    });

    it('refuses the same idempotency key twice for one customer', async () => {
      const customer = await aCustomer();
      const order = {
        customerId: customer.id,
        idempotencyKey: 'duplicate',
        totalCents: 1999,
        shippingAddress: address(),
      };
      await orders.insert(orders.create(order));

      const constraint = await constraintViolated(
        orders.insert(orders.create(order)),
      );

      expect(constraint).toBe('orders_idempotency_unique');
    });

    it('allows two customers to use the same idempotency key', async () => {
      const [first, second] = await Promise.all([
        customers.save(customers.create({ email: 'a@x.com', name: 'A' })),
        customers.save(customers.create({ email: 'b@x.com', name: 'B' })),
      ]);

      for (const customerId of [first.id, second.id]) {
        await orders.insert(
          orders.create({
            customerId,
            idempotencyKey: 'shared',
            totalCents: 1999,
            shippingAddress: address(),
          }),
        );
      }

      await expect(orders.countBy({ idempotencyKey: 'shared' })).resolves.toBe(
        2,
      );
    });

    it('refuses the same product twice on one order', async () => {
      const [customer, product] = await Promise.all([aCustomer(), aProduct()]);
      const order = await orders.save(
        orders.create({
          customerId: customer.id,
          idempotencyKey: 'duplicate-line',
          totalCents: 1999,
          shippingAddress: address(),
        }),
      );
      const line = {
        orderId: order.id,
        productId: product.id,
        quantity: 1,
        unitPriceCents: 1999,
      };
      await orderItems.insert(line);

      await expect(orderItems.insert(line)).rejects.toBeInstanceOf(
        QueryFailedError,
      );
    });

    it('refuses a zero quantity line', async () => {
      const [customer, product] = await Promise.all([aCustomer(), aProduct()]);
      const order = await orders.save(
        orders.create({
          customerId: customer.id,
          idempotencyKey: 'zero-quantity',
          totalCents: 0,
          shippingAddress: address(),
        }),
      );

      const constraint = await constraintViolated(
        orderItems.insert({
          orderId: order.id,
          productId: product.id,
          quantity: 0,
          unitPriceCents: 1999,
        }),
      );

      expect(constraint).toBe('order_items_quantity_positive');
    });

    it('refuses an order for a customer that does not exist', async () => {
      const constraint = await constraintViolated(
        orders.insert(
          orders.create({
            customerId: '019fda00-0000-7000-8000-0000000000ff',
            idempotencyKey: 'missing-customer',
            totalCents: 1999,
            shippingAddress: address(),
          }),
        ),
      );

      expect(constraint).toContain('FK');
    });
  });
});
