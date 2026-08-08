import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

import type { Env } from '../config/env.schema';
import { SnakeEmbeddedNamingStrategy } from './snake-embedded.naming-strategy';

type DatabaseEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_USERNAME'
  | 'DB_PASSWORD'
  | 'DB_DATABASE'
  | 'DB_POOL_SIZE'
>;

export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    synchronize: false,
    migrationsRun: false,
    namingStrategy: new SnakeEmbeddedNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    migrationsTableName: 'migrations',
    migrationsTransactionMode: 'each',
    logging:
      env.NODE_ENV === 'development'
        ? ['error', 'warn', 'migration']
        : ['error', 'warn'],
    extra: {
      max: env.DB_POOL_SIZE,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'canals-take-home',
    },
  };
}
