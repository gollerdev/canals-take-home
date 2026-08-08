import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http/configure-app';
import { InventoryItem } from '../src/inventory/entities/inventory-item.entity';
import { seedDatabase } from '../src/database/seed/seed';
import {
  CUSTOMERS,
  PRODUCTS,
  STOCK,
  WAREHOUSES,
} from '../src/database/seed/seed-fixtures';
import type { OrderResponseDto } from '../src/orders/dto/order-response.dto';
import { truncateAll } from './setup/test-data-source';

const ANA = CUSTOMERS[0].id;
const GOOD_CARD = '4242424242424242';

const idOf = (sku: string): string =>
  PRODUCTS.find((product) => product.sku === sku)!.id;

const NEW_YORK = {
  line1: '350 Fifth Avenue',
  city: 'New York',
  region: 'NY',
  postalCode: '10118',
  country: 'US',
};

const asOrder = (response: request.Response): OrderResponseDto =>
  response.body as OrderResponseDto;

describe('seed data', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let key = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);

    await truncateAll(dataSource);
    await seedDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const order = (items: { productId: string; quantity: number }[]) => {
    key += 1;

    return request(app.getHttpServer())
      .post('/orders')
      .set('Idempotency-Key', `seed-spec-${key}`)
      .send({
        customerId: ANA,
        cardNumber: GOOD_CARD,
        shippingAddress: NEW_YORK,
        items,
      });
  };

  describe('seeding', () => {
    it('loads every fixture', async () => {
      const summary = await seedDatabase(dataSource);

      expect(summary).toEqual({
        customers: CUSTOMERS.length,
        products: PRODUCTS.length,
        warehouses: WAREHOUSES.length,
        stock: STOCK.length,
      });
    });

    it('is idempotent', async () => {
      const first = await seedDatabase(dataSource);
      const second = await seedDatabase(dataSource);

      expect(second).toEqual(first);
    });

    it('never resets stock that orders have already moved', async () => {
      const where = {
        warehouseId: WAREHOUSES[0].id,
        productId: idOf('TSHIRT-BLK-M'),
      };
      const repository = dataSource.getRepository(InventoryItem);

      await repository.update(where, { quantityOnHand: 3 });
      await seedDatabase(dataSource);

      const item = await repository.findOneByOrFail(where);
      expect(item.quantityOnHand).toBe(3);

      await repository.update(where, { quantityOnHand: 40 });
    });
  });

  describe('the fixtures demonstrate warehouse selection', () => {
    it('uses the nearest warehouse when it holds the whole order', async () => {
      const response = await order([
        { productId: idOf('TSHIRT-BLK-M'), quantity: 2 },
      ]).expect(201);

      expect(asOrder(response).warehouse?.code).toBe('WH-NYC');
    });

    it('skips the nearest warehouse when it is missing one line', async () => {
      const response = await order([
        { productId: idOf('TSHIRT-BLK-M'), quantity: 2 },
        { productId: idOf('CAP-NVY'), quantity: 1 },
      ]).expect(201);

      expect(asOrder(response).warehouse?.code).toBe('WH-PHL');
    });

    it('never picks the decommissioned warehouse', async () => {
      await order([{ productId: idOf('LIMITED-EDT'), quantity: 2 }]).expect(
        409,
      );

      const response = await order([
        { productId: idOf('LIMITED-EDT'), quantity: 1 },
      ]).expect(201);

      expect(asOrder(response).warehouse?.code).toBe('WH-NYC');
    });

    it('fails when no warehouse stocks the product at all', async () => {
      await order([{ productId: idOf('BACKORDER-01'), quantity: 1 }]).expect(
        409,
      );
    });
  });
});
