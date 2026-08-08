import { ApiProperty } from '@nestjs/swagger';

export class OrderItemResponseDto {
  @ApiProperty({ example: 'TSHIRT-BLK-M' })
  sku!: string;

  @ApiProperty({ example: 'Black T-Shirt (M)' })
  name!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Unit price in cents, captured when the order was placed',
    example: 1999,
  })
  unitPriceCents!: number;
}
