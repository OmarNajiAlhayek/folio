import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsOrcidId } from './is-orcid-id.validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (value === '' || value === null) return undefined;
  return value;
}

export class PatchResearcherProfileDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  affiliation?: string | null;

  /**
   * Sets or corrects the iD. It cannot be cleared: every account must keep
   * one, so an empty value is treated as "no change".
   */
  @ApiPropertyOptional({
    description: 'ORCID iD with a valid check digit',
    example: '0000-0002-1825-0097',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return emptyToUndefined({ value });
    const s = value.trim().toUpperCase();
    return s === '' ? undefined : s;
  })
  @IsString()
  @IsOrcidId()
  orcid?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewKeywords?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  willingToReview?: boolean;
}
