import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { EmailServiceClient } from '../email-client/email-client.service';
import { RemindersService } from './reminders.service';
import { Submission } from '../entities/submission.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

function user(perms: string[]): RequestUser {
  return {
    sub: 'u1',
    email: 'e@test.dev',
    roleSlugs: [],
    permissionSlugs: perms,
  };
}

describe('RemindersService', () => {
  let service: RemindersService;
  let emailClient: jest.Mocked<
    Pick<
      EmailServiceClient,
      'listReminders' | 'getReminder' | 'patchReminderSendAt' | 'cancelReminder'
    >
  >;
  let submissionsRepo: { findOne: jest.Mock };
  let assignmentsRepo: { findOne: jest.Mock };

  beforeEach(() => {
    emailClient = {
      listReminders: jest.fn(),
      getReminder: jest.fn(),
      patchReminderSendAt: jest.fn(),
      cancelReminder: jest.fn(),
    };
    submissionsRepo = { findOne: jest.fn() };
    assignmentsRepo = { findOne: jest.fn() };
    service = new RemindersService(
      emailClient as unknown as EmailServiceClient,
      submissionsRepo as unknown as Repository<Submission>,
      assignmentsRepo as unknown as Repository<ReviewAssignment>,
    );
  });

  it('listForAssignment allows journal managers (caller auth is on the controller)', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    emailClient.listReminders.mockResolvedValue([]);

    await expect(
      service.listForAssignment(
        'sub-1',
        'asg-1',
        user([PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS]),
      ),
    ).resolves.toEqual([]);
  });

  it('listForAssignment returns rows from email client', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const sendAt = '2026-06-01T12:00:00.000Z';
    emailClient.listReminders.mockResolvedValue([
      {
        id: 'r1',
        assignmentSlug: 'asg-1',
        reviewerId: 'rev1',
        reviewerEmail: 'r@test.dev',
        reviewerDisplayName: 'R',
        kind: 'review_due_soon',
        sendAt,
        status: 'pending',
        sentAt: null,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ]);

    const out = await service.listForAssignment(
      'sub-1',
      'asg-1',
      user([PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS]),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'r1',
      assignmentSlug: 'asg-1',
      reviewerId: 'rev1',
      kind: 'review_due_soon',
      status: 'pending',
      sentAt: null,
    });
    expect(emailClient.listReminders).toHaveBeenCalledWith('asg-1');
  });

  it('patchSendAt rejects sendAt within 2 minutes via email client', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const tooSoon = new Date(Date.now() + 60_000).toISOString();
    emailClient.patchReminderSendAt.mockRejectedValue(
      new UnprocessableEntityException({
        message: 'sendAt must be more than 2 minutes in the future',
        code: 'REMINDER_SEND_AT_TOO_SOON',
      }),
    );

    await expect(
      service.patchSendAt(
        'sub-1',
        'asg-1',
        'r1',
        user([PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS]),
        tooSoon,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('patchSendAt delegates to email client', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const sendAt = new Date(Date.now() + 10 * 60_000).toISOString();
    emailClient.patchReminderSendAt.mockResolvedValue({
      id: 'r1',
      assignmentSlug: 'asg-1',
      reviewerId: 'rev1',
      reviewerEmail: 'r@test.dev',
      reviewerDisplayName: 'R',
      kind: 'review_due_soon',
      sendAt,
      status: 'pending',
      sentAt: null,
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    const out = await service.patchSendAt(
      'sub-1',
      'asg-1',
      'r1',
      user([PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS]),
      sendAt,
    );

    expect(out.id).toBe('r1');
    expect(out.sendAt).toBe(sendAt);
    expect(emailClient.patchReminderSendAt).toHaveBeenCalledWith(
      'r1',
      'asg-1',
      sendAt,
    );
  });

  it('cancel delegates to email client', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    emailClient.cancelReminder.mockResolvedValue({
      id: 'r1',
      assignmentSlug: 'asg-1',
      reviewerId: 'rev1',
      reviewerEmail: 'r@test.dev',
      reviewerDisplayName: 'R',
      kind: 'review_due_soon',
      sendAt: '2026-06-01T12:00:00.000Z',
      status: 'cancelled',
      sentAt: null,
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    const out = await service.cancel(
      'sub-1',
      'asg-1',
      'r1',
      user([PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS]),
    );

    expect(out.status).toBe('cancelled');
  });

  it('getOne throws when reminder missing', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    emailClient.getReminder.mockRejectedValue(
      new NotFoundException({
        message: 'Reminder not found',
        code: 'NOT_FOUND',
      }),
    );
    await expect(
      service.getOne(
        'sub-1',
        'asg-1',
        '00000000-0000-0000-0000-000000000001',
        user([PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS]),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
