import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CopyeditAuthorReadyEvent } from '../contracts/email-events';
import { copyeditAuthorReadyKey } from '../shared/idempotency';
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
export class CopyeditAuthorReadyHandler {
  private readonly logger = new Logger(CopyeditAuthorReadyHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
  ) {}

  async handle(event: CopyeditAuthorReadyEvent): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      copyeditAuthorReadyKey(event.assignmentSlug, event.round)
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
          event.copyeditor.email,
          'copyedit-author-ready',
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
        recipient: event.copyeditor.email,
        template: 'copyedit-author-ready',
        emailLocale: event.emailLocale,
        templateVars: {
          copyeditorDisplayName: event.copyeditor.displayName,
          authorDisplayName: event.author.displayName,
          submissionTitle: event.submissionTitle,
          round: event.round,
          workbenchUrl: event.workbenchUrl,
        },
      },
    );
  }
}
