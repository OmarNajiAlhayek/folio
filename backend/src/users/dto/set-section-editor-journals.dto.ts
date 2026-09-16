import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator';
import { JOURNAL_SLUGS } from '../../journals/journal-catalog';

/**
 * Journals a staff user serves in one role, by slug — the same identifiers the
 * portal URLs use. Shared by the section-editor and editor-in-chief scope
 * endpoints. Unknown slugs are rejected here rather than silently dropped
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
