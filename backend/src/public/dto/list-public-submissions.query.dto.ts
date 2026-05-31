import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  ARABIC_DISCIPLINE_LABELS,
  isValidDisciplineLabel,
} from '../../ai/discipline-labels';
import { SubmissionArticleType } from '../../entities/submission-article-type.enum';
import {
  normalizePublicationPublishedAt,
  type PublicationCatalogFilters,
} from '../../submissions/publication-catalog-search.util';

@ValidatorConstraint({ name: 'publishedDateRange', async: false })
class PublishedDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as ListPublicSubmissionsQueryDto;
    if (!obj.publishedFrom || !obj.publishedTo) {
      return true;
    }
    return (
      new Date(obj.publishedFrom).getTime() <=
      new Date(obj.publishedTo).getTime()
    );
  }

  defaultMessage(): string {
    return 'publishedFrom must be before or equal to publishedTo';
  }
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export class ListPublicSubmissionsQueryDto {
  @ApiPropertyOptional({
    description:
      'Quick search across title, abstract, keywords (EN/AR), and author display name.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  q?: string;

  @ApiPropertyOptional({
    description:
      'Advanced author filter (narrows results). Substring or trigram match on author display name.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  author?: string;

  @ApiPropertyOptional({
    description: 'Exact discipline label (Arabic taxonomy).',
    enum: [...ARABIC_DISCIPLINE_LABELS],
  })
  @IsOptional()
  @IsString()
  @IsIn([...ARABIC_DISCIPLINE_LABELS])
  discipline?: string;

  @ApiPropertyOptional({
    description: 'Article type; rows with null article_type are excluded.',
    enum: SubmissionArticleType,
  })
  @IsOptional()
  @IsEnum(SubmissionArticleType)
  articleType?: SubmissionArticleType;

  @ApiPropertyOptional({
    description:
      'Inclusive lower bound on published_at (ISO-8601 date or datetime). Date-only values use UTC start of day.',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  publishedFrom?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive upper bound on published_at (ISO-8601 date or datetime). Date-only values use UTC end of day.',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Validate(PublishedDateRangeConstraint)
  publishedTo?: string;

  @ApiPropertyOptional({
    description:
      'Catalog search mode. Use semantic with q for vector search; keyword is default Postgres FTS.',
    enum: ['keyword', 'semantic'],
  })
  @IsOptional()
  @IsIn(['keyword', 'semantic'])
  searchMode?: 'keyword' | 'semantic';

  @ApiPropertyOptional({
    description: 'Max results for semantic search (1–30).',
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  })
  semanticLimit?: number;

  @ApiPropertyOptional({
    description: 'Page size for keyword catalog search (1–100, default 20).',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Skip rows for keyword catalog search (default 0).',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  })
  offset?: number;
}

export function toPublicationCatalogFilters(
  dto: ListPublicSubmissionsQueryDto,
): PublicationCatalogFilters {
  const filters: PublicationCatalogFilters = {};

  if (dto.q) {
    filters.q = dto.q;
  }
  if (dto.author) {
    filters.author = dto.author;
  }
  if (dto.discipline && isValidDisciplineLabel(dto.discipline)) {
    filters.discipline = dto.discipline;
  }
  if (dto.articleType) {
    filters.articleType = dto.articleType;
  }
  if (dto.publishedFrom) {
    filters.publishedFrom = normalizePublicationPublishedAt(
      dto.publishedFrom,
      'from',
    );
  }
  if (dto.publishedTo) {
    filters.publishedTo = normalizePublicationPublishedAt(
      dto.publishedTo,
      'to',
    );
  }

  return filters;
}
