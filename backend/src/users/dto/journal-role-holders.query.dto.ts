import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ROLE_SLUGS } from '../../rbac/permission-slugs';

/** Roles that occupy a single seat on each journal. */
export class JournalRoleHoldersQueryDto {
  @ApiProperty({ enum: [ROLE_SLUGS.EDITOR, ROLE_SLUGS.JOURNAL_MANAGER] })
  @IsIn([ROLE_SLUGS.EDITOR, ROLE_SLUGS.JOURNAL_MANAGER])
  roleSlug: typeof ROLE_SLUGS.EDITOR | typeof ROLE_SLUGS.JOURNAL_MANAGER;
}
