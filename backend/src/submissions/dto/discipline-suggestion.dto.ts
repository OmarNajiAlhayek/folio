import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DisciplineSuggestionResponseDto {
  @ApiProperty()
  topLabel: string;

  @ApiProperty()
  topConfidence: number;

  @ApiProperty({ type: [String] })
  suggestedLabels: string[];

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  probabilities: Record<string, number>;

  @ApiProperty()
  scopeInJournal: boolean;

  @ApiPropertyOptional({ nullable: true })
  scopeWarning: string | null;

  @ApiProperty({ type: [String] })
  disciplines: string[];
}
