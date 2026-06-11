import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { redactOperatorErrorMessage } from '../common/email-operator-error-redaction';

const FAILED_SAMPLE_LIMIT = 15;
const STUCK_REMINDER_MINUTES = 15;

export type EmailLogStatusCount = {
  pending: number;
  sent: number;
  failed: number;
};

export type FailedEmailSample = {
  id: string;
  idempotencyKey: string;
  template: string;
  createdAt: string;
  errorRedacted: string | null;
};

export type ReminderStatusCount = {
  pending: number;
  sent: number;
  cancelled: number;
};

export type EmailPipelineSlice = {
  emailLog: {
    counts: EmailLogStatusCount;
    failedSample: FailedEmailSample[];
  };
  reminders: {
    counts: ReminderStatusCount;
    stuckPendingPastDue: number;
  };
};

@Injectable()
export class PipelineObservabilityService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getPipelineSlice(): Promise<EmailPipelineSlice> {
    const emailLog = await this.loadEmailLogSection();
    const reminders = await this.loadReminderSection();
    return { emailLog, reminders };
  }

  private async loadEmailLogSection(): Promise<{
    counts: EmailLogStatusCount;
    failedSample: FailedEmailSample[];
  }> {
    const counts: EmailLogStatusCount = {
      pending: 0,
      sent: 0,
      failed: 0,
    };
    const rows = (await this.dataSource.query(
      `SELECT status, COUNT(*)::int AS c
         FROM "email"."email_log"
        GROUP BY status`,
    )) as Array<{ status: string; c: number }>;
    for (const r of rows) {
      if (r.status === 'pending') counts.pending = r.c;
      else if (r.status === 'sent') counts.sent = r.c;
      else if (r.status === 'failed') counts.failed = r.c;
    }

    const failedRows = (await this.dataSource.query(
      `SELECT id, idempotency_key, template, created_at, error
         FROM "email"."email_log"
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT $1`,
      [FAILED_SAMPLE_LIMIT],
    )) as Array<{
      id: string;
      idempotency_key: string;
      template: string;
      created_at: Date;
      error: string | null;
    }>;

    const failedSample: FailedEmailSample[] = failedRows.map((r) => ({
      id: r.id,
      idempotencyKey: r.idempotency_key,
      template: r.template,
      createdAt: new Date(r.created_at).toISOString(),
      errorRedacted: redactOperatorErrorMessage(r.error),
    }));

    return { counts, failedSample };
  }

  private async loadReminderSection(): Promise<{
    counts: ReminderStatusCount;
    stuckPendingPastDue: number;
  }> {
    const counts: ReminderStatusCount = {
      pending: 0,
      sent: 0,
      cancelled: 0,
    };
    const rows = (await this.dataSource.query(
      `SELECT status, COUNT(*)::int AS c
         FROM "email"."reminder"
        GROUP BY status`,
    )) as Array<{ status: string; c: number }>;
    for (const r of rows) {
      if (r.status === 'pending') counts.pending = r.c;
      else if (r.status === 'sent') counts.sent = r.c;
      else if (r.status === 'cancelled') counts.cancelled = r.c;
    }

    const stuckRows = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS c
         FROM "email"."reminder"
        WHERE status = 'pending'
          AND send_at < NOW() - ($1::int * INTERVAL '1 minute')`,
      [STUCK_REMINDER_MINUTES],
    )) as Array<{ c: number }>;

    return {
      counts,
      stuckPendingPastDue: stuckRows[0]?.c ?? 0,
    };
  }
}
