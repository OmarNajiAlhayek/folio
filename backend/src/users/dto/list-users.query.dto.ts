import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({
    description:
      'Search by email or display name (substring, case-insensitive).',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  q?: string;

  @ApiPropertyOptional({
    description:
      'Filter by role slug (e.g. reviewer, copyeditor, editor, journal_manager).',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => trimOptional(value))
  role?: string;

  @ApiPropertyOptional({
    description:
      'Filter to users who joined on or after this date (YYYY-MM-DD, UTC).',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'joinedFrom must be a YYYY-MM-DD date string',
  })
  joinedFrom?: string;

  @ApiPropertyOptional({
    description:
      'Filter to users who joined on or before this date (YYYY-MM-DD, UTC).',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'joinedTo must be a YYYY-MM-DD date string',
  })
  joinedTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return 20;
    }
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : 20;
  })
  limit?: number = 20;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return 0;
    }
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : 0;
  })
  offset?: number = 0;
}
