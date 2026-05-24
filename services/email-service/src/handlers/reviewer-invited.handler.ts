import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EmailLog } from '../email-log/email-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { TemplatesService } from '../templates/templates.service';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import {
  ReviewerInvitedEvent,
} from '../contracts/email-events';
import { redactEventPayload } from '../shared/redactor';
import { reviewerInvitedKey } from '../shared/idempotency';
import { ACK, HandlerOutcome } from './handler-result';
import { ReminderPolicyService } from '../policy/reminder-policy.service';
import { normalizeEmailLocale } from '../common/email-locale';

/**
 * Implements the state machine documented in plan §6:
 *
 *   1. Pre-claim: INSERT INTO email_log ... ON CONFLICT DO NOTHING.
 *   2. If 1 row inserted, also insert Reminder rows in the same TX.
 *   3. Commit. Pre-claim row guarantees redeliveries lose the race.
 *   4. Render template + call provider (outside the transaction).
 *   5. Success -> UPDATE email_log SET status='sent' WHERE status IN
 *      ('pending','failed').
 *   6. Failure -> UPDATE email_log SET status='failed' and nack so
 *      RabbitMQ retries / dead-letters.
 *
 * Critical: on conflict, we LOAD the existing row and branch on its
 * status, so a crash between commit and send (status='pending', no
 * row written by the original worker) gets resumed by a redelivery —
 * not silently acked.
 */
@Injectable()
export class ReviewerInvitedHandler {
  private readonly logger = new Logger(ReviewerInvitedHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
    private readonly reminderPolicy: ReminderPolicyService,
  ) {}

  async handle(event: ReviewerInvitedEvent): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== reviewerInvitedKey(event.assignmentSlug)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }

    let row: EmailLog;
    try {
      row = await this.dataSource.transaction(async (manager) =>
        this.preclaimAndScheduleReminders(manager, event),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `pre-claim transaction failed: ${message} ${JSON.stringify(
          redactEventPayload(event),
        )}`,
      );
      throw err;
    }

    if (row.status === 'sent') {
      this.logger.debug(
        `reviewer.invited duplicate (already sent) key=${event.idempotencyKey}`,
      );
      return ACK;
    }

    return this.renderAndSend(row, event);
  }

  private async preclaimAndScheduleReminders(
    manager: EntityManager,
    event: ReviewerInvitedEvent,
  ): Promise<EmailLog> {
    const logRepo = manager.getRepository(EmailLog);
    const reminderRepo = manager.getRepository(Reminder);

    // Raw INSERT ... ON CONFLICT DO NOTHING because TypeORM's
    // _QueryDeepPartialEntity is too strict for arbitrary jsonb shapes.
    // The semantics match plan §6 step 1: 1 row inserted = first
    // delivery, 0 rows = duplicate (caller branches on existing row).
    const insertResult = (await manager.query(
      `INSERT INTO "email"."email_log" (
         "idempotency_key", "recipient", "template", "context", "status"
       ) VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT ("idempotency_key") DO NOTHING
       RETURNING "id"`,
      [
        event.idempotencyKey,
        event.reviewer.email,
        'reviewer-invited',
        JSON.stringify(event),
        'pending',
      ],
    )) as Array<{ id: string }>;
    const insertedId = insertResult[0]?.id;

    if (!insertedId) {
      const existing = await logRepo.findOne({
        where: { idempotencyKey: event.idempotencyKey },
      });
      if (!existing) {
        throw new Error(
          'pre-claim conflict but row not found; concurrent transaction visibility issue',
        );
      }
      return existing;
    }

    const offsets = await this.reminderPolicy.getDueOffsetsMs();
    const now = Date.now();
    const emailLocale = normalizeEmailLocale(event.emailLocale);
    await reminderRepo.save([
      reminderRepo.create({
        assignmentSlug: event.assignmentSlug,
        reviewerId: event.reviewer.id,
        reviewerEmail: event.reviewer.email,
        reviewerDisplayName: event.reviewer.displayName,
        kind: 'review_due_soon',
        emailLocale,
        sendAt: new Date(now + offsets.dueSoonMs),
        status: 'pending',
      }),
      reminderRepo.create({
        assignmentSlug: event.assignmentSlug,
        reviewerId: event.reviewer.id,
        reviewerEmail: event.reviewer.email,
        reviewerDisplayName: event.reviewer.displayName,
        kind: 'review_overdue',
        emailLocale,
        sendAt: new Date(now + offsets.overdueMs),
        status: 'pending',
      }),
    ]);

    const fresh = await logRepo.findOne({ where: { id: insertedId } });
    if (!fresh) {
      throw new Error('pre-claim row vanished after insert');
    }
    return fresh;
  }

  private async renderAndSend(
    row: EmailLog,
    event: ReviewerInvitedEvent,
  ): Promise<HandlerOutcome> {
    const logRepo = this.dataSource.getRepository(EmailLog);
    const emailLocale = normalizeEmailLocale(event.emailLocale);
    const rendered = await this.templates.render('reviewer-invited', emailLocale, {
      reviewerDisplayName: event.reviewer.displayName,
      submissionTitle: event.submissionTitle,
      acceptUrl: event.acceptUrl,
      declineUrl: event.declineUrl,
    });
    try {
      const result = await this.provider.send({
        to: event.reviewer.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      const updated = await logRepo
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
      if (!updated.affected) {
        this.logger.debug(
          `reviewer.invited concurrent winner already updated key=${event.idempotencyKey}`,
        );
      }
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
