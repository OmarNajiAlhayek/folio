import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOrcidId } from './is-orcid-id.validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (value === '' || value === null) return undefined;
  return value;
}

export class RegisterDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(500)
  affiliation?: string;

  /**
   * Required: ORCID is the primary identifier of every account (Damascus
   * University, 2026-09-14). Sign-up through ORCID gets it from ORCID itself.
   */
  @ApiProperty({
    description:
      'ORCID iD, format 0000-0000-0000-000X with a valid check digit',
    example: '0000-0002-1825-0097',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsOrcidId()
  orcid: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000)
  reviewKeywords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  willingToReview?: boolean;
}
