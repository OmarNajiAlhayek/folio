import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
  ) {}

  private hasPerm(user: RequestUser, slug: string): boolean {
    return user.permissionSlugs.includes(slug);
  }

  /**
   * Same editorial scope as listing assignments: must be able to list
   * assignments on the submission. `email.manage_reminders` is enforced
   * on the controller.
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

  private mapRow(row: Record<string, unknown>): ReminderAdminDto {
    return {
      id: String(row.id),
      assignmentSlug: String(row.assignment_slug),
      reviewerId: String(row.reviewer_id),
      reviewerEmail: String(row.reviewer_email),
      reviewerDisplayName: String(row.reviewer_display_name),
      kind: String(row.kind),
      sendAt: (row.send_at as Date).toISOString(),
      status: String(row.status),
      sentAt: row.sent_at ? (row.sent_at as Date).toISOString() : null,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  async listForAssignment(
    submissionSlug: string,
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto[]> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    const rows = (await this.dataSource.query(
      `SELECT id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
              kind, send_at, status, sent_at, created_at
         FROM "email"."reminder"
        WHERE assignment_slug = $1
        ORDER BY send_at ASC`,
      [assignmentSlug],
    )) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  async getOne(
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    const rows = (await this.dataSource.query(
      `SELECT id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
              kind, send_at, status, sent_at, created_at
         FROM "email"."reminder"
        WHERE id = $1 AND assignment_slug = $2`,
      [reminderId, assignmentSlug],
    )) as Record<string, unknown>[];
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

    const existing = (await this.dataSource.query(
      `SELECT id, status FROM "email"."reminder" WHERE id = $1 AND assignment_slug = $2`,
      [reminderId, assignmentSlug],
    )) as Array<{ id: string; status: string }>;
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

    const updated = (await this.dataSource.query(
      `UPDATE "email"."reminder"
          SET send_at = $1::timestamptz
        WHERE id = $2 AND assignment_slug = $3 AND status = 'pending'
        RETURNING id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
                  kind, send_at, status, sent_at, created_at`,
      [sendAt.toISOString(), reminderId, assignmentSlug],
    )) as Record<string, unknown>[];
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
    const existing = (await this.dataSource.query(
      `SELECT id, status FROM "email"."reminder" WHERE id = $1 AND assignment_slug = $2`,
      [reminderId, assignmentSlug],
    )) as Array<{ id: string; status: string }>;
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

    const updated = (await this.dataSource.query(
      `UPDATE "email"."reminder"
          SET status = 'cancelled'
        WHERE id = $1 AND assignment_slug = $2 AND status = 'pending'
        RETURNING id, assignment_slug, reviewer_id, reviewer_email, reviewer_display_name,
                  kind, send_at, status, sent_at, created_at`,
      [reminderId, assignmentSlug],
    )) as Record<string, unknown>[];
    if (updated.length === 0) {
      throw new UnprocessableEntityException({
        message: 'Reminder could not be cancelled (no longer pending)',
        code: 'REMINDER_NOT_PENDING',
      });
    }
    return this.mapRow(updated[0]);
  }
}
