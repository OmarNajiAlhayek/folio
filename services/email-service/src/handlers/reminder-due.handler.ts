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
import { ReminderDueEvent } from '../contracts/email-events';
import { redactEventPayload } from '../shared/redactor';
import { reminderDueKey } from '../shared/idempotency';
import { ACK, HandlerOutcome } from './handler-result';
import { normalizeEmailLocale } from '../common/email-locale';

/**
 * Same state machine as `ReviewerInvitedHandler` but for the scheduled
 * reminder path. Templates differ; the rest is identical. After a
 * successful provider send, persisting `email_log` → `sent` and the
 * `reminder` row → `sent` uses one DB transaction so both commit or
 * neither does.
 *
 * v1 fallback for "assignment may have been completed before send":
 * before publishing the email, we re-load the Reminder row and only
 * proceed if it's still `status='pending'`. Once we have a
 * `ReviewerResponded` event upstream, the cron can flip these rows to
 * `cancelled` proactively.
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

    const insertResult = (await this.dataSource.query(
      `INSERT INTO "email"."email_log" (
         "idempotency_key", "recipient", "template", "context", "status"
       ) VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT ("idempotency_key") DO NOTHING
       RETURNING "id"`,
      [
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
    const rendered = await this.templates.render('reminder-due', locale, {
      reviewerDisplayName: event.reviewer.displayName,
      submissionTitle: '[manuscript]',
      assignmentUrl: `${baseUrl}/assignments/${event.assignmentSlug}`,
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
      await logRepo.update(
        { id: row.id },
        {
          status: 'failed',
          error: 'reminder_no_longer_pending_before_send',
        },
      );
      return ACK;
    }

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
        await manager.getRepository(Reminder).update(
          { id: reminder.id },
          { status: 'sent', sentAt: new Date() },
        );
      });
      return ACK;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `provider send failed key=${event.idempotencyKey}: ${message}`,
      );
      await logRepo.update(
        { id: row.id },
        { status: 'failed', error: message.slice(0, 1000) },
      );
      return { kind: 'nack-no-requeue', reason: message };
    }
  }
}
