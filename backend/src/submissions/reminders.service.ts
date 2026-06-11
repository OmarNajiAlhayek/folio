import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailServiceClient } from '../email-client/email-client.service';
import type { ReminderAdminDto } from '../email-client/email-client.types';
import { Submission } from '../entities/submission.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';

export type { ReminderAdminDto };

@Injectable()
export class RemindersService {
  constructor(
    private readonly emailClient: EmailServiceClient,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
  ) {}

  private hasPerm(user: RequestUser, slug: string): boolean {
    return user.permissionSlugs.includes(slug);
  }

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

  async listForAssignment(
    submissionSlug: string,
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<ReminderAdminDto[]> {
    await this.assertAssignmentScope(submissionSlug, assignmentSlug, user);
    return this.emailClient.listReminders(assignmentSlug);
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
