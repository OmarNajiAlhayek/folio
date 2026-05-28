import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT } from '../../submissions/publication-catalog-search.util';

function trimRequired(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export class AuthorSuggestionsQueryDto {
  @ApiPropertyOptional({
    description:
      'Partial author display name (min 2 characters). Matches published catalog authors.',
    minLength: 2,
    maxLength: 120,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => trimRequired(value))
  q: string;

  @ApiPropertyOptional({
    description: 'Max suggestions (1–20, default 10).',
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  })
  limit?: number;
}
