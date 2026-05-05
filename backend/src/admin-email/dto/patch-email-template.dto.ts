import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const MAX_LEN = 200_000;

export class PatchEmailTemplateDto {
  @ApiProperty({ example: 'Review invitation: {{submissionTitle}}' })
  @IsString()
  @MaxLength(MAX_LEN)
  subjectTemplate: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_LEN)
  htmlBody: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_LEN)
  textBody: string;

  @ApiProperty({
    description:
      'Expected updated_at from GET (optimistic locking). Must match current row.',
  })
  @IsISO8601()
  expectedUpdatedAt: string;
}

export class PreviewEmailTemplateDto {
  @ApiPropertyOptional({
    description:
      'For reminder-due only: toggle overdue branch in preview context.',
  })
  @IsOptional()
  @IsBoolean()
  isOverdue?: boolean;
}
