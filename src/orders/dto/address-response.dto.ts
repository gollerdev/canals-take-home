import { ApiProperty } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ example: '350 5th Ave' })
  line1!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Floor 21' })
  line2!: string | null;

  @ApiProperty({ example: 'New York' })
  city!: string;

  @ApiProperty({ type: String, nullable: true, example: 'NY' })
  region!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '10118' })
  postalCode!: string | null;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    minLength: 2,
    maxLength: 2,
    example: 'US',
  })
  country!: string;
}
