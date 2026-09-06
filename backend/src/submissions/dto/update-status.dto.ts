import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { SubmissionStatus } from '../../entities/submission-status.enum';
import {
  REVISION_SEVERITIES,
  type RevisionSeverity,
} from '../submission-workflow.constants';

export class UpdateStatusDto {
  @ApiProperty({ enum: SubmissionStatus })
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @ApiPropertyOptional({
    description:
      'Optional message to the author when setting accepted, rejected, or revisions_requested',

    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  messageForAuthor?: string;

  @ApiPropertyOptional({
    description:
      'Severity of the revision request. Required when setting revisions_requested, rejected otherwise.',
    enum: REVISION_SEVERITIES,
  })
  @IsOptional()
  @IsIn(REVISION_SEVERITIES)
  revisionSeverity?: RevisionSeverity;

  @ApiPropertyOptional({
    description:
      'Ids of reviewer-uploaded review_response files to release to the author with this decision.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  releaseReviewFileIds?: string[];
}
