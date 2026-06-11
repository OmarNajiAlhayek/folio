import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const MIN_LEAD_MS = 120_000;

export type ReminderAdminDto = {
  id: string;
  assignmentSlug: string;
  reviewerId: string;
  reviewerEmail: string;
  reviewerDisplayName: string;
  kind: string;
  sendAt: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
};

@Injectable()
export class ReminderAdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private normalizeRows(raw: unknown[]): Record<string, unknown>[] {
    return raw.map((entry) => this.unwrapRow(entry));
  }

  private unwrapRow(entry: unknown): Record<string, unknown> {
    let current: unknown = entry;
    while (Array.isArray(current)) {
      if (current.length === 0) {
        throw new Error('Expected query row object');
      }
      current = current[0];
    }
    if (!current || typeof current !== 'object') {
      throw new Error('Expected query row object');
    }
    return current as Record<string, unknown>;
  }

  private normalizeQueryResult(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return [];
    if (
      raw.length === 2 &&
      Array.isArray(raw[0]) &&
      typeof raw[1] === 'number'
    ) {
      return this.normalizeRows(raw[0] as unknown[]);
    }
    return this.normalizeRows(raw);
  }

  private async query(
    sql: string,
    params?: unknown[],
  ): Promise<Record<string, unknown>[]> {
    const raw = await this.dataSource.query(sql, params);
    return this.normalizeQueryResult(raw);
  }

  private pick(row: Record<string, unknown>, snake: string): unknown {
    if (row[snake] !== undefined) return row[snake];
    const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    return row[camel];
  }

  private toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    throw new Error(`Invalid timestamptz value: ${String(value)}`);
  }

  private mapRow(row: Record<string, unknown>): ReminderAdminDto {
    const sentAtRaw = this.pick(row, 'sent_at');
    return {
      id: String(this.pick(row, 'id')),
      assignmentSlug: String(this.pick(row, 'assignment_slug')),
      reviewerId: String(this.pick(row, 'reviewer_id')),
      reviewerEmail: String(this.pick(row, 'reviewer_email')),
      reviewerDisplayName: String(this.pick(row, 'reviewer_display_name')),
      kind: String(this.pick(row, 'kind')),
      sendAt: this.toIso(this.pick(row, 'send_at')),
      status: String(this.pick(row, 'status')),
      sentAt:
        sentAtRaw != null && sentAtRaw !== '' ? this.toIso(sentAtRaw) : null,
      createdAt: this.toIso(this.pick(row, 'created_at')),
    };
  }

  async listForAssignment(assignmentSlug: string): Promise<ReminderAdminDto[]> {
    const rows = await this.query(
      `SELECT id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
              kind, send_at, status, sent_at, created_at
         FROM "email"."reminder"
        WHERE assignment_slug = $1
        ORDER BY send_at ASC`,
      [assignmentSlug],
    );
    return rows.map((r) => this.mapRow(r));
  }

  async getOne(
    reminderId: string,
    assignmentSlug: string,
  ): Promise<ReminderAdminDto> {
    const rows = await this.query(
      `SELECT id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
              kind, send_at, status, sent_at, created_at
         FROM "email"."reminder"
        WHERE id = $1 AND assignment_slug = $2`,
      [reminderId, assignmentSlug],
    );
    if (rows.length === 0) {
      throw new NotFoundException({
        message: 'Reminder not found',
        code: 'NOT_FOUND',
      });
    }
    return this.mapRow(rows[0]);
  }

  async patchSendAt(
    reminderId: string,
    assignmentSlug: string,
    sendAtIso: string,
  ): Promise<ReminderAdminDto> {
    const sendAt = new Date(sendAtIso);
    if (Number.isNaN(sendAt.getTime())) {
      throw new UnprocessableEntityException({
        message: 'sendAt must be a valid ISO-8601 datetime',
        code: 'REMINDER_INVALID_SEND_AT',
      });
    }
    const minAt = new Date(Date.now() + MIN_LEAD_MS);
    if (sendAt.getTime() <= minAt.getTime()) {
      throw new UnprocessableEntityException({
        message: `sendAt must be more than ${MIN_LEAD_MS / 60000} minutes in the future`,
        code: 'REMINDER_SEND_AT_TOO_SOON',
      });
    }

    const existing = await this.query(
      `SELECT id, status FROM "email"."reminder" WHERE id = $1 AND assignment_slug = $2`,
      [reminderId, assignmentSlug],
    );
    if (existing.length === 0) {
      throw new NotFoundException({
        message: 'Reminder not found',
        code: 'NOT_FOUND',
      });
    }
    if (existing[0].status !== 'pending') {
      throw new UnprocessableEntityException({
        message: 'Only pending reminders can be rescheduled',
        code: 'REMINDER_NOT_PENDING',
      });
    }

    const updated = await this.query(
      `UPDATE "email"."reminder"
          SET send_at = $1::timestamptz
        WHERE id = $2 AND assignment_slug = $3 AND status = 'pending'
        RETURNING id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
                  kind, send_at, status, sent_at, created_at`,
      [sendAt.toISOString(), reminderId, assignmentSlug],
    );
    if (updated.length === 0) {
      throw new UnprocessableEntityException({
        message: 'Reminder could not be updated (no longer pending)',
        code: 'REMINDER_NOT_PENDING',
      });
    }
    return this.mapRow(updated[0]);
  }

  async cancelAllPendingForAssignment(
    assignmentSlug: string,
  ): Promise<{ cancelledCount: number }> {
    const raw = await this.dataSource.query(
      `UPDATE "email"."reminder"
          SET status = 'cancelled'
        WHERE assignment_slug = $1 AND status = 'pending'`,
      [assignmentSlug],
    );
    const rowCount =
      Array.isArray(raw) && typeof raw[1] === 'number' ? raw[1] : 0;
    return { cancelledCount: rowCount };
  }

  async cancel(
    reminderId: string,
    assignmentSlug: string,
  ): Promise<ReminderAdminDto> {
    const existing = await this.query(
      `SELECT id, status FROM "email"."reminder" WHERE id = $1 AND assignment_slug = $2`,
      [reminderId, assignmentSlug],
    );
    if (existing.length === 0) {
      throw new NotFoundException({
        message: 'Reminder not found',
        code: 'NOT_FOUND',
      });
    }
    if (existing[0].status !== 'pending') {
      throw new UnprocessableEntityException({
        message: 'Only pending reminders can be cancelled',
        code: 'REMINDER_NOT_PENDING',
      });
    }

    const updated = await this.query(
      `UPDATE "email"."reminder"
          SET status = 'cancelled'
        WHERE id = $1 AND assignment_slug = $2 AND status = 'pending'
        RETURNING id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
                  kind, send_at, status, sent_at, created_at`,
      [reminderId, assignmentSlug],
    );
    if (updated.length === 0) {
      throw new UnprocessableEntityException({
        message: 'Reminder could not be cancelled (no longer pending)',
        code: 'REMINDER_NOT_PENDING',
      });
    }
    return this.mapRow(updated[0]);
  }
}
