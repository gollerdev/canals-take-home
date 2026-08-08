import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { AddressRequestDto } from './address-request.dto';
import { OrderItemRequestDto } from './order-item-request.dto';

export class CreateOrderRequestDto {
  @ApiProperty({
    format: 'uuid',
    example: '019fda00-0000-7000-8000-00000000c001',
  })
  @IsUUID()
  customerId!: string;

  @ApiProperty({
    description:
      'Stripe test number. `4242424242424242` captures; `4000000000000002` and the other `4000…` numbers decline.',
    maxLength: 25,
    example: '4242424242424242',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  cardNumber!: string;

  @ApiProperty({
    type: AddressRequestDto,
    description:
      'Geocoded to pick the closest warehouse that can fill the order',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => AddressRequestDto)
  shippingAddress!: AddressRequestDto;

  @ApiProperty({
    type: [OrderItemRequestDto],
    minItems: 1,
    maxItems: 50,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemRequestDto)
  items!: OrderItemRequestDto[];
}
