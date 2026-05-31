import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ReviewInvitationAcceptedEvent,
  ReviewInvitationDeclinedEvent,
  ReviewSubmittedEvent,
  RoleInvitationCreatedEvent,
  SubmissionPublishedEvent,
} from '../contracts/email-events';
import {
  reviewInvitationAcceptedEmailKey,
  reviewInvitationDeclinedEmailKey,
  reviewSubmittedEmailKey,
  roleInvitationEmailKey,
  submissionPublishedKey,
} from '../shared/idempotency';
import { redactEventPayload } from '../shared/redactor';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { TemplatesService } from '../templates/templates.service';
import { ACK, HandlerOutcome } from './handler-result';
import {
  CopyeditMailDeps,
  preclaimCopyeditEmail,
  renderAndSendCopyeditEmail,
} from './copyedit-email.util';

@Injectable()
export class Phase3WorkflowHandlers {
  private readonly logger = new Logger(Phase3WorkflowHandlers.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
  ) {}

  private deps(): CopyeditMailDeps {
    return {
      dataSource: this.dataSource,
      provider: this.provider,
      templates: this.templates,
      logger: this.logger,
    };
  }

  async handleReviewSubmitted(
    event: ReviewSubmittedEvent,
  ): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      reviewSubmittedEmailKey(event.assignmentSlug, event.editor.id)
    ) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.editor.email,
      template: 'review-submitted',
      templateVars: {
        editorDisplayName: event.editor.displayName,
        reviewerDisplayName: event.reviewer.displayName,
        submissionTitle: event.submissionTitle,
        submissionUrl: event.submissionUrl,
      },
    });
  }

  async handleReviewInvitationAccepted(
    event: ReviewInvitationAcceptedEvent,
  ): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      reviewInvitationAcceptedEmailKey(event.assignmentSlug, event.editor.id)
    ) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.editor.email,
      template: 'review-invitation-accepted',
      templateVars: {
        editorDisplayName: event.editor.displayName,
        reviewerDisplayName: event.reviewer.displayName,
        submissionTitle: event.submissionTitle,
        submissionUrl: event.submissionUrl,
      },
    });
  }

  async handleReviewInvitationDeclined(
    event: ReviewInvitationDeclinedEvent,
  ): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      reviewInvitationDeclinedEmailKey(event.assignmentSlug, event.editor.id)
    ) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.editor.email,
      template: 'review-invitation-declined',
      templateVars: {
        editorDisplayName: event.editor.displayName,
        reviewerDisplayName: event.reviewer.displayName,
        submissionTitle: event.submissionTitle,
        submissionUrl: event.submissionUrl,
      },
    });
  }

  async handleSubmissionPublished(
    event: SubmissionPublishedEvent,
  ): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== submissionPublishedKey(event.submissionSlug)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.author.email,
      template: 'submission-published',
      templateVars: {
        authorDisplayName: event.author.displayName,
        submissionTitle: event.submissionTitle,
        publicationUrl: event.publicationUrl,
      },
    });
  }

  async handleRoleInvitation(
    event: RoleInvitationCreatedEvent,
  ): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== roleInvitationEmailKey(event.invitationId)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    const roleLabel =
      event.roleSlug === 'journal_manager'
        ? 'journal manager'
        : event.roleSlug === 'editor'
          ? 'editor'
          : event.roleSlug;
    return this.dispatch(event, {
      recipient: event.invitee.email,
      template: 'role-invitation',
      templateVars: {
        inviteeDisplayName: event.invitee.displayName,
        invitedByDisplayName: event.invitedBy.displayName,
        roleLabel,
        dashboardUrl: event.dashboardUrl,
      },
    });
  }

  private async dispatch(
    event: {
      idempotencyKey: string;
      emailLocale?: 'en' | 'ar';
    },
    args: {
      recipient: string;
      template: string;
      templateVars: Record<string, unknown>;
    },
  ): Promise<HandlerOutcome> {
    let row;
    try {
      row = await this.dataSource.transaction((manager) =>
        preclaimCopyeditEmail(
          manager,
          event.idempotencyKey,
          args.recipient,
          args.template,
          event as unknown as Record<string, unknown>,
        ),
      );
    } catch (err) {
      this.logger.error(
        `pre-claim failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    if (row.status === 'sent') {
      return ACK;
    }

    return renderAndSendCopyeditEmail(this.deps(), row, {
      idempotencyKey: event.idempotencyKey,
      recipient: args.recipient,
      template: args.template,
      emailLocale: event.emailLocale,
      templateVars: args.templateVars,
    });
  }
}
