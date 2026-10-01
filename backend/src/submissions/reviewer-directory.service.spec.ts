import type { Repository } from 'typeorm';
import type { Submission } from '../entities/submission.entity';
import type { ReviewAssignment } from '../entities/review-assignment.entity';
import type { User } from '../entities/user.entity';
import type { RequestUser } from '../common/types/request-user';
import type { RbacService } from '../rbac/rbac.service';
import type { JournalMembershipService } from '../journals/journal-membership.service';
import type { SubmissionAccessService } from './submission-access.service';
import {
  ReviewerDirectoryService,
  toReviewerStatsSummary,
  type ReviewerAggregateRow,
} from './reviewer-directory.service';

const editor: RequestUser = {
  sub: 'editor-1',
  email: 'ed@test.dev',
  roleSlugs: ['editor'],
  permissionSlugs: [],
};

const submission = {
  id: 'sub-1',
  slug: 'paper-one',
  authorId: 'author-1',
  journalId: 'journal-a',
  contributors: [],
} as unknown as Submission;

function reviewer(id: string, extra: Partial<User> = {}): User {
  return {
    id,
    displayName: `Reviewer ${id}`,
    email: `${id}@uni.edu`,
    affiliation: null,
    orcid: null,
    reviewKeywords: null,
    reviewerAvailable: true,
    reviewerUnavailableUntil: null,
    reviewerUnavailableNote: null,
    reviewerMaxActiveReviews: null,
    ...extra,
  } as User;
}

function aggregate(
  reviewerId: string,
  extra: Partial<ReviewerAggregateRow> = {},
): ReviewerAggregateRow {
  return {
    reviewerId,
    invitations: 0,
    accepted: 0,
    declined: 0,
    completed: 0,
    active: 0,
    avgDaysToRespond: null,
    avgDaysToComplete: null,
    dueTracked: 0,
    onTime: 0,
    lastCompletedAt: null,
    ...extra,
  };
}

function build(opts: {
  pool: User[];
  aggregates?: ReviewerAggregateRow[];
  onSubmission?: Array<{ reviewerId: string; status: string }>;
  recent?: unknown[];
  editorJournals?: string[];
}) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('GROUP BY a.reviewer_id')) {
      return Promise.resolve(opts.aggregates ?? []);
    }
    if (sql.includes('GROUP BY r.recommendation')) {
      return Promise.resolve([{ recommendation: 'accept', n: 2 }]);
    }
    return Promise.resolve(opts.recent ?? []);
  });
  const assignmentsRepo = {
    query,
    find: jest.fn().mockResolvedValue(opts.onSubmission ?? []),
  } as unknown as Repository<ReviewAssignment>;
  const usersRepo = {
    find: jest.fn().mockResolvedValue(opts.pool),
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(opts.pool.find((u) => u.id === where.id) ?? null),
    ),
  } as unknown as Repository<User>;
  const rbac = {
    listUserIdsWithPermission: jest
      .fn()
      .mockResolvedValue(opts.pool.map((u) => u.id)),
    userHasPermission: jest.fn().mockResolvedValue(true),
  } as unknown as RbacService;
  const memberships = {
    listJournalIdsForUser: jest.fn((_userId: string, role: string) =>
      Promise.resolve(role === 'editor' ? (opts.editorJournals ?? []) : []),
    ),
  } as unknown as JournalMembershipService;
  const access = {
    getBySlugOrThrow: jest.fn().mockResolvedValue(submission),
    assertCanRead: jest.fn().mockResolvedValue(undefined),
  } as unknown as SubmissionAccessService;
  return new ReviewerDirectoryService(
    usersRepo,
    assignmentsRepo,
    rbac,
    memberships,
    access,
  );
}

