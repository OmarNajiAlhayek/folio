import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
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

  /** True clears `reviewerUnavailableUntil` and `reviewerUnavailableNote`. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reviewerAvailable?: boolean;

  /**
   * First day available again. Must be after today (UTC) — checked in the
   * service, which knows the date. Null makes the absence open-ended.
   */
  @ApiPropertyOptional({ example: '2026-12-01', nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reviewerUnavailableUntil must be a YYYY-MM-DD date',
  })
  @IsISO8601({ strict: true })
  reviewerUnavailableUntil?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewerUnavailableNote?: string | null;

  /** Invited + accepted reviews at once. Null removes the limit. */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  reviewerMaxActiveReviews?: number | null;
}
