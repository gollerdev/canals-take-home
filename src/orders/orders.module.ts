import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { OrdersRepository } from './orders.repository';

@Module({
  imports: [ProductsModule, InventoryModule],
  providers: [OrdersRepository],
  exports: [OrdersRepository],
})
export class OrdersModule {}
