import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignSectionEditorDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sectionEditorId: string;
}
