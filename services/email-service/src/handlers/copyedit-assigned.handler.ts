import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CopyeditAssignedEvent,
} from '../contracts/email-events';
import { copyeditAssignedKey } from '../shared/idempotency';
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
export class CopyeditAssignedHandler {
  private readonly logger = new Logger(CopyeditAssignedHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
  ) {}

  async handle(event: CopyeditAssignedEvent): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== copyeditAssignedKey(event.assignmentSlug)) {
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
          'copyedit-assigned',
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
        template: 'copyedit-assigned',
        emailLocale: event.emailLocale,
        templateVars: {
          copyeditorDisplayName: event.copyeditor.displayName,
          submissionTitle: event.submissionTitle,
          workbenchUrl: event.workbenchUrl,
          assignedByDisplayName: event.assignedBy.displayName,
        },
      },
    );
  }
}
