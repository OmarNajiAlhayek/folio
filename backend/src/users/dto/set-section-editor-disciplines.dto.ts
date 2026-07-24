import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SetSectionEditorDisciplinesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  disciplines: string[];
}
