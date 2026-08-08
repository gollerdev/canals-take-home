import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '../config/env.schema';
import { buildDataSourceOptions } from './data-source.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USERNAME: config.get('DB_USERNAME', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_DATABASE: config.get('DB_DATABASE', { infer: true }),
          DB_POOL_SIZE: config.get('DB_POOL_SIZE', { infer: true }),
        }),
    }),
  ],
})
export class DatabaseModule {}
