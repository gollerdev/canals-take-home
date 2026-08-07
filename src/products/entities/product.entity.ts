import { Check, Column, Entity } from 'typeorm';

import { AbstractEntity } from '../../common/entities/abstract.entity';

@Entity('products')
@Check('products_price_non_negative', 'price_cents >= 0')
export class Product extends AbstractEntity {
  @Column({ type: 'text', unique: true })
  sku!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'price_cents', type: 'integer' })
  priceCents!: number;
}
