/* eslint-disable @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { SubmissionsService } from './submissions.service';
import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { CopyeditWorkflowService } from './copyedit-workflow.service';
import { SectionEditorWorkflowService } from './section-editor-workflow.service';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { JournalDirectoryService } from '../journals/journal-directory.service';
import { JournalIssuesService } from '../journals/journal-issues.service';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';
import {
  fakeUpdateQueryBuilder,
  mockSubmissionsRepoFindBySlug,
  withStatusClaimSupport,
} from './submissions-service.testing';

import { aiClientServiceMock } from '../ai/ai-client.service.mock';
import { aiJobsServiceMock } from '../ai-jobs/ai-jobs.service.mock';
import { languageToolServiceMock } from './language-tool.service.mock';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { RbacService } from '../rbac/rbac.service';
import { DocxGeneratorService } from './docx-generator.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import {
  submissionDecisionKey,
  submissionSubmittedKey,
  submissionUnderReviewKey,
} from '@folio/shared/messaging/idempotency';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

describe('SubmissionsService phase2 email (outbox)', () => {
  let service: SubmissionsService;
  let lifecycle: SubmissionLifecycleService;
  let files: SubmissionFileService;
  let eventPublisher: { enqueue: jest.Mock; enqueueMany: jest.Mock };
  let submissionsRepo: {
    findOne: jest.Mock;
    manager: { transaction: jest.Mock };
    save: jest.Mock;
  };
  let usersRepo: { findOne: jest.Mock; find: jest.Mock };
  let listEditorIds: jest.Mock;

  const editorUser: RequestUser = {
    sub: 'editor-1',
    email: 'ed@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    ],
  };

  const author: User = {
    id: 'author-1',
    email: 'author@test.dev',
    displayName: 'A. Author',
    preferredLocale: 'en',
  } as User;

  const submission: Submission = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Paper Title',
    status: SubmissionStatus.UNDER_REVIEW,
    authorId: author.id,
  } as Submission;

  beforeEach(async () => {
    eventPublisher = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      enqueueMany: jest.fn().mockResolvedValue(undefined),
    };
    submissionsRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (s: Submission) => s),
      manager: {
        transaction: jest.fn(
          async (fn: (em: EntityManager) => Promise<unknown>) => {
            const mockEm = {
              getRepository: jest.fn((entity: unknown) => {
                if (entity === Submission) {
                  return withStatusClaimSupport({ save: submissionsRepo.save });
                }
                if (entity === SubmissionFile) {
                  return {
                    update: jest.fn().mockResolvedValue(undefined),
                    findOne: jest.fn().mockResolvedValue(null),
                    createQueryBuilder: jest.fn(() => fakeUpdateQueryBuilder()),
                  };
                }
                if (entity === User) {
                  return {
                    findOne: usersRepo.findOne,
                    find: usersRepo.find,
                  };
                }
                return {};
              }),
            } as unknown as EntityManager;
            return fn(mockEm);
          },
        ),
      },
    };
    mockSubmissionsRepoFindBySlug(submissionsRepo, () => submission);
    usersRepo = {
      findOne: jest.fn().mockResolvedValue(author),
      find: jest.fn(),
    };
    listEditorIds = jest.fn().mockResolvedValue(['editor-1', 'editor-2']);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        SubmissionAccessService,
        PublicationCatalogService,
        SubmissionFileService,
        SubmissionEventsService,
        ReviewWorkflowService,
        CopyeditWorkflowService,
        SectionEditorWorkflowService,
        SubmissionLifecycleService,
        SubmissionAiService,
        { provide: ManuscriptAnalysisService, useValue: {} },
        {
          provide: PreSubmitAnalysisService,
          useValue: { assertReadyForPreSubmit: jest.fn() },
        },
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        {
          provide: getRepositoryToken(SubmissionFile),
          useValue: {
            find: jest.fn().mockResolvedValue([{ kind: 'manuscript' }]),
            save: jest.fn().mockResolvedValue(undefined),
            count: jest.fn().mockResolvedValue(1),
          },
        },
        { provide: getRepositoryToken(ReviewAssignment), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: getRepositoryToken(SectionEditorAssignment),
          useValue: {},
        },
        {
          provide: JournalMembershipService,
          useValue: {
            listJournalIdsForUser: jest.fn().mockResolvedValue([]),
            filterUserIdsInJournal: jest.fn().mockResolvedValue([]),
            disciplineLabelsByUser: jest.fn().mockResolvedValue(new Map()),
            disciplineLabelForJournal: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: JournalIssuesService,
          useValue: {
            listPublishableIssues: jest.fn().mockResolvedValue([]),
            getIssueAcceptingArticleOrThrow: jest.fn(),
          },
        },
        {
          provide: JournalDirectoryService,
          useValue: {
            listOptions: jest.fn().mockResolvedValue([]),
            assertSubmittableJournal: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: RbacService,
          useValue: {
            listWorkflowNotificationRecipientIds: listEditorIds,
            userHasPermission: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: DocxGeneratorService, useValue: {} },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {
            assertConstructorContentStyleKnown: jest.fn(),
            resolveEffectiveStyleId: jest.fn(),
            getProfile: jest.fn(),
          },
        },
        { provide: EventPublisherService, useValue: eventPublisher },
        {
          provide: NotificationsService,
          useValue: {
            createIfAbsent: jest.fn().mockResolvedValue(null),
            createManyIfAbsent: jest.fn().mockResolvedValue([]),
            emitCreated: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'APP_BASE_URL') return 'http://localhost:5240';
              if (key === 'DEFAULT_EMAIL_LOCALE') return 'en';
              return def;
            }),
          },
        },
        aiClientServiceMock,

        aiJobsServiceMock,
        languageToolServiceMock,
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    lifecycle = moduleRef.get(SubmissionLifecycleService);
    files = moduleRef.get(SubmissionFileService);
    submission.status = SubmissionStatus.UNDER_REVIEW;
    submission.messageForAuthor = null;
    // updateStatus mutates the shared fixture in place, so reset the revision
    // fields too or a decision in one test leaks into the next.
    submission.revisionSeverity = null;
    submission.revisionRound = 0;
    jest
      .spyOn(files, 'assertHasReviewManuscriptPackage')
      .mockResolvedValue(undefined);
    jest
      .spyOn(
        lifecycle as unknown as { assertReadyForSubmit: () => Promise<void> },
        'assertReadyForSubmit',
      )
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enqueues submission.decision when editor accepts', async () => {
    await service.updateStatus(
      'paper-one',
      editorUser,
      SubmissionStatus.ACCEPTED,
      'en',
    );

    expect(eventPublisher.enqueue).toHaveBeenCalledTimes(1);
    const [routingKey, payload] = eventPublisher.enqueue.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(routingKey).toBe(ROUTING_KEY.submissionDecision);
    expect(payload.type).toBe('SubmissionDecision');
    expect(payload.decision).toBe('accepted');
    expect(payload.idempotencyKey).toBe(
      submissionDecisionKey('paper-one', 'accepted'),
    );
    expect(payload.author).toMatchObject({
      email: author.email,
      displayName: author.displayName,
    });
    expect(payload.messageForAuthor).toBeUndefined();
  });

  it('persists and enqueues messageForAuthor on editorial decision', async () => {
    usersRepo.findOne.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === author.id) return author;
        if (where.id === editorUser.sub) {
          return { id: editorUser.sub, displayName: 'Ed One' } as User;
        }
        return null;
      },
    );

    await service.updateStatus(
      'paper-one',
      editorUser,
      SubmissionStatus.REVISIONS_REQUESTED,
      'en',
      '  Please revise the methods section.  ',
      { revisionSeverity: 'major' },
    );

    expect(submissionsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        messageForAuthor: 'Please revise the methods section.',
        status: SubmissionStatus.REVISIONS_REQUESTED,
        revisionSeverity: 'major',
        revisionRound: 1,
      }),
    );
    const [, payload] = eventPublisher.enqueue.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.messageForAuthor).toBe('Please revise the methods section.');
    expect(payload.revisionSeverity).toBe('major');
    expect(payload.revisionRound).toBe(1);
  });

  it('requires a revision severity when requesting revisions', async () => {
    await expect(
      service.updateStatus(
        'paper-one',
        editorUser,
        SubmissionStatus.REVISIONS_REQUESTED,
        'en',
        'Please revise.',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a revision severity on a non-revision decision', async () => {
    await expect(
      service.updateStatus(
        'paper-one',
        editorUser,
        SubmissionStatus.ACCEPTED,
        'en',
        undefined,
        { revisionSeverity: 'minor' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes the decision idempotency key by revision round so round 2 is not deduped', async () => {
    await service.updateStatus(
      'paper-one',
      editorUser,
      SubmissionStatus.REVISIONS_REQUESTED,
      'en',
      undefined,
      { revisionSeverity: 'minor' },
    );
    const [, first] = eventPublisher.enqueue.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    eventPublisher.enqueue.mockClear();
    submissionsRepo.findOne.mockResolvedValueOnce({
      ...submission,
      status: SubmissionStatus.UNDER_REVIEW,
      revisionRound: 1,
    } as Submission);

    await service.updateStatus(
      'paper-one',
      editorUser,
      SubmissionStatus.REVISIONS_REQUESTED,
      'en',
      undefined,
      { revisionSeverity: 'major' },
    );
    const [, second] = eventPublisher.enqueue.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('rejects messageForAuthor when status is not a decision', async () => {
    const submitted = {
      ...submission,
      status: SubmissionStatus.SUBMITTED,
    } as Submission;
    submissionsRepo.findOne.mockResolvedValueOnce(submitted);

    await expect(
      service.updateStatus(
        'paper-one',
        editorUser,
        SubmissionStatus.UNDER_REVIEW,
        'en',
        'Not allowed here',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(eventPublisher.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues submission.under_review when editor sets under_review from submitted', async () => {
    const submittedAt = new Date('2026-06-01T12:00:00.000Z');
    const submitted = {
      ...submission,
      status: SubmissionStatus.SUBMITTED,
      updatedAt: submittedAt,
    } as Submission;
    submissionsRepo.findOne.mockResolvedValueOnce(submitted);
    usersRepo.findOne.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === author.id) return author;
        if (where.id === editorUser.sub) {
          return {
            id: editorUser.sub,
            displayName: 'Ed One',
          } as User;
        }
        return null;
      },
    );

    await service.updateStatus(
      'paper-one',
      editorUser,
      SubmissionStatus.UNDER_REVIEW,
      'en',
    );

    expect(eventPublisher.enqueue).toHaveBeenCalledTimes(1);
    const [routingKey, payload] = eventPublisher.enqueue.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(routingKey).toBe(ROUTING_KEY.submissionUnderReview);
    expect(payload.type).toBe('SubmissionUnderReview');
    expect(payload.trigger).toBe('editor');
    expect(payload.submittedCycleAt).toBe(submittedAt.toISOString());
    expect(payload.idempotencyKey).toBe(
      submissionUnderReviewKey('paper-one', submittedAt.toISOString()),
    );
    expect(payload.author).toMatchObject({
      email: author.email,
      displayName: author.displayName,
    });
  });

  it('enqueues submission.submitted per editor on submit', async () => {
    const draft = {
      ...submission,
      status: SubmissionStatus.DRAFT,
    } as Submission;
    submissionsRepo.findOne.mockResolvedValueOnce(draft);

    const editors = [
      {
        id: 'editor-1',
        email: 'e1@test.dev',
        displayName: 'Ed One',
        preferredLocale: 'en',
      },
      {
        id: 'editor-2',
        email: 'e2@test.dev',
        displayName: 'Ed Two',
        preferredLocale: 'ar',
      },
    ] as User[];
    usersRepo.find.mockResolvedValue(editors);

    const authorUser: RequestUser = {
      sub: author.id,
      email: author.email,
      roleSlugs: ['author'],
      permissionSlugs: [],
    };

    await service.submit('paper-one', authorUser);

    expect(eventPublisher.enqueueMany).toHaveBeenCalledTimes(1);
    const [events] = eventPublisher.enqueueMany.mock.calls[0] as [
      { routingKey: string; payload: Record<string, unknown> }[],
    ];
    expect(events).toHaveLength(2);
    const keys = events.map((e) => e.payload.idempotencyKey);
    expect(keys).toContain(submissionSubmittedKey('paper-one', 'editor-1'));
    expect(keys).toContain(submissionSubmittedKey('paper-one', 'editor-2'));
    expect(
      events.every((e) => e.routingKey === ROUTING_KEY.submissionSubmitted),
    ).toBe(true);
  });
});
