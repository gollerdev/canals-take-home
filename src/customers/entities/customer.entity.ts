import { Column, Entity } from 'typeorm';

import { AbstractEntity } from '../../common/entities/abstract.entity';

@Entity('customers')
export class Customer extends AbstractEntity {
  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ type: 'text' })
  name!: string;
}
