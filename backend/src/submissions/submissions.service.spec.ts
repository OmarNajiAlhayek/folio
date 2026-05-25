import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { SubmissionsService } from './submissions.service';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { RbacService } from '../rbac/rbac.service';
import { DocxGeneratorService } from './docx-generator.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { notificationsServiceMock } from '../notifications/notifications.service.mock';
import { ROUTING_KEY } from '../messaging/contracts/email-events';
import { reviewerInvitedKey } from '../messaging/shared/idempotency';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

describe('SubmissionsService.assignReviewer (outbox)', () => {
  let service: SubmissionsService;
  let eventPublisher: { enqueue: jest.Mock };
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

  beforeEach(async () => {
    eventPublisher = { enqueue: jest.fn().mockResolvedValue(undefined) };

    rbacUserHasPermission = jest.fn().mockResolvedValue(true);

    usersRepo = {
      findOne: jest.fn().mockResolvedValue(reviewer),
    };

    assignmentsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      exist: jest.fn().mockResolvedValue(false),
      manager: {
        transaction: jest.fn(async (fn: (em: EntityManager) => unknown) => {
          const assignmentRepo = {
            create: jest.fn((row: Partial<ReviewAssignment>) => ({
              ...row,
              id: savedAssignment.id,
            })),
            save: jest.fn().mockResolvedValue(savedAssignment),
          };
          const userRepoTx = {
            findOne: jest.fn().mockResolvedValue({
              id: editorUser.sub,
              displayName: 'Editor Name',
            }),
          };
          const mockEm = {
            getRepository: jest.fn((entity: unknown) => {
              if (entity === ReviewAssignment) return assignmentRepo;
              if (entity === User) return userRepoTx;
              throw new Error('unexpected entity in mock');
            }),
          } as unknown as EntityManager;
          return fn(mockEm);
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getRepositoryToken(Submission), useValue: {} },
        { provide: getRepositoryToken(SubmissionFile), useValue: {} },
        { provide: getRepositoryToken(ReviewAssignment), useValue: assignmentsRepo },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: RbacService,
          useValue: {
            userHasPermission: (...args: unknown[]) =>
              rbacUserHasPermission(...args),
          },
        },
        { provide: DocxGeneratorService, useValue: {} },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {
            assertConstructorContentStyleKnown: jest.fn(),
            resolveEffectiveStyleId: jest.fn().mockReturnValue('damascus-university-journal-v1'),
            getProfile: jest.fn(),
          },
        },
        { provide: EventPublisherService, useValue: eventPublisher },
        notificationsServiceMock,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'APP_BASE_URL') return 'http://localhost:5240';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    jest.spyOn(service, 'getBySlugOrThrow').mockResolvedValue(submission);
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
    expect(String(payload.acceptUrl)).toContain(
      `/assignments/${savedAssignment.slug}/accept`,
    );
    expect(String(payload.declineUrl)).toContain(
      `/assignments/${savedAssignment.slug}/decline`,
    );
    expect(payload.emailLocale).toBe('en');
    expect(manager).toBeDefined();
    expect(typeof manager.getRepository).toBe('function');
  });

  it('rolls back when enqueue rejects (transaction propagates error)', async () => {
    eventPublisher.enqueue.mockRejectedValueOnce(new Error('outbox insert failed'));

    await expect(
      service.assignReviewer(
        'paper-one',
        reviewer.id,
        editorUser,
        undefined,
      ),
    ).rejects.toThrow('outbox insert failed');

    expect(assignmentsRepo.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerErrorException when editor row is missing inside TX', async () => {
    assignmentsRepo.manager.transaction.mockImplementationOnce(
      async (fn: (em: EntityManager) => unknown) => {
        const assignmentRepo = {
          create: jest.fn((row: Partial<ReviewAssignment>) => ({
            ...row,
            id: savedAssignment.id,
          })),
          save: jest.fn().mockResolvedValue(savedAssignment),
        };
        const userRepoTx = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        const mockEm = {
          getRepository: jest.fn((entity: unknown) => {
            if (entity === ReviewAssignment) return assignmentRepo;
            if (entity === User) return userRepoTx;
            throw new Error('unexpected entity');
          }),
        } as unknown as EntityManager;
        return fn(mockEm);
      },
    );

    await expect(
      service.assignReviewer(
        'paper-one',
        reviewer.id,
        editorUser,
        undefined,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects when user is not a reviewer', async () => {
    rbacUserHasPermission.mockResolvedValueOnce(false);

    await expect(
      service.assignReviewer(
        'paper-one',
        reviewer.id,
        editorUser,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventPublisher.enqueue).not.toHaveBeenCalled();
  });

  it('rejects when submission is published', async () => {
    jest.spyOn(service, 'getBySlugOrThrow').mockResolvedValueOnce({
      ...submission,
      status: SubmissionStatus.PUBLISHED,
    } as Submission);

    await expect(
      service.assignReviewer(
        'paper-one',
        reviewer.id,
        editorUser,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventPublisher.enqueue).not.toHaveBeenCalled();
  });
});
