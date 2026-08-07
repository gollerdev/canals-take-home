import { Module } from '@nestjs/common';

import { ProductsRepository } from './products.repository';

@Module({
  providers: [ProductsRepository],
  exports: [ProductsRepository],
})
export class ProductsModule {}
