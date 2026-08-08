import { ApiProperty } from '@nestjs/swagger';

export class OrderWarehouseResponseDto {
  @ApiProperty({ example: 'WH-NYC' })
  code!: string;

  @ApiProperty({ example: 'New York City Hub' })
  name!: string;
}
