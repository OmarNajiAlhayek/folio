import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
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

  it('patchSendAt rejects sendAt within 2 minutes', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    dataSource.query.mockResolvedValueOnce([{ id: 'r1', status: 'pending' }]);

    const tooSoon = new Date(Date.now() + 60_000).toISOString();
    await expect(
      service.patchSendAt(
        'sub-1',
        'asg-1',
        'r1',
        user([
          PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
          PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
        ]),
        tooSoon,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('patchSendAt unwraps TypeORM UPDATE RETURNING [rows, rowCount]', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const sendAt = new Date(Date.now() + 10 * 60_000);
    const row = {
      id: 'r1',
      assignment_slug: 'asg-1',
      reviewer_id: 'rev1',
      reviewer_email: 'r@test.dev',
      reviewer_display_name: 'R',
      kind: 'review_due_soon',
      send_at: sendAt,
      status: 'pending',
      sent_at: null,
      created_at: new Date('2026-05-01T00:00:00.000Z'),
    };
    dataSource.query
      .mockResolvedValueOnce([{ id: 'r1', status: 'pending' }])
      .mockResolvedValueOnce([[row], 1]);

    const out = await service.patchSendAt(
      'sub-1',
      'asg-1',
      'r1',
      user([
        PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
        PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
      ]),
      sendAt.toISOString(),
    );

    expect(out.id).toBe('r1');
    expect(out.sendAt).toBe(sendAt.toISOString());
  });

  it('patchSendAt updates pending reminder', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const sendAt = new Date(Date.now() + 10 * 60_000);
    const row = {
      id: 'r1',
      assignment_slug: 'asg-1',
      reviewer_id: 'rev1',
      reviewer_email: 'r@test.dev',
      reviewer_display_name: 'R',
      kind: 'review_due_soon',
      send_at: sendAt,
      status: 'pending',
      sent_at: null,
      created_at: new Date('2026-05-01T00:00:00.000Z'),
    };
    dataSource.query
      .mockResolvedValueOnce([{ id: 'r1', status: 'pending' }])
      .mockResolvedValueOnce([row]);

    const out = await service.patchSendAt(
      'sub-1',
      'asg-1',
      'r1',
      user([
        PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
        PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
      ]),
      sendAt.toISOString(),
    );

    expect(out.id).toBe('r1');
    expect(out.sendAt).toBe(sendAt.toISOString());
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "email"."reminder"'),
      [sendAt.toISOString(), 'r1', 'asg-1'],
    );
  });

  it('cancel marks pending reminder cancelled', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const row = {
      id: 'r1',
      assignment_slug: 'asg-1',
      reviewer_id: 'rev1',
      reviewer_email: 'r@test.dev',
      reviewer_display_name: 'R',
      kind: 'review_due_soon',
      send_at: new Date('2026-06-01T12:00:00.000Z'),
      status: 'cancelled',
      sent_at: null,
      created_at: new Date('2026-05-01T00:00:00.000Z'),
    };
    dataSource.query
      .mockResolvedValueOnce([{ id: 'r1', status: 'pending' }])
      .mockResolvedValueOnce([row]);

    const out = await service.cancel(
      'sub-1',
      'asg-1',
      'r1',
      user([
        PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
        PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
      ]),
    );

    expect(out.status).toBe('cancelled');
  });

  it('listForAssignment maps permission denied to EMAIL_DB_FORBIDDEN', async () => {
    submissionsRepo.findOne.mockResolvedValue({ id: 's1', slug: 'sub-1' });
    assignmentsRepo.findOne.mockResolvedValue({ id: 'a1', slug: 'asg-1' });
    const driverError = Object.assign(new Error('permission denied'), {
      code: '42501',
    });
    dataSource.query.mockRejectedValue(
      new QueryFailedError('SELECT', [], driverError),
    );

    await expect(
      service.listForAssignment(
        'sub-1',
        'asg-1',
        user([
          PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
          PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
        ]),
      ),
    ).rejects.toMatchObject({
      response: { code: 'EMAIL_DB_FORBIDDEN' },
    });
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
