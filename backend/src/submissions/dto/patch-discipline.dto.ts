import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  MAX_DISCIPLINES,
  SELECTABLE_DISCIPLINE_LABELS,
} from '../../ai/discipline-labels';

export class PatchDisciplineDto {
  @ApiProperty({
    type: [String],
    enum: SELECTABLE_DISCIPLINE_LABELS,
    minItems: 1,
    maxItems: MAX_DISCIPLINES,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DISCIPLINES)
  @IsString({ each: true })
  @IsIn([...SELECTABLE_DISCIPLINE_LABELS], { each: true })
  disciplines: string[];
}
