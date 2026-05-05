import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionArticleType } from '../../entities/submission-article-type.enum';
import { ContributorDto } from './contributor.dto';

export class CreateSubmissionDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  titleAr?: string;

  @ApiProperty({ minLength: 1, maxLength: 20000 })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  abstract: string;

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
}
