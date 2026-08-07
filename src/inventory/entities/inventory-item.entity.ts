import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Product } from '../../products/entities/product.entity';
import { Warehouse } from './warehouse.entity';

@Entity('inventory_items')
@Index('inventory_items_product_idx', ['productId'])
@Check('inventory_reserved_non_negative', 'quantity_reserved >= 0')
@Check('inventory_not_oversold', 'quantity_on_hand >= quantity_reserved')
export class InventoryItem {
  @PrimaryColumn({ name: 'warehouse_id', type: 'uuid' })
  warehouseId!: string;

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'quantity_on_hand', type: 'integer' })
  quantityOnHand!: number;

  @Column({ name: 'quantity_reserved', type: 'integer', default: 0 })
  quantityReserved!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
