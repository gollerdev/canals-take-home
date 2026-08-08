import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AddressRequestDto {
  @ApiProperty({ maxLength: 200, example: '350 5th Ave' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 200,
    example: 'Floor 21',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string | null;

  @ApiProperty({ maxLength: 120, example: 'New York' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 120,
    example: 'NY',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 20,
    example: '10118',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code, upper-cased on the way in',
    minLength: 2,
    maxLength: 2,
    example: 'US',
  })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'country must be an ISO 3166-1 alpha-2 code',
  })
  country!: string;
}
