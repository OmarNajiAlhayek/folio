import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SubmissionStatus } from '../../entities/submission-status.enum';

export class UpdateStatusDto {
  @ApiProperty({ enum: SubmissionStatus })
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;
}