describe('toReviewerStatsSummary', () => {
  it('derives rates and rounds day averages to one decimal', () => {
    const summary = toReviewerStatsSummary(
      aggregate('r', {
        invitations: 10,
        accepted: 6,
        declined: 2,
        completed: 5,
        avgDaysToRespond: 1.26,
        avgDaysToComplete: 12.04,
        dueTracked: 4,
        onTime: 3,
        lastCompletedAt: new Date('2026-09-01T10:00:00Z'),
      }),
    );
    expect(summary).toEqual({
      invitations: 10,
      accepted: 6,
      declined: 2,
      completed: 5,
      acceptanceRate: 0.75,
      avgDaysToRespond: 1.3,
      avgDaysToComplete: 12,
      onTimeRate: 0.75,
      lastCompletedAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('leaves rates null rather than dividing by zero', () => {
    const summary = toReviewerStatsSummary(aggregate('r'));
    expect(summary.acceptanceRate).toBeNull();
    expect(summary.onTimeRate).toBeNull();
  });
});

describe('ReviewerDirectoryService.listForSubmission', () => {
  it('gives each reviewer their load, limit and block reason', async () => {
    const service = build({
      pool: [
        reviewer('free'),
        reviewer('full', { reviewerMaxActiveReviews: 2 }),
        reviewer('away', {
          reviewerAvailable: false,
          reviewerUnavailableNote: 'Sabbatical',
        }),
        reviewer('here'),
        reviewer('author-1'),
      ],
      aggregates: [
        aggregate('free', { active: 5 }),
        aggregate('full', { active: 2 }),
      ],
      onSubmission: [{ reviewerId: 'here', status: 'accepted' }],
    });

    const rows = await service.listForSubmission('paper-one', editor);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId.free.blockReason).toBeNull();
    expect(byId.free.capacity).toEqual({ active: 5, max: null });
    expect(byId.full.blockReason).toBe('at_capacity');
    expect(byId.full.capacity).toEqual({ active: 2, max: 2 });
    expect(byId.away.blockReason).toBe('unavailable');
    expect(byId.away.availability).toEqual({
      available: false,
      unavailableUntil: null,
      note: 'Sabbatical',
    });
    expect(byId.here.blockReason).toBe('already_assigned');
    expect(byId.here.thisSubmissionStatus).toBe('accepted');
    expect(byId['author-1'].blockReason).toBe('conflict_of_interest');
  });

  it('lets a reviewer who declined this manuscript be invited again', async () => {
    const service = build({
      pool: [reviewer('declined-before')],
      onSubmission: [{ reviewerId: 'declined-before', status: 'declined' }],
    });
    const [row] = await service.listForSubmission('paper-one', editor);
    expect(row.thisSubmissionStatus).toBe('declined');
    expect(row.blockReason).toBeNull();
  });
});

describe('ReviewerDirectoryService.getReviewerDetail', () => {
  const recentRow = (
    submissionId: string,
    journalId: string,
    title: string,
  ) => ({
    assignmentId: `asg-${submissionId}`,
    status: 'completed',
    assignedAt: new Date('2026-08-01T00:00:00Z'),
    respondedAt: null,
    reviewDueAt: null,
    submittedAt: null,
    recommendation: 'accept',
    submissionId,
    submissionSlug: submissionId,
    submissionTitle: title,
    journalId,
    journalSlug: journalId,
    journalTitleEn: journalId,
    journalTitleAr: journalId,
  });

  it("shows titles only from the caller's journals and this manuscript", async () => {
    const service = build({
      pool: [reviewer('r1')],
      editorJournals: ['journal-b'],
      recent: [
        recentRow('sub-1', 'journal-a', 'This manuscript'),
        recentRow('sub-2', 'journal-b', 'Own journal'),
        recentRow('sub-3', 'journal-c', 'Someone else’s journal'),
      ],
    });

    const detail = await service.getReviewerDetail('paper-one', 'r1', editor);

    expect(detail.recent.map((r) => r.submission?.title ?? null)).toEqual([
      'This manuscript',
      'Own journal',
      null,
    ]);
    expect(detail.recent[2].journal?.slug).toBe('journal-c');
    expect(detail.recommendations).toEqual({ accept: 2 });
  });

  it('is not found for an unknown reviewer', async () => {
    const service = build({ pool: [] });
    await expect(
      service.getReviewerDetail('paper-one', 'nobody', editor),
    ).rejects.toMatchObject({ status: 404 });
  });
});
