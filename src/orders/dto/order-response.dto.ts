import { ApiProperty } from '@nestjs/swagger';

import { OrderFailureReason, OrderStatus } from '../entities/order-status.enum';
import { AddressResponseDto } from './address-response.dto';
import { OrderItemResponseDto } from './order-item-response.dto';
import { OrderWarehouseResponseDto } from './order-warehouse-response.dto';

export class OrderResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '019fda00-0000-7000-8000-00000000d001',
  })
  id!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({
    enum: OrderFailureReason,
    enumName: 'OrderFailureReason',
    nullable: true,
    description: 'Set only when the status is `failed`',
    example: null,
  })
  failureReason!: OrderFailureReason | null;

  @ApiProperty({
    description: 'Sum of every line, in cents',
    example: 3998,
  })
  totalCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Gateway reference, present once the charge succeeds',
    example: 'ch_019fda000000700080000000',
  })
  paymentReference!: string | null;

  @ApiProperty({ type: AddressResponseDto })
  shippingAddress!: AddressResponseDto;

  @ApiProperty({
    type: OrderWarehouseResponseDto,
    nullable: true,
    description: 'The warehouse that fills the order, once one is chosen',
  })
  warehouse!: OrderWarehouseResponseDto | null;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
