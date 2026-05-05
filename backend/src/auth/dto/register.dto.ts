import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    description: 'ORCID, format 0000-0000-0000-000X',
    example: '0000-0002-1825-0097',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s.toUpperCase();
  })
  @Matches(/^(\d{4}-){3}\d{3}[\dX]$/, {
    message: 'orcid must match 0000-0000-0000-000X',
  })
  orcid?: string;

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
