import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ARABIC_DISCIPLINE_LABELS } from '../../ai/discipline-labels';

export class DisciplineSuggestionResponseDto {
  @ApiProperty()
  topLabel: string;

  @ApiProperty()
  topConfidence: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  probabilities: Record<string, number>;

  @ApiProperty()
  scopeInJournal: boolean;

  @ApiPropertyOptional({ nullable: true })
  scopeWarning: string | null;

  @ApiPropertyOptional({ nullable: true })
  discipline: string | null;

  @ApiPropertyOptional({ nullable: true })
  disciplineSuggested: string | null;
}
