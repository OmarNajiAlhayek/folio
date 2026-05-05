import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SubmissionsService } from './submissions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { CreateReviewDto } from '../reviews/dto/create-review.dto';

@ApiTags('assignments')
@Controller('assignments')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class AssignmentsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('me')
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  myAssignments(@CurrentUser() user: RequestUser) {
    return this.submissionsService.listMyAssignments(user.sub);
  }

  @Post(':slug/accept')
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  acceptInvitation(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.acceptReviewInvitation(slug, user.sub);
  }

  @Post(':slug/decline')
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  declineInvitation(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.declineReviewInvitation(slug, user.sub);
  }

  @Post(':slug/reviews')
  @Permissions(PERMISSION_SLUGS.REVIEW_SUBMIT)
  submitReview(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.submissionsService.submitReview(
      slug,
      user.sub,
      dto.commentsForAuthor ?? '',
      dto.commentsToEditorOnly ?? '',
      dto.recommendation,
    );
  }
}
