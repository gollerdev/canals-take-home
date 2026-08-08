import type { Address } from '../../common/entities/address.embedded';
import type {
  OrderFailureReason,
  OrderStatus,
} from '../entities/order-status.enum';
import type { OrderItemResponseDto } from './order-item-response.dto';
import type { OrderWarehouseResponseDto } from './order-warehouse-response.dto';

export interface OrderResponseDto {
  id: string;
  status: OrderStatus;
  failureReason: OrderFailureReason | null;
  totalCents: number;
  currency: string;
  paymentReference: string | null;
  shippingAddress: Address;
  warehouse: OrderWarehouseResponseDto | null;
  items: OrderItemResponseDto[];
  createdAt: Date;
}
