import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SubmissionFileStage } from '../../entities/submission-file-stage.enum';

export class UpdateSubmissionFileStageDto {
  @ApiProperty({ enum: SubmissionFileStage })
  @IsEnum(SubmissionFileStage)
  fileStage: SubmissionFileStage;
}
