import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class OrderItemRequestDto {
  @ApiProperty({
    format: 'uuid',
    example: '019fda00-0000-7000-8000-000000000a01',
  })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 1000, example: 2 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}
