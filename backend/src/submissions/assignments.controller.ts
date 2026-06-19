import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReviewWorkflowService } from './review-workflow.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { EmailVerifiedGuard } from '../users/email-verified.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { CreateReviewDto } from '../reviews/dto/create-review.dto';

@ApiTags('assignments')
@Controller('assignments')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class AssignmentsController {
  constructor(private readonly reviewWorkflow: ReviewWorkflowService) {}

  @Get('me')
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  myAssignments(@CurrentUser() user: RequestUser) {
    return this.reviewWorkflow.listMyAssignments(user.sub);
  }

  @Get(':slug')
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  myAssignment(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.reviewWorkflow.getMyAssignmentBySlug(slug, user.sub);
  }

  @Post(':slug/accept')
  @HttpCode(200)
  @UseGuards(EmailVerifiedGuard)
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  acceptInvitation(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewWorkflow.acceptReviewInvitation(slug, user.sub);
  }

  @Post(':slug/decline')
  @UseGuards(EmailVerifiedGuard)
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  declineInvitation(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewWorkflow.declineReviewInvitation(slug, user.sub);
  }

  @Post(':slug/reviews')
  @UseGuards(EmailVerifiedGuard)
  @Permissions(PERMISSION_SLUGS.REVIEW_SUBMIT)
  submitReview(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewWorkflow.submitReview(
      slug,
      user.sub,
      dto.commentsForAuthor ?? '',
      dto.commentsToEditorOnly ?? '',
      dto.recommendation,
    );
  }
}
