import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { Product } from '../../products/entities/product.entity';
import { Order } from './order.entity';

@Entity('order_items')
@Index('order_items_product_idx', ['productId'])
@Check('order_items_quantity_positive', 'quantity > 0')
@Check('order_items_price_non_negative', 'unit_price_cents >= 0')
export class OrderItem {
  @PrimaryColumn({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'unit_price_cents', type: 'integer' })
  unitPriceCents!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;
}
