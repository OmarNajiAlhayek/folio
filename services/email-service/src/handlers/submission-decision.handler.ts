import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SubmissionDecisionEvent } from '../contracts/email-events';
import { submissionDecisionKey } from '../shared/idempotency';
import { redactEventPayload } from '../shared/redactor';
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
export class SubmissionDecisionHandler {
  private readonly logger = new Logger(SubmissionDecisionHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
  ) {}

  async handle(event: SubmissionDecisionEvent): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      submissionDecisionKey(event.submissionSlug, event.decision)
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
          'submission-decision',
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

    const { decision } = event;
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
        template: 'submission-decision',
        emailLocale: event.emailLocale,
        templateVars: {
          authorDisplayName: event.author.displayName,
          submissionTitle: event.submissionTitle,
          submissionUrl: event.submissionUrl,
          decidedByDisplayName: event.decidedBy.displayName,
          isAccepted: decision === 'accepted',
          isRejected: decision === 'rejected',
          isRevisionsRequested: decision === 'revisions_requested',
        },
      },
    );
  }
}
