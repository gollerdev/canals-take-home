import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';

import { AbstractEntity } from '../../common/entities/abstract.entity';
import { Address } from '../../common/entities/address.embedded';
import type { GeoPoint } from '../../common/types/geo-point';
import { Customer } from '../../customers/entities/customer.entity';
import { Warehouse } from '../../inventory/entities/warehouse.entity';
import { OrderFailureReason, OrderStatus } from './order-status.enum';
import { OrderItem } from './order-item.entity';

@Entity('orders')
@Unique('orders_idempotency_unique', ['customerId', 'idempotencyKey'])
@Index('orders_customer_idx', ['customerId'])
@Index('orders_warehouse_idx', ['warehouseId'])
@Check('orders_total_non_negative', 'total_cents >= 0')
@Check(
  'orders_confirmed_is_complete',
  `status <> 'confirmed' OR (warehouse_id IS NOT NULL AND payment_reference IS NOT NULL)`,
)
@Check(
  'orders_failed_has_reason',
  `status <> 'failed' OR failure_reason IS NOT NULL`,
)
@Check(
  'orders_unfailed_has_no_reason',
  `status = 'failed' OR failure_reason IS NULL`,
)
@Check('orders_country_is_iso_alpha2', "shipping_country ~ '^[A-Z]{2}$'")
export class Order extends AbstractEntity {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.Pending,
  })
  status!: OrderStatus;

  @Column({
    name: 'failure_reason',
    type: 'enum',
    enum: OrderFailureReason,
    enumName: 'order_failure_reason',
    nullable: true,
  })
  failureReason!: OrderFailureReason | null;

  @Column(() => Address, { prefix: 'shipping' })
  shippingAddress!: Address;

  @Column({
    name: 'shipping_location',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  shippingLocation!: GeoPoint | null;

  @Column({ name: 'total_cents', type: 'integer' })
  totalCents!: number;

  @Column({ name: 'payment_reference', type: 'text', nullable: true })
  paymentReference!: string | null;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items!: OrderItem[];
}
