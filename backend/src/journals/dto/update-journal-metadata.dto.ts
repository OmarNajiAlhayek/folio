import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Partial update of one journal's public metadata. An omitted field is left
 * alone; `null` or an empty string clears an ISSN or a description. Titles
 * cannot be cleared — a journal always has a name.
 *
 * Only shape is checked here. The rules that decide whether a value is
 * acceptable (ISSN check digit, who may touch titles) live in
 * `JournalMetadataService`, so they have one home.
 */
export class UpdateJournalMetadataDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  titleAr?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  titleEn?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '1818-5010',
    description: 'ISSN of the print edition',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  issn?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '2789-6552',
    description: 'ISSN of the electronic edition',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  eissn?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  descriptionAr?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  descriptionEn?: string | null;
}
