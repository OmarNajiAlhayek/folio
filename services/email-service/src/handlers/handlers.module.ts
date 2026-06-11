import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ProvidersModule } from '../providers/providers.module';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReviewerRespondedHandler } from './reviewer-responded.handler';
import { ReminderDueHandler } from './reminder-due.handler';
import { AdminModule } from '../admin/admin.module';
import { CopyeditAssignedHandler } from './copyedit-assigned.handler';
import { CopyeditQueriesSentHandler } from './copyedit-queries-sent.handler';
import { CopyeditAuthorReadyHandler } from './copyedit-author-ready.handler';
import { SubmissionSubmittedHandler } from './submission-submitted.handler';
import { SubmissionDecisionHandler } from './submission-decision.handler';
import { SubmissionUnderReviewHandler } from './submission-under-review.handler';
import { Phase3WorkflowHandlers } from './phase3-workflow.handlers';
import { AuthEmailHandler } from './auth-email.handler';
import { ConsumersService } from './consumers.service';

@Module({
  imports: [TemplatesModule, ProvidersModule, AdminModule],
  providers: [
    ReviewerInvitedHandler,
    ReviewerRespondedHandler,
    ReminderDueHandler,
    CopyeditAssignedHandler,
    CopyeditQueriesSentHandler,
    CopyeditAuthorReadyHandler,
    SubmissionSubmittedHandler,
    SubmissionDecisionHandler,
    SubmissionUnderReviewHandler,
    Phase3WorkflowHandlers,
    AuthEmailHandler,
    ConsumersService,
  ],
  exports: [
    ReviewerInvitedHandler,
    ReminderDueHandler,
    CopyeditAssignedHandler,
    CopyeditQueriesSentHandler,
    CopyeditAuthorReadyHandler,
    SubmissionSubmittedHandler,
    SubmissionDecisionHandler,
    SubmissionUnderReviewHandler,
  ],
})
export class HandlersModule {}
