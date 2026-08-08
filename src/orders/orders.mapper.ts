import type { OrderResponseDto } from './dto/order-response.dto';
import type { Order } from './entities/order.entity';

const CURRENCY = 'USD';

export function toOrderResponse(order: Order): OrderResponseDto {
  return {
    id: order.id,
    status: order.status,
    failureReason: order.failureReason,
    totalCents: order.totalCents,
    currency: CURRENCY,
    paymentReference: order.paymentReference,
    shippingAddress: order.shippingAddress,
    warehouse: order.warehouse
      ? { code: order.warehouse.code, name: order.warehouse.name }
      : null,
    items: order.items.map((item) => ({
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    createdAt: order.createdAt,
  };
}
