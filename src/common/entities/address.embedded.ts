import { Column } from 'typeorm';

export class Address {
  @Column({ name: 'line1', type: 'text' })
  line1!: string;

  @Column({ name: 'line2', type: 'text', nullable: true })
  line2!: string | null;

  @Column({ name: 'city', type: 'text' })
  city!: string;

  @Column({ name: 'region', type: 'text', nullable: true })
  region!: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode!: string | null;

  @Column({ name: 'country', type: 'char', length: 2 })
  country!: string;
}
