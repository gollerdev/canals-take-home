import type { Order } from '../entities/order.entity';

export interface CreateOrderOutputDto {
  order: Order;
  replayed: boolean;
}
