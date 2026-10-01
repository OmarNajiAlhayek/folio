/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  mockSubmissionsRepoFindBySlug,
  submissionsServiceTestProviders,
} from './submissions-service.testing';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { User } from '../entities/user.entity';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import { reviewerInvitedKey } from '@folio/shared/messaging/idempotency';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';
import { SubmissionsService } from './submissions.service';

describe('SubmissionsService.assignReviewer (outbox)', () => {
  let service: SubmissionsService;
  let eventPublisher: { enqueue: jest.Mock };
  let submissionsRepo: { findOne?: jest.Mock };
  let assignmentsRepo: {
    findOne: jest.Mock;
    exist: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let usersRepo: { findOne: jest.Mock };
  let rbacUserHasPermission: jest.Mock;

  const editorUser: RequestUser = {
    sub: 'editor-1',
    email: 'ed@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER],
  };

  const submission: Submission = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Paper Title',
    status: SubmissionStatus.SUBMITTED,
  } as Submission;

  const reviewer: User = {
    id: 'rev-1',
    email: 'rev@test.dev',
    displayName: 'Reviewer One',
    preferredLocale: null,
  } as User;

  const savedAssignment: ReviewAssignment = {
    id: 'asg-row-id',
    submissionId: submission.id,
    reviewerId: reviewer.id,
    status: AssignmentStatus.INVITED,
    slug: 'paper-one--a1b2c3d4',
  } as ReviewAssignment;

  /**
   * The transaction's EntityManager. `lockedReviewer` is what the
   * `FOR UPDATE` re-read of the reviewer returns; `activeLoad` is their
   * invited + accepted count; `editorRow` feeds the invitation's "invited by".
   */
  function makeTxEm(
    opts: {
      lockedReviewer?: Partial<User> | null;
      activeLoad?: number;
      editorRow?: Partial<User> | null;
    } = {},
  ): EntityManager {
    const assignmentRepo = {
      create: jest.fn((row: Partial<ReviewAssignment>) => ({
        ...row,
        id: savedAssignment.id,
      })),
      save: jest.fn().mockResolvedValue(savedAssignment),
      count: jest.fn().mockResolvedValue(opts.activeLoad ?? 0),
    };
    const lockQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue(
          opts.lockedReviewer === undefined
            ? { ...reviewer, reviewerAvailable: true }
            : opts.lockedReviewer,
        ),
    };
    const userRepoTx = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          opts.editorRow === undefined
            ? { id: editorUser.sub, displayName: 'Editor Name' }
            : opts.editorRow,
        ),
      createQueryBuilder: jest.fn(() => lockQuery),
    };
    return {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ReviewAssignment) return assignmentRepo;
        if (entity === User) return userRepoTx;
        throw new Error('unexpected entity in mock');
      }),
    } as unknown as EntityManager;
  }

  function nextTransactionUses(em: EntityManager) {
    assignmentsRepo.manager.transaction.mockImplementationOnce(
      async (fn: (em: EntityManager) => unknown) => fn(em),
    );
  }

  beforeEach(async () => {
    eventPublisher = { enqueue: jest.fn().mockResolvedValue(undefined) };

    rbacUserHasPermission = jest.fn().mockResolvedValue(true);

    usersRepo = {
      findOne: jest.fn().mockResolvedValue(reviewer),
    };

    submissionsRepo = {};
    mockSubmissionsRepoFindBySlug(submissionsRepo, () => submission);

    assignmentsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      exist: jest.fn().mockResolvedValue(false),
      manager: {
        transaction: jest.fn(async (fn: (em: EntityManager) => unknown) =>
          fn(makeTxEm()),
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: submissionsServiceTestProviders({
        submissionsRepo,
        assignmentsRepo,
        usersRepo,
        rbacService: {
          userHasPermission: (...args: unknown[]) =>
            rbacUserHasPermission(...args),
        },
        eventPublisher,
      }),
    }).compile();

    service = moduleRef.get(SubmissionsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enqueues reviewer.invited with expected payload and transactional manager', async () => {
    await service.assignReviewer(
      'paper-one',
      reviewer.id,
      editorUser,
      undefined,
    );

    expect(eventPublisher.enqueue).toHaveBeenCalledTimes(1);
    const [routingKey, payload, manager] = eventPublisher.enqueue.mock
      .calls[0] as [string, Record<string, unknown>, EntityManager];
    expect(routingKey).toBe(ROUTING_KEY.reviewerInvited);
    expect(payload.type).toBe('ReviewerInvited');
    expect(payload.idempotencyKey).toBe(
      reviewerInvitedKey(savedAssignment.slug!),
    );
    expect(payload.assignmentSlug).toBe(savedAssignment.slug);
    expect(payload.submissionSlug).toBe(submission.slug);
    expect(payload.submissionTitle).toBe(submission.title);
    expect(payload.reviewer).toMatchObject({
      id: reviewer.id,
      email: reviewer.email,
      displayName: reviewer.displayName,
    });
    expect(payload.invitedBy).toMatchObject({
      id: editorUser.sub,
      displayName: 'Editor Name',
    });
    expect(String(payload.acceptUrl)).toBe(
      `http://localhost:5240/en/assignments/${encodeURIComponent(savedAssignment.slug!)}/invite`,
    );
    expect(String(payload.declineUrl)).toBe(payload.acceptUrl);
    expect(payload.emailLocale).toBe('en');
    expect(manager).toBeDefined();
    expect(typeof manager.getRepository).toBe('function');
  });

  it('rolls back when enqueue rejects (transaction propagates error)', async () => {
    eventPublisher.enqueue.mockRejectedValueOnce(
      new Error('outbox insert failed'),
    );

    await expect(
      service.assignReviewer('paper-one', reviewer.id, editorUser, undefined),
    ).rejects.toThrow('outbox insert failed');

    expect(assignmentsRepo.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerErrorException when editor row is missing inside TX', async () => {
    nextTransactionUses(makeTxEm({ editorRow: null }));

    await expect(
      service.assignReviewer('paper-one', reviewer.id, editorUser, undefined),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  describe('availability and capacity', () => {
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);

    async function expectRejectedWith(code: string) {
      await expect(
        service.assignReviewer('paper-one', reviewer.id, editorUser),
      ).rejects.toMatchObject({ response: { code } });
      expect(eventPublisher.enqueue).not.toHaveBeenCalled();
    }

    it('rejects a reviewer who marked themselves unavailable', async () => {
      nextTransactionUses(
        makeTxEm({
          lockedReviewer: {
            ...reviewer,
            reviewerAvailable: false,
            reviewerUnavailableUntil: null,
          },
        }),
      );
      await expectRejectedWith('REVIEWER_UNAVAILABLE');
    });

    it('rejects a reviewer whose return date is still ahead', async () => {
      nextTransactionUses(
        makeTxEm({
          lockedReviewer: {
            ...reviewer,
            reviewerAvailable: false,
            reviewerUnavailableUntil: tomorrow,
          },
        }),
      );
      await expectRejectedWith('REVIEWER_UNAVAILABLE');
    });

    it('invites a reviewer whose return date has passed', async () => {
      nextTransactionUses(
        makeTxEm({
          lockedReviewer: {
            ...reviewer,
            reviewerAvailable: false,
            reviewerUnavailableUntil: yesterday,
          },
        }),
      );
      await service.assignReviewer('paper-one', reviewer.id, editorUser);
      expect(eventPublisher.enqueue).toHaveBeenCalledTimes(1);
    });

    it('rejects a reviewer at their concurrent limit', async () => {
      nextTransactionUses(
        makeTxEm({
          lockedReviewer: {
            ...reviewer,
            reviewerAvailable: true,
            reviewerMaxActiveReviews: 3,
          },
          activeLoad: 3,
        }),
      );
      await expectRejectedWith('REVIEWER_AT_CAPACITY');
    });

    it('invites a reviewer below their limit', async () => {
      nextTransactionUses(
        makeTxEm({
          lockedReviewer: {
            ...reviewer,
            reviewerAvailable: true,
            reviewerMaxActiveReviews: 3,
          },
          activeLoad: 2,
        }),
      );
      await service.assignReviewer('paper-one', reviewer.id, editorUser);
      expect(eventPublisher.enqueue).toHaveBeenCalledTimes(1);
    });

    it('invites a reviewer with no limit however busy they are', async () => {
      nextTransactionUses(
        makeTxEm({
          lockedReviewer: {
            ...reviewer,
            reviewerAvailable: true,
            reviewerMaxActiveReviews: null,
          },
          activeLoad: 40,
        }),
      );
      await service.assignReviewer('paper-one', reviewer.id, editorUser);
      expect(eventPublisher.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects when user is not a reviewer', async () => {
    rbacUserHasPermission.mockResolvedValueOnce(false);

    await expect(
      service.assignReviewer('paper-one', reviewer.id, editorUser, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventPublisher.enqueue).not.toHaveBeenCalled();
  });

  it('rejects when submission is published', async () => {
    submissionsRepo.findOne!.mockResolvedValueOnce({
      ...submission,
      status: SubmissionStatus.PUBLISHED,
    } as Submission);

    await expect(
      service.assignReviewer('paper-one', reviewer.id, editorUser, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventPublisher.enqueue).not.toHaveBeenCalled();
  });
});
