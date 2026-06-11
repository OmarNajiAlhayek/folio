import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { SubmissionStatus } from '../../entities/submission-status.enum';

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
}
