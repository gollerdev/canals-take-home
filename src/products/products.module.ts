import { Module } from '@nestjs/common';

import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

@Module({
  providers: [ProductsRepository, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
