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
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { ErrorResponseDto } from '../common/http/error-response.dto';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { OrderResponseDto } from './dto/order-response.dto';
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

@ApiTags('orders')
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
  @ApiOperation({
    summary: 'Place an order',
    description:
      'Reserves stock at the closest warehouse that can fill the whole order, then charges the card. ' +
      'The status code carries the outcome: 201 confirmed, 200 replayed, 402 payment declined, 409 unfillable.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Replaying a key returns the original order instead of placing a second one.',
    schema: { type: 'string', example: '5f1e6a2c-9b40-4f1a-8c3d-0b7e2a9d4f11' },
  })
  @ApiCreatedResponse({
    description: 'Order confirmed and the card charged',
    type: OrderResponseDto,
  })
  @ApiOkResponse({
    description: 'Idempotent replay of an order already placed with this key',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Malformed body, missing Idempotency-Key, unknown products, or an address that cannot be geocoded',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.PAYMENT_REQUIRED,
    description: 'The card was declined; the order is persisted as failed',
    type: OrderResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The customer does not exist',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'No single warehouse can fill the order, or a request with the same key is still in flight',
    type: OrderResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The payment or geocoding provider is unreachable',
    type: ErrorResponseDto,
  })
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
  @ApiOperation({ summary: 'Fetch an order by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '019fda00-0000-7000-8000-00000000d001',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({
    description: 'No order with that id',
    type: ErrorResponseDto,
  })
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderResponseDto> {
    return toOrderResponse(await this.orders.requireById(id));
  }
}
