import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ARABIC_DISCIPLINE_LABELS } from '../../ai/discipline-labels';

export class PatchDisciplineDto {
  @ApiProperty({ enum: ARABIC_DISCIPLINE_LABELS })
  @IsString()
  @IsIn([...ARABIC_DISCIPLINE_LABELS])
  discipline: string;
}
