import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionArticleType } from '../../entities/submission-article-type.enum';
import { ContributorDto } from './contributor.dto';
import { ConstructorContentDto } from './constructor-content.dto';

export class UpdateSubmissionDto {
  /**
   * Authors choose the journal while the manuscript is still a draft.
   * `update` rejects a journal or section change after submit, including
   * while revisions are requested, so the paper stays with the people it
   * was routed to.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  journalId?: string;

  /** `null` clears the section. Changing the journal without a section clears it. */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sectionId?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  titleAr?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  abstract?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  abstractAr?: string;

  @ApiPropertyOptional({ enum: SubmissionArticleType })
  @IsOptional()
  @IsEnum(SubmissionArticleType)
  articleType?: SubmissionArticleType;

  @ApiPropertyOptional({ maxLength: 800 })
  @IsOptional()
  @IsString()
  @MaxLength(800)
  keywords?: string;

  @ApiPropertyOptional({ maxLength: 800 })
  @IsOptional()
  @IsString()
  @MaxLength(800)
  keywordsAr?: string;

  @ApiPropertyOptional({ type: [ContributorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContributorDto)
  contributors?: ContributorDto[];

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  fundingStatement?: string;

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  conflictOfInterestStatement?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ethicalApprovalReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  originalityConfirmed?: boolean;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  aiUsageStatement?: string;

  /**
   * Structured Word-Constructor content. Pass `null` to clear (switching
   * back to upload mode). Pass an object to set / replace.
   */
  @ApiPropertyOptional({
    type: () => ConstructorContentDto,
    nullable: true,
    description: 'Pass null to clear constructor content.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConstructorContentDto)
  constructorContent?: ConstructorContentDto | null;
}
