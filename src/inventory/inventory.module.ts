import { Module } from '@nestjs/common';

import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

@Module({
  providers: [InventoryRepository, InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
