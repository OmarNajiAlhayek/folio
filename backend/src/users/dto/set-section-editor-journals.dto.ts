import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator';
import { JOURNAL_SLUGS } from '../../journals/journal-catalog';

/**
 * Journals a section editor serves, by slug — the same identifiers the portal
 * URLs use. Unknown slugs are rejected here rather than silently dropped
 * further down, so an admin sees a typo instead of a missing assignment.
 */
export class SetSectionEditorJournalsDto {
  @ApiProperty({ type: [String], enum: [...JOURNAL_SLUGS] })
  @IsArray()
  @ArrayMaxSize(JOURNAL_SLUGS.length)
  @IsString({ each: true })
  @IsIn([...JOURNAL_SLUGS], { each: true })
  journals: string[];
}
