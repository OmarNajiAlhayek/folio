import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const MAX_LEN = 200_000;

export class PatchEmailTemplateDto {
  @IsString()
  @MaxLength(MAX_LEN)
  subjectTemplate: string;

  @IsString()
  @MaxLength(MAX_LEN)
  htmlBody: string;

  @IsString()
  @MaxLength(MAX_LEN)
  textBody: string;

  @IsISO8601()
  expectedUpdatedAt: string;
}

export class PreviewEmailTemplateDto {
  @IsOptional()
  @IsBoolean()
  isOverdue?: boolean;
}
