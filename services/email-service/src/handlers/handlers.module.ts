import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ProvidersModule } from '../providers/providers.module';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReminderDueHandler } from './reminder-due.handler';
import { CopyeditAssignedHandler } from './copyedit-assigned.handler';
import { CopyeditQueriesSentHandler } from './copyedit-queries-sent.handler';
import { CopyeditAuthorReadyHandler } from './copyedit-author-ready.handler';
import { SubmissionSubmittedHandler } from './submission-submitted.handler';
import { SubmissionDecisionHandler } from './submission-decision.handler';
import { ConsumersService } from './consumers.service';

@Module({
  imports: [TemplatesModule, ProvidersModule],
  providers: [
    ReviewerInvitedHandler,
    ReminderDueHandler,
    CopyeditAssignedHandler,
    CopyeditQueriesSentHandler,
    CopyeditAuthorReadyHandler,
    SubmissionSubmittedHandler,
    SubmissionDecisionHandler,
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
  ],
})
export class HandlersModule {}
