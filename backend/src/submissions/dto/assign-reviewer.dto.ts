import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AssignReviewerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reviewerId: string;

  @ApiPropertyOptional({
    description:
      'Deadline for the reviewer to respond to the invitation (ISO 8601 date)',
  })
  @IsOptional()
  @IsDateString()
  responseDueAt?: string;

  @ApiPropertyOptional({
    description:
      'Deadline for the reviewer to submit the review (ISO 8601 date)',
  })
  @IsOptional()
  @IsDateString()
  reviewDueAt?: string;

  @ApiPropertyOptional({
    description: 'Per-submission instructions from the editor',
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  editorInstructions?: string;
}
