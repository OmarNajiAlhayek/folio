import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class CreateRoleInvitationDto {
  @ApiProperty({ enum: ['editor'] })
  @IsString()
  @IsIn(['editor'])
  roleSlug: string;
}
