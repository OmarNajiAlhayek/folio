import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { isTransientDeliveryError } from '../common/transient-error.util';
import {
  MAX_RETRY_COUNT,
  RETRY_DELAY_MS,
} from '../common/email-retry.constants';
import { Reminder } from '../reminders/reminder.entity';

const BATCH_SIZE = 20;

type FailedRow = {
  id: string;
  recipient: string;
  rendered_subject: string;
  rendered_html: string;
  rendered_text: string;
  retry_count: number;
  /** Present when the email_log was created by the reminder-due handler. */
  reminder_id: string | null;
};

/**
 * Scans email_log for status='failed' rows that have a next_retry_at in the
 * past and resends them using the rendered output stored at the time of the
 * original send attempt, so no template variables need to be re-derived.
 *
 * Backoff schedule (RETRY_DELAY_MS): 5 min → 15 min → 1 h → 4 h.
 * After MAX_RETRY_COUNT (4) cron attempts the row is left as failed
 * (next_retry_at=NULL) and must be resolved by an operator.
 *
 * The claim UPDATE uses FOR UPDATE SKIP LOCKED so multiple instances of the
 * email-service never double-send the same row.  Bumping next_retry_at to a
 * 10-minute claim window also acts as a crash-safe lease: if the process dies
 * between claim and send the row becomes claimable again after 10 minutes with
 * its original retry_count intact.
 */
@Injectable()
export class FailedEmailRetryerService {
  private readonly logger = new Logger(FailedEmailRetryerService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
  ) {}

  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.claimDueRows();
      if (rows.length > 0) {
        this.logger.log(`retrying ${rows.length} failed email(s)`);
      }
      for (const row of rows) {
        await this.retryOne(row);
      }
    } catch (err) {
      this.logger.warn(
        `retry tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claimDueRows(): Promise<FailedRow[]> {
    // Atomically claim eligible rows: bump next_retry_at by 10 minutes as a
    // crash-safe lease.  If the process dies, the row re-enters the eligible
    // window after 10 minutes with its original retry_count unchanged.
    const raw = (await this.dataSource.query(
      `UPDATE "email"."email_log"
          SET "next_retry_at" = now() + interval '10 minutes'
        WHERE "id" IN (
          SELECT "id"
            FROM "email"."email_log"
           WHERE "status"        = 'failed'
             AND "next_retry_at" IS NOT NULL
             AND "next_retry_at" <= now()
             AND "retry_count"   < $1
             AND "rendered_subject" IS NOT NULL
             AND "rendered_html"    IS NOT NULL
             AND "rendered_text"    IS NOT NULL
           ORDER BY "next_retry_at" ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )
        RETURNING
          "id",
          "recipient",
          "rendered_subject",
          "rendered_html",
          "rendered_text",
          "retry_count",
          ("context" ->> 'reminderId') AS reminder_id`,
      [MAX_RETRY_COUNT, BATCH_SIZE],
    )) as FailedRow[];
    return raw;
  }

  private async retryOne(row: FailedRow): Promise<void> {
    try {
      const result = await this.provider.send({
        to: row.recipient,
        subject: row.rendered_subject,
        html: row.rendered_html,
        text: row.rendered_text,
      });
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE "email"."email_log"
              SET "status" = 'sent', "sent_at" = now(),
                  "provider_message_id" = $1, "error" = NULL,
                  "next_retry_at" = NULL
            WHERE "id" = $2`,
          [result.messageId, row.id],
        );
        // Mark the reminder row sent so the scheduler stops re-publishing it.
        if (row.reminder_id) {
          await manager
            .getRepository(Reminder)
            .update(
              { id: row.reminder_id },
              { status: 'sent', sentAt: new Date() },
            );
        }
      });
      this.logger.log(
        `retry succeeded id=${row.id} attempt=${row.retry_count + 1}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextCount = row.retry_count + 1;
      const nextDelay = RETRY_DELAY_MS[nextCount] as number | undefined;
      const nextRetryAt =
        nextDelay != null && isTransientDeliveryError(err)
          ? new Date(Date.now() + nextDelay)
          : null;
      this.logger.warn(
        `retry failed id=${row.id} attempt=${nextCount}: ${message}` +
          (nextRetryAt
            ? ` — next at ${nextRetryAt.toISOString()}`
            : ' — exhausted'),
      );
      await this.dataSource.query(
        `UPDATE "email"."email_log"
            SET "retry_count"   = $1,
                "next_retry_at" = $2,
                "error"         = $3
          WHERE "id" = $4`,
        [nextCount, nextRetryAt, message.slice(0, 1000), row.id],
      );
    }
  }
}
