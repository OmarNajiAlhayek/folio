import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SubmissionsService } from './submissions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { SubmitCopyeditNoteDto } from './dto/submit-copyedit-note.dto';

@ApiTags('copyedit-assignments')
@Controller('copyedit-assignments')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class CopyeditAssignmentsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('me')
  @Permissions(PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE)
  myAssignments(@CurrentUser() user: RequestUser) {
    return this.submissionsService.listMyCopyeditAssignments(user.sub);
  }

  @Post(':slug/notes')
  @Permissions(PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE)
  submitNote(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitCopyeditNoteDto,
  ) {
    return this.submissionsService.submitCopyeditNote(
      slug,
      user.sub,
      dto.noteForAuthor,
      dto.noteToEditorOnly ?? '',
    );
  }

  @Post(':slug/ready')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  markAuthorReady(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.markCopyeditAuthorReady(slug, user.sub);
  }
}
