import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SubmissionReviewMethod } from '../../entities/submission-review-method.enum';

export class UpdateReviewMethodDto {
  @ApiProperty({ enum: SubmissionReviewMethod })
  @IsEnum(SubmissionReviewMethod)
  reviewMethod: SubmissionReviewMethod;
}
