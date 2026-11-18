import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailServiceClient } from '../email-client/email-client.service';
import type { ReminderAdminDto } from '../email-client/email-client.types';
import { Submission } from '../entities/submission.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import type { RequestUser } from '../common/types/request-user';
import { SubmissionAccessService } from './submission-access.service';

export type { ReminderAdminDto };

@Injectable()
export class RemindersService {
  constructor(
    private readonly emailClient: EmailServiceClient,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    private readonly access: SubmissionAccessService,
  ) {}

  /**
   * The submission must exist and sit inside the caller's journals. Without
   * the journal check, staff of one journal could read or cancel the reminders
   * of another journal's reviewers. Permission itself is enforced by
   * `AssignmentRemindersController`.
   */
  private async assertAssignmentScope(
    submissionSlug: string,
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<void> {
    const sub = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!sub) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.access.assertStaffSubmissionScope(sub, user);
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

  async listForAssignment(
    submissionSlug: string,
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto[]> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    return this.emailClient.listReminders(assignmentSlug);
  }

  /**
   * All reminders for every assignment on a submission, keyed by assignment slug.
   * One email-service round-trip instead of one per assignment.
   */
  async listForSubmission(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Record<string, ReminderAdminDto[]>> {
    const sub = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!sub) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.access.assertStaffSubmissionScope(sub, user);
    const assignments = await this.assignmentsRepo.find({
      where: { submissionId: sub.id },
      select: ['slug'],
    });
    const slugs = assignments
      .map((a) => a.slug)
      .filter((slug): slug is string => Boolean(slug));
    const rows = await this.emailClient.listRemindersForAssignments(slugs);
    const bySlug: Record<string, ReminderAdminDto[]> = Object.fromEntries(
      slugs.map((slug) => [slug, []]),
    );
    for (const row of rows) {
      (bySlug[row.assignmentSlug] ??= []).push(row);
    }
    return bySlug;
  }

  async getOne(
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    return this.emailClient.getReminder(reminderId, assignmentSlug);
  }

  async patchSendAt(
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
    sendAtIso: string,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    return this.emailClient.patchReminderSendAt(
      reminderId,
      assignmentSlug,
      sendAtIso,
    );
  }

  async cancel(
    submissionSlug: string,
    assignmentSlug: string,
    reminderId: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    return this.emailClient.cancelReminder(reminderId, assignmentSlug);
  }
}
