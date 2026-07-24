import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewRecommendation } from '../../entities/review.entity';

export class CreateReviewDto {
  @ApiPropertyOptional({ maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  commentsForAuthor?: string;

  @ApiPropertyOptional({ maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  commentsToEditorOnly?: string;

  @ApiProperty({
    enum: ReviewRecommendation,
    description:
      'accept | revisions | resubmit_for_review | resubmit_elsewhere | reject | see_comments',
  })
  @IsEnum(ReviewRecommendation)
  recommendation: ReviewRecommendation;
}
