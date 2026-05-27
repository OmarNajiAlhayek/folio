import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Reminder } from './reminder.entity';
import { RabbitMqConnection } from '../amqp/rabbitmq.connection';
import {
  ReminderDueEvent,
  ROUTING_KEY,
} from '../contracts/email-events';
import { reminderDueKey } from '../shared/idempotency';
import { normalizeEmailLocale } from '../common/email-locale';
import { unwrapPgQueryRows } from '../common/unwrap-pg-query-rows';

const BATCH_SIZE = 50;
/** Stale picks are reclaimed after this interval (crashed scheduler instance). */
const PICK_LEASE_MS = 300_000;

type ReminderRow = {
  id: string;
  assignment_slug: string;
  submission_title: string;
  reviewer_id: string;
  reviewer_email: string;
  reviewer_display_name: string;
  kind: string;
  email_locale: string;
  send_at: Date;
  status: string;
};

/**
 * Picks due `email.reminder` rows with `FOR UPDATE SKIP LOCKED`, publishes
 * `reminder.due` events, and clears `picked_at` on publish failure.
 */
@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rabbit: RabbitMqConnection,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.claimDueReminders();
      for (const reminder of due) {
        await this.publishOne(reminder);
      }
    } catch (err) {
      this.logger.warn(
        `reminders tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claimDueReminders(): Promise<ReminderRow[]> {
    const raw = await this.dataSource.query(
      `UPDATE "email"."reminder" AS r
          SET "picked_at" = now()
        WHERE r."id" IN (
          SELECT "id"
            FROM "email"."reminder"
           WHERE "status" = 'pending'
             AND "send_at" <= now()
             AND (
               "picked_at" IS NULL
               OR "picked_at" < now() - ($2::int * interval '1 millisecond')
             )
           ORDER BY "send_at" ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING r."id", r."assignment_slug", r."submission_title",
                  r."reviewer_id", r."reviewer_email", r."reviewer_display_name",
                  r."kind", r."email_locale", r."send_at", r."status"`,
      [BATCH_SIZE, PICK_LEASE_MS],
    );
    return unwrapPgQueryRows<ReminderRow>(raw);
  }

  private async publishOne(reminder: ReminderRow): Promise<void> {
    const event: ReminderDueEvent = {
      type: 'ReminderDue',
      occurredAt: new Date().toISOString(),
      idempotencyKey: reminderDueKey(reminder.id),
      reminderId: reminder.id,
      kind: reminder.kind as ReminderDueEvent['kind'],
      assignmentSlug: reminder.assignment_slug,
      emailLocale: normalizeEmailLocale(reminder.email_locale),
      submissionTitle: reminder.submission_title?.trim() || '[manuscript]',
      reviewer: {
        id: reminder.reviewer_id,
        email: reminder.reviewer_email,
        displayName: reminder.reviewer_display_name,
      },
      dueAt: reminder.send_at.toISOString(),
    };
    try {
      await this.rabbit.publish(
        ROUTING_KEY.reminderDue,
        event as unknown as Record<string, unknown>,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `failed to publish reminder.due id=${reminder.id}: ${message}`,
      );
      await this.dataSource.query(
        `UPDATE "email"."reminder" SET "picked_at" = NULL WHERE "id" = $1 AND "status" = 'pending'`,
        [reminder.id],
      );
    }
  }
}
