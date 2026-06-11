import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SubmissionUnderReviewEvent } from '@folio/shared/contracts/email-events';
import { submissionUnderReviewKey } from '@folio/shared/messaging/idempotency';
import { redactEventPayload } from '@folio/shared/messaging/redactor';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { TemplatesService } from '../templates/templates.service';
import { ACK, HandlerOutcome } from './handler-result';
import {
  preclaimCopyeditEmail,
  renderAndSendCopyeditEmail,
} from './copyedit-email.util';

@Injectable()
export class SubmissionUnderReviewHandler {
  private readonly logger = new Logger(SubmissionUnderReviewHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
  ) {}

  async handle(event: SubmissionUnderReviewEvent): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      submissionUnderReviewKey(event.submissionSlug, event.submittedCycleAt)
    ) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }

    let row;
    try {
      row = await this.dataSource.transaction((manager) =>
        preclaimCopyeditEmail(
          manager,
          event.idempotencyKey,
          event.author.email,
          'submission-under-review',
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

    return renderAndSendCopyeditEmail(
      {
        dataSource: this.dataSource,
        provider: this.provider,
        templates: this.templates,
        logger: this.logger,
      },
      row,
      {
        idempotencyKey: event.idempotencyKey,
        recipient: event.author.email,
        template: 'submission-under-review',
        emailLocale: event.emailLocale,
        templateVars: {
          authorDisplayName: event.author.displayName,
          submissionTitle: event.submissionTitle,
          submissionUrl: event.submissionUrl,
          trigger: event.trigger,
          initiatedByDisplayName: event.initiatedByDisplayName,
          isEditorTrigger: event.trigger === 'editor',
          isReviewerAcceptTrigger: event.trigger === 'reviewer_accept',
        },
      },
    );
  }
}
