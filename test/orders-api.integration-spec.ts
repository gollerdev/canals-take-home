import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http/configure-app';
import { geoPoint } from '../src/common/types/geo-point';
import { Customer } from '../src/customers/entities/customer.entity';
import { InventoryItem } from '../src/inventory/entities/inventory-item.entity';
import { Warehouse } from '../src/inventory/entities/warehouse.entity';
import { Product } from '../src/products/entities/product.entity';
import type { OrderResponseDto } from '../src/orders/dto/order-response.dto';
import { truncateAll } from './setup/test-data-source';

const NEW_YORK = { longitude: -74.006, latitude: 40.7128 };
const GOOD_CARD = '4242424242424242';
const NO_FUNDS_CARD = '4000000000009995';

const SHIPPING = {
  line1: '1 Main Street',
  city: 'New York',
  region: 'NY',
  postalCode: '10001',
  country: 'US',
};

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
}

const asOrder = (response: request.Response): OrderResponseDto =>
  response.body as OrderResponseDto;

const asError = (response: request.Response): ErrorResponse =>
  response.body as ErrorResponse;

describe('orders API', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let customerId: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const manager = dataSource.manager;
    const [customer, product, warehouse] = await Promise.all([
      manager.save(
        manager.create(Customer, { email: 'ana@example.com', name: 'Ana' }),
      ),
      manager.save(
        manager.create(Product, {
          sku: 'TSHIRT-BLK-M',
          name: 'Black T-Shirt',
          priceCents: 1999,
        }),
      ),
      manager.save(
        manager.create(Warehouse, {
          code: 'WH-NYC',
          name: 'New York DC',
          address: { ...SHIPPING, line2: null },
          location: geoPoint(NEW_YORK.longitude, NEW_YORK.latitude),
        }),
      ),
    ]);

    customerId = customer.id;
    productId = product.id;
    warehouseId = warehouse.id;

    await manager.save(
      manager.create(InventoryItem, {
        warehouseId,
        productId,
        quantityOnHand: 10,
      }),
    );
  });

  const body = (overrides: Record<string, unknown> = {}) => ({
    customerId,
    cardNumber: GOOD_CARD,
    shippingAddress: SHIPPING,
    items: [{ productId, quantity: 2 }],
    ...overrides,
  });

  const post = (key = 'checkout-1') =>
    request(app.getHttpServer()).post('/orders').set('Idempotency-Key', key);

  describe('POST /orders', () => {
    it('creates the order and returns it', async () => {
      const response = await post().send(body()).expect(201);

      expect(response.body).toMatchObject({
        status: 'confirmed',
        totalCents: 3998,
        currency: 'USD',
        warehouse: { code: 'WH-NYC', name: 'New York DC' },
        items: [{ sku: 'TSHIRT-BLK-M', quantity: 2, unitPriceCents: 1999 }],
      });
      expect(asOrder(response).paymentReference).toMatch(/^ch_/);
      expect(asOrder(response).id).toEqual(expect.any(String));
    });

    it('never echoes the card number', async () => {
      const response = await post().send(body()).expect(201);

      expect(JSON.stringify(response.body)).not.toContain(GOOD_CARD);
    });

    it('returns 200 on a replay of the same key', async () => {
      const first = await post().send(body()).expect(201);
      const second = await post().send(body()).expect(200);

      expect(asOrder(second).id).toBe(asOrder(first).id);
    });

    it('repeats the original status when replaying a failed order', async () => {
      await post('declined-1')
        .send(body({ cardNumber: NO_FUNDS_CARD }))
        .expect(402);
      await post('declined-1')
        .send(body({ cardNumber: NO_FUNDS_CARD }))
        .expect(402);

      await post('no-stock-1')
        .send(body({ items: [{ productId, quantity: 99 }] }))
        .expect(409);
      await post('no-stock-1')
        .send(body({ items: [{ productId, quantity: 99 }] }))
        .expect(409);
    });

    it('returns 402 when the card is declined', async () => {
      const response = await post()
        .send(body({ cardNumber: NO_FUNDS_CARD }))
        .expect(402);

      expect(response.body).toMatchObject({
        status: 'failed',
        failureReason: 'payment_declined',
      });
    });

    it('returns 409 when no warehouse can fill the order', async () => {
      const response = await post()
        .send(body({ items: [{ productId, quantity: 99 }] }))
        .expect(409);

      expect(response.body).toMatchObject({
        status: 'failed',
        failureReason: 'no_warehouse_available',
      });
    });

    it('accepts a lowercase country and normalises it', async () => {
      const response = await post()
        .send(body({ shippingAddress: { ...SHIPPING, country: 'us' } }))
        .expect(201);

      expect(asOrder(response).shippingAddress.country).toBe('US');
    });
  });

  // These cases are unreachable by the service's own guards, so they pass only
  // when the ValidationPipe is genuinely wired to the request DTO.
  describe('request validation', () => {
    const messagesOf = async (payload: Record<string, unknown>) => {
      const response = await post().send(payload).expect(400);
      const { message } = asError(response);
      return Array.isArray(message) ? message.join(' | ') : message;
    };

    describe('unknown fields', () => {
      it('rejects one at the top level', async () => {
        await expect(messagesOf(body({ sneaky: true }))).resolves.toContain(
          'sneaky',
        );
      });

      it('rejects one inside the address', async () => {
        await expect(
          messagesOf(
            body({ shippingAddress: { ...SHIPPING, planet: 'Mars' } }),
          ),
        ).resolves.toContain('planet');
      });

      it('rejects one inside an item', async () => {
        await expect(
          messagesOf(body({ items: [{ productId, quantity: 1, free: true }] })),
        ).resolves.toContain('free');
      });
    });

    describe('missing required fields', () => {
      it.each(['cardNumber', 'shippingAddress', 'items', 'customerId'])(
        'rejects a body with no %s',
        async (field) => {
          const payload = body();
          delete (payload as Record<string, unknown>)[field];

          await expect(messagesOf(payload)).resolves.toContain(field);
        },
      );
    });

    describe('wrong types', () => {
      it('rejects a quantity that is not a number', async () => {
        await expect(
          messagesOf(body({ items: [{ productId, quantity: 'two' }] })),
        ).resolves.toContain('quantity');
      });

      it('rejects a fractional quantity', async () => {
        await expect(
          messagesOf(body({ items: [{ productId, quantity: 1.5 }] })),
        ).resolves.toContain('integer');
      });

      it('rejects a customerId that is not a uuid', async () => {
        await expect(
          messagesOf(body({ customerId: 'not-a-uuid' })),
        ).resolves.toContain('UUID');
      });

      it('rejects items that are not an array', async () => {
        await expect(
          messagesOf(body({ items: 'everything' })),
        ).resolves.toContain('items');
      });
    });

    describe('bounds', () => {
      it('rejects a quantity above the per-line cap', async () => {
        await expect(
          messagesOf(body({ items: [{ productId, quantity: 1001 }] })),
        ).resolves.toContain('quantity');
      });

      it('rejects more than fifty lines', async () => {
        const items = Array.from({ length: 51 }, () => ({
          productId,
          quantity: 1,
        }));

        await expect(messagesOf(body({ items }))).resolves.toContain('items');
      });

      it('rejects an over-long card number', async () => {
        await expect(
          messagesOf(body({ cardNumber: '4'.repeat(26) })),
        ).resolves.toContain('cardNumber');
      });
    });

    describe('the shipping address', () => {
      it.each(['line1', 'city'])('requires %s', async (field) => {
        const shippingAddress: Record<string, unknown> = { ...SHIPPING };
        delete shippingAddress[field];

        await expect(messagesOf(body({ shippingAddress }))).resolves.toContain(
          field,
        );
      });

      it('rejects a blank line1', async () => {
        await expect(
          messagesOf(body({ shippingAddress: { ...SHIPPING, line1: '   ' } })),
        ).resolves.toContain('line1');
      });

      it('rejects a three-letter country', async () => {
        await expect(
          messagesOf(
            body({ shippingAddress: { ...SHIPPING, country: 'USA' } }),
          ),
        ).resolves.toContain('country');
      });

      it('trims whitespace from the fields it keeps', async () => {
        const response = await post()
          .send(
            body({
              shippingAddress: { ...SHIPPING, line1: '  1 Main Street  ' },
            }),
          )
          .expect(201);

        expect(asOrder(response).shippingAddress.line1).toBe('1 Main Street');
      });
    });
  });

  describe('rejected requests', () => {
    it('requires the Idempotency-Key header', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .send(body())
        .expect(400);

      expect(asError(response).message).toContain('Idempotency-Key');
    });

    it('rejects a malformed body', async () => {
      await post()
        .send(body({ customerId: 'not-a-uuid' }))
        .expect(400);
    });

    it('rejects an unknown field', async () => {
      await post()
        .send(body({ sneaky: true }))
        .expect(400);
    });

    it('rejects a zero quantity', async () => {
      await post()
        .send(body({ items: [{ productId, quantity: 0 }] }))
        .expect(400);
    });

    it('rejects an empty basket', async () => {
      await post()
        .send(body({ items: [] }))
        .expect(400);
    });

    it('reports an unknown product as 400, not 500', async () => {
      const response = await post()
        .send({
          ...body(),
          items: [
            {
              productId: '019fda00-0000-7000-8000-0000000000ff',
              quantity: 1,
            },
          ],
        })
        .expect(400);

      expect(asError(response).error).toBe('UnknownProductsError');
    });

    it('reports an unknown customer as 404', async () => {
      await post()
        .send(body({ customerId: '019fda00-0000-7000-8000-0000000000ff' }))
        .expect(404);
    });
  });

  describe('GET /orders/:id', () => {
    it('reads an order back', async () => {
      const created = await post().send(body()).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/orders/${asOrder(created).id}`)
        .expect(200);

      expect(response.body).toEqual(created.body);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get('/orders/019fda00-0000-7000-8000-0000000000ff')
        .expect(404);
    });

    it('returns 400 for an id that is not a uuid', async () => {
      await request(app.getHttpServer()).get('/orders/nonsense').expect(400);
    });
  });

  it('does not advertise the server framework', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
