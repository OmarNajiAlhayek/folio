import { generateEntityId } from '@folio/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmailLog } from '../email-log/email-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { TemplatesService } from '../templates/templates.service';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { ReminderDueEvent } from '@folio/shared/contracts/email-events';
import { redactEventPayload } from '@folio/shared/messaging/redactor';
import { reminderDueKey } from '@folio/shared/messaging/idempotency';
import { ACK, HandlerOutcome } from './handler-result';
import { normalizeEmailLocale } from '../common/email-locale';
import { providerSendOutcome } from '../common/transient-error.util';
import {
  MAX_RETRY_COUNT,
  RETRY_DELAY_MS,
} from '../common/email-retry.constants';
import { assignmentReviewPageUrl } from '../common/folio-frontend-urls';

/**
 * Same state machine as `ReviewerInvitedHandler` but for the scheduled
 * reminder path. Templates differ; the rest is identical. After a
 * successful provider send, persisting `email_log` → `sent` and the
 * `reminder` row → `sent` uses one DB transaction so both commit or
 * neither does.
 *
 * Safety net when status changed between scheduler claim and send:
 * re-load the Reminder row and only proceed if still `pending`.
 * Proactive cancellation is handled by `ReviewerRespondedHandler`
 * (`reviewer.responded` on decline/complete).
 */
@Injectable()
export class ReminderDueHandler {
  private readonly logger = new Logger(ReminderDueHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
    private readonly config: ConfigService,
  ) {}

  async handle(event: ReminderDueEvent): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== reminderDueKey(event.reminderId)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }

    const reminderRepo = this.dataSource.getRepository(Reminder);
    const reminder = await reminderRepo.findOne({
      where: { id: event.reminderId },
    });
    if (!reminder || reminder.status !== 'pending') {
      this.logger.debug(
        `reminder ${event.reminderId} not pending (status=${reminder?.status ?? 'missing'}) — ack`,
      );
      return ACK;
    }

    const logRepo = this.dataSource.getRepository(EmailLog);

    const id = generateEntityId();
    const insertResult = (await this.dataSource.query(
      `INSERT INTO "email"."email_log" (
         "id", "idempotency_key", "recipient", "template", "context", "status"
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT ("idempotency_key") DO NOTHING
       RETURNING "id"`,
      [
        id,
        event.idempotencyKey,
        event.reviewer.email,
        'reminder-due',
        JSON.stringify(event),
        'pending',
      ],
    )) as Array<{ id: string }>;

    const insertedId = insertResult[0]?.id;
    let row: EmailLog | null = null;
    if (insertedId) {
      row = await logRepo.findOne({ where: { id: insertedId } });
    } else {
      row = await logRepo.findOne({
        where: { idempotencyKey: event.idempotencyKey },
      });
    }
    if (!row) {
      throw new Error('email_log row not available after insert/lookup');
    }

    if (row.status === 'sent') {
      this.logger.debug(
        `reminder.due duplicate (already sent) key=${event.idempotencyKey}`,
      );
      return ACK;
    }

    const baseUrl = (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
    const locale = normalizeEmailLocale(
      event.emailLocale ?? reminder.emailLocale,
    );
    const title =
      event.submissionTitle?.trim() ||
      reminder.submissionTitle?.trim() ||
      '[manuscript]';
    const rendered = await this.templates.render('reminder-due', locale, {
      reviewerDisplayName: event.reviewer.displayName,
      submissionTitle: title,
      assignmentUrl: assignmentReviewPageUrl(
        baseUrl,
        event.assignmentSlug,
        locale,
      ),
      dueAt: event.dueAt,
      isOverdue: event.kind === 'review_overdue',
    });

    const reminderBeforeSend = await reminderRepo.findOne({
      where: { id: event.reminderId },
    });
    if (!reminderBeforeSend || reminderBeforeSend.status !== 'pending') {
      this.logger.debug(
        `reminder ${event.reminderId} no longer pending before send (status=${reminderBeforeSend?.status ?? 'missing'}) — ack`,
      );
      // Idempotency-safe: redelivery re-inserts a pre-claim row, re-checks
      // reminder status, and deletes again — no send attempted.
      await logRepo.delete({ id: row.id });
      return ACK;
    }

    // Persist rendered output before touching the provider.
    await logRepo.update(
      { id: row.id },
      {
        renderedSubject: rendered.subject,
        renderedHtml: rendered.html,
        renderedText: rendered.text,
      },
    );

    try {
      const result = await this.provider.send({
        to: event.reviewer.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      await this.dataSource.transaction(async (manager) => {
        const logRepoTx = manager.getRepository(EmailLog);
        await logRepoTx
          .createQueryBuilder()
          .update(EmailLog)
          .set({
            status: 'sent',
            providerMessageId: result.messageId,
            sentAt: new Date(),
            error: null,
          })
          .where('id = :id AND status IN (:...allowed)', {
            id: row.id,
            allowed: ['pending', 'failed'],
          })
          .execute();
        await manager
          .getRepository(Reminder)
          .update({ id: reminder.id }, { status: 'sent', sentAt: new Date() });
      });
      return ACK;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcomeKind = providerSendOutcome(err);
      const isTransient = outcomeKind === 'nack-requeue';
      const alreadyFailed = row.status === 'failed';
      this.logger.warn(
        `provider send failed key=${event.idempotencyKey}: ${message} (${outcomeKind})`,
      );
      await logRepo.update(
        { id: row.id },
        {
          status: 'failed',
          error: message.slice(0, 1000),
          retryCount: isTransient
            ? alreadyFailed
              ? row.retryCount
              : 0
            : MAX_RETRY_COUNT,
          nextRetryAt: isTransient
            ? alreadyFailed
              ? row.nextRetryAt
              : new Date(Date.now() + RETRY_DELAY_MS[0])
            : null,
        },
      );
      return { kind: outcomeKind, reason: message };
    }
  }
}
