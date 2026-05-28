import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';

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
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
  ) {}

  private async query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    try {
      const raw = await this.dataSource.query(sql, params);
      return this.normalizeQueryResult<T>(raw);
    } catch (err) {
      this.rethrowUnlessPermissionDenied(err);
    }
  }

  /**
   * TypeORM `query()` returns `[rows, rowCount]` for UPDATE/DELETE … RETURNING,
   * and a plain row array for SELECT.
   */
  private normalizeQueryResult<T extends Record<string, unknown>>(
    raw: unknown,
  ): T[] {
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

  private normalizeRows<T extends Record<string, unknown>>(raw: unknown[]): T[] {
    return raw.map((entry) => this.unwrapRow(entry) as T);
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

  private hasPerm(user: RequestUser, slug: string): boolean {
    return user.permissionSlugs.includes(slug);
  }

  /**
   * Same editorial scope as listing assignments: must be able to list
   * assignments on the submission. Per-assignment reminder admin is enforced
   * on the controller (`email.manage_assignment_reminders` or global
   * `email.manage_reminders`).
   */
  private async assertAssignmentScope(
    submissionSlug: string,
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<void> {
    if (!this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS)) {
      throw new ForbiddenException({
        message: 'Editor role required',
        code: 'FORBIDDEN',
      });
    }
    const sub = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!sub) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, submissionId: sub.id },
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
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
        sentAtRaw != null && sentAtRaw !== ''
          ? this.toIso(sentAtRaw)
          : null,
      createdAt: this.toIso(this.pick(row, 'created_at')),
    };
  }

  private rethrowUnlessPermissionDenied(err: unknown): never {
    const driverErr = this.getPgDriverError(err);
    const message =
      driverErr?.message ?? (err instanceof Error ? err.message : '') ?? '';
    const code =
      driverErr?.code ??
      (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code?: string }).code === 'string'
        ? (err as { code: string }).code
        : undefined);
    const looksLikeQueryFailed =
      err instanceof QueryFailedError ||
      (typeof err === 'object' &&
        err !== null &&
        (err as { name?: string }).name === 'QueryFailedError') ||
      driverErr !== undefined;

    if (
      looksLikeQueryFailed &&
      (code === '42501' || /permission denied/i.test(message))
    ) {
      this.logger.error(
        `Reminder admin DB permission denied: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ForbiddenException({
        message:
          'Database permission denied for email reminders. Apply grants for the app DB role (see backend/scripts/grant-email-reminder-admin.sql).',
        code: 'EMAIL_DB_FORBIDDEN',
      });
    }
    throw err;
  }

  private getPgDriverError(
    err: unknown,
  ): { code?: string; message?: string } | undefined {
    if (err instanceof QueryFailedError) {
      return err.driverError as { code?: string; message?: string };
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      'driverError' in err &&
      typeof (err as { driverError?: unknown }).driverError === 'object' &&
      (err as { driverError?: unknown }).driverError !== null
    ) {
      return (err as { driverError: { code?: string; message?: string } })
        .driverError;
    }
    return undefined;
  }

  async listForAssignment(
    submissionSlug: string,
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto[]> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    const rows = await this.query<Record<string, unknown>>(
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
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    const rows = await this.query<Record<string, unknown>>(
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
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
    sendAtIso: string,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
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

    const existing = await this.query<{ id: string; status: string }>(
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

    const updated = await this.query<Record<string, unknown>>(
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

  async cancel(
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    const existing = await this.query<{ id: string; status: string }>(
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

    const updated = await this.query<Record<string, unknown>>(
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
