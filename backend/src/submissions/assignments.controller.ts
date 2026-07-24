import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MaxLength } from 'class-validator';
import { ReviewWorkflowService } from './review-workflow.service';
import { ReviewDiscussionService } from './review-discussion.service';
import { SubmissionFileService } from './submission-file.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { EmailVerifiedGuard } from '../users/email-verified.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { CreateReviewDto } from '../reviews/dto/create-review.dto';
import { submissionFileMulterOptions } from './submission-file-multer.options';

class CreateDiscussionDto {
  @IsString() @MaxLength(500) subject: string;
  @IsString() @MaxLength(50000) body: string;
}

class AddMessageDto {
  @IsString() @MaxLength(50000) body: string;
}

@ApiTags('assignments')
@Controller('assignments')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class AssignmentsController {
  constructor(
    private readonly reviewWorkflow: ReviewWorkflowService,
    private readonly reviewDiscussion: ReviewDiscussionService,
    private readonly fileService: SubmissionFileService,
  ) {}

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

  // ── Reviewer file upload ──────────────────────────────────────────────────

  @Get(':slug/files')
  @Permissions(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)
  listReviewerFiles(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.fileService.listReviewerFiles(slug, user.sub);
  }

  @Post(':slug/files')
  @UseGuards(EmailVerifiedGuard)
  @Permissions(PERMISSION_SLUGS.REVIEW_SUBMIT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', submissionFileMulterOptions))
  uploadReviewFile(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.fileService.addReviewerFile(slug, user.sub, file);
  }

  // ── Review discussions ───────────────────────────────────────────────────

  @Get(':slug/discussions')
  @Permissions(
    PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  )
  listDiscussions(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviewDiscussion.listDiscussions(slug, user);
  }

  @Post(':slug/discussions')
  @UseGuards(EmailVerifiedGuard)
  @Permissions(
    PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  )
  createDiscussion(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDiscussionDto,
  ) {
    return this.reviewDiscussion.createDiscussion(
      slug,
      user,
      dto.subject,
      dto.body,
    );
  }

  @Post(':slug/discussions/:discussionId/messages')
  @UseGuards(EmailVerifiedGuard)
  @Permissions(
    PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  )
  addMessage(
    @Param('slug') slug: string,
    @Param('discussionId') discussionId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AddMessageDto,
  ) {
    return this.reviewDiscussion.addMessage(slug, discussionId, user, dto.body);
  }
}
