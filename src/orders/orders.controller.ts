import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import type { OrderResponseDto } from './dto/order-response.dto';
import { OrderFailureReason, OrderStatus } from './entities/order-status.enum';
import type { Order } from './entities/order.entity';
import { toOrderResponse } from './orders.mapper';
import { OrdersService } from './orders.service';

function statusFor(order: Order, replayed: boolean): HttpStatus {
  if (order.status === OrderStatus.Confirmed) {
    return replayed ? HttpStatus.OK : HttpStatus.CREATED;
  }

  return order.failureReason === OrderFailureReason.PaymentDeclined
    ? HttpStatus.PAYMENT_REQUIRED
    : HttpStatus.CONFLICT;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Places an order.
   *
   * @param idempotencyKey - Idempotency-Key header
   * @param body - customer, address, card and requested items
   * @param response - used to vary the status by outcome
   * @returns the settled order
   */
  @Post()
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateOrderRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const { order, replayed } = await this.orders.create({
      customerId: body.customerId,
      idempotencyKey,
      cardNumber: body.cardNumber,
      shippingAddress: {
        line1: body.shippingAddress.line1,
        line2: body.shippingAddress.line2 ?? null,
        city: body.shippingAddress.city,
        region: body.shippingAddress.region ?? null,
        postalCode: body.shippingAddress.postalCode ?? null,
        country: body.shippingAddress.country,
      },
      items: body.items,
    });

    response.status(statusFor(order, replayed));

    return toOrderResponse(order);
  }

  /**
   * Reads one order back.
   *
   * @param id - order identifier
   * @returns the order with its items and warehouse
   */
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderResponseDto> {
    return toOrderResponse(await this.orders.requireById(id));
  }
}
