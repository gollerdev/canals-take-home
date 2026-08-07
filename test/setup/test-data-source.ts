import { DataSource, type DataSourceOptions } from 'typeorm';

import { validateEnv } from '../../src/config/env.schema';
import { buildDataSourceOptions } from '../../src/database/data-source.options';

export const TEST_DATABASE =
  process.env.TEST_DB_DATABASE ?? 'canals_orders_test';

export function testDataSourceOptions(
  database = TEST_DATABASE,
): DataSourceOptions {
  const env = validateEnv({
    NODE_ENV: 'test',
    PORT: process.env.PORT ?? '3000',
    DB_HOST: process.env.DB_HOST ?? 'localhost',
    DB_PORT: process.env.DB_PORT ?? '5433',
    DB_USERNAME: process.env.DB_USERNAME ?? 'canals',
    DB_PASSWORD: process.env.DB_PASSWORD ?? 'canals',
    DB_DATABASE: database,
    DB_POOL_SIZE: process.env.DB_POOL_SIZE ?? '5',
  });

  return { ...buildDataSourceOptions(env), logging: false };
}

export function createTestDataSource(): DataSource {
  return new DataSource(testDataSourceOptions());
}

const TABLES = [
  'order_items',
  'orders',
  'inventory_items',
  'warehouses',
  'products',
  'customers',
];

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
