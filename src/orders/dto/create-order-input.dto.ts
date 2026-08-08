import type { Address } from '../../common/entities/address.embedded';
import type { RequestedItemInputDto } from '../../inventory/dto/requested-item-input.dto';

export interface CreateOrderInputDto {
  customerId: string;
  idempotencyKey: string;
  shippingAddress: Address;
  cardNumber: string;
  items: readonly RequestedItemInputDto[];
}
