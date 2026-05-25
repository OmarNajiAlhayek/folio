import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
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
  let dataSource: { query: jest.Mock };
  let submissionsRepo: { findOne: jest.Mock };
  let assignmentsRepo: { findOne: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    submissionsRepo = { findOne: jest.fn() };
    assignmentsRepo = { findOne: jest.fn() };
    service = new RemindersService(
      dataSource as unknown as DataSource,
      submissionsRepo as unknown as Repository<Submission>,
      assignmentsRepo as unknown as Repository<ReviewAssignment>,
    );
  });

  it('listForAssignment forbids without list-assignments permission', async () => {
    await expect(
      service.listForAssignment('sub-1', 'asg-1', user([PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listForAssignment returns mapped rows', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const sendAt = new Date('2026-06-01T12:00:00.000Z');
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    dataSource.query.mockResolvedValue([
      {
        id: 'r1',
        assignment_slug: 'asg-1',
        reviewer_id: 'rev1',
        reviewer_email: 'r@test.dev',
        reviewer_display_name: 'R',
        kind: 'review_due_soon',
        send_at: sendAt,
        status: 'pending',
        sent_at: null,
        created_at: createdAt,
      },
    ]);

    const out = await service.listForAssignment(
      'sub-1',
      'asg-1',
      user([
        PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
        PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
      ]),
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
    expect(out[0].sendAt).toBe(sendAt.toISOString());
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "email"."reminder"'),
      ['asg-1'],
    );
  });

  it('getOne throws when reminder missing', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    dataSource.query.mockResolvedValue([]);
    await expect(
      service.getOne(
        'sub-1',
        'asg-1',
        '00000000-0000-0000-0000-000000000001',
        user([
          PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
          PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
        ]),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
