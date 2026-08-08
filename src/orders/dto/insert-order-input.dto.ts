import type { Address } from '../../common/entities/address.embedded';
import type { GeoPoint } from '../../common/types/geo-point';
import type { OrderLineInputDto } from './order-line-input.dto';

export interface InsertOrderInputDto {
  customerId: string;
  idempotencyKey: string;
  shippingAddress: Address;
  shippingLocation: GeoPoint;
  totalCents: number;
  lines: readonly OrderLineInputDto[];
}
