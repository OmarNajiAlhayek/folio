import { ApiProperty } from '@nestjs/swagger';

export class KeywordSuggestionDto {
  @ApiProperty({ type: [String] })
  keywordsEn!: string[];

  @ApiProperty({ type: [String] })
  keywordsAr!: string[];
}
