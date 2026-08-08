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
  @IsUUID()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  cardNumber!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AddressRequestDto)
  shippingAddress!: AddressRequestDto;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemRequestDto)
  items!: OrderItemRequestDto[];
}
