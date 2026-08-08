import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    description: 'The exception class name, stable enough to branch on',
    example: 'UnknownProductsError',
  })
  error!: string;

  @ApiProperty({
    example: 'Unknown products: 019fda00-0000-7000-8000-0000000000ff',
  })
  message!: string;
}
