import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class CreateRoleInvitationDto {
  @ApiProperty({ enum: ['editor', 'journal_manager', 'section_editor'] })
  @IsString()
  @IsIn(['editor', 'journal_manager', 'section_editor'])
  roleSlug: string;
}
