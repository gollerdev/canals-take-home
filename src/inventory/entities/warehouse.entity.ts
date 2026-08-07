import { Check, Column, Entity, Index } from 'typeorm';

import { AbstractEntity } from '../../common/entities/abstract.entity';
import { Address } from '../../common/entities/address.embedded';
import type { GeoPoint } from '../../common/types/geo-point';

@Entity('warehouses')
@Check('warehouses_country_is_iso_alpha2', "address_country ~ '^[A-Z]{2}$'")
export class Warehouse extends AbstractEntity {
  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column(() => Address, { prefix: 'address' })
  address!: Address;

  @Index('warehouses_location_idx', { spatial: true })
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location!: GeoPoint;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
