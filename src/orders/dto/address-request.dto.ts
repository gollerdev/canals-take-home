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
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string | null;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

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
