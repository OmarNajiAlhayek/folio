/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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

import { aiClientServiceMock } from '../ai/ai-client.service.mock';
import { aiJobsServiceMock } from '../ai-jobs/ai-jobs.service.mock';
import { languageToolServiceMock } from './language-tool.service.mock';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
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
import { submissionUnderReviewKey } from '@folio/shared/messaging/idempotency';

describe('SubmissionsService under_review author email', () => {
  let service: SubmissionsService;
  let files: SubmissionFileService;
  let eventPublisher: { enqueue: jest.Mock; enqueueMany: jest.Mock };
  let assignmentsRepo: {
    findOne: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let usersRepo: { findOne: jest.Mock; find: jest.Mock };

  const submittedAt = new Date('2026-06-02T09:30:00.000Z');
  const author: User = {
    id: 'author-1',
    email: 'author@test.dev',
    displayName: 'A. Author',
    preferredLocale: 'en',
  } as User;
  const reviewer: User = {
    id: 'reviewer-1',
    email: 'rev@test.dev',
    displayName: 'R. Reviewer',
    preferredLocale: 'en',
  } as User;
  const submission: Submission = {
    id: 'sub-1',
    slug: 'paper-two',
    title: 'Paper Two',
    status: SubmissionStatus.SUBMITTED,
    authorId: author.id,
    updatedAt: submittedAt,
  } as Submission;
  const assignment: ReviewAssignment = {
    id: 'asg-1',
    slug: 'asg-two',
    status: AssignmentStatus.INVITED,
    reviewerId: reviewer.id,
    submissionId: submission.id,
    submission,
    reviewer,
  } as ReviewAssignment;

  beforeEach(async () => {
    eventPublisher = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      enqueueMany: jest.fn().mockResolvedValue(undefined),
    };
    assignment.status = AssignmentStatus.INVITED;
    assignmentsRepo = {
      findOne: jest.fn().mockImplementation(async () => ({
        ...assignment,
        submission: { ...submission },
        reviewer: { ...reviewer },
      })),
      manager: {
        transaction: jest.fn(
          async (fn: (em: EntityManager) => Promise<unknown>) => {
            const mockEm = {
              getRepository: jest.fn((entity: unknown) => {
                if (entity === ReviewAssignment) {
                  return {
                    save: jest.fn(async (row: ReviewAssignment) => row),
                  };
                }
                if (entity === Submission) {
                  return {
                    save: jest.fn(async (row: Submission) => row),
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
    usersRepo = {
      findOne: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { id: string } }) => {
          if (where.id === author.id) return author;
          if (where.id === reviewer.id) return reviewer;
          return null;
        }),
      find: jest.fn().mockResolvedValue([]),
    };

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
        { provide: PreSubmitAnalysisService, useValue: {} },
        { provide: getRepositoryToken(Submission), useValue: {} },
        {
          provide: getRepositoryToken(SubmissionFile),
          useValue: { count: jest.fn().mockResolvedValue(1) },
        },
        {
          provide: getRepositoryToken(ReviewAssignment),
          useValue: assignmentsRepo,
        },
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
            listWorkflowNotificationRecipientIds: jest
              .fn()
              .mockResolvedValue([]),
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
    files = moduleRef.get(SubmissionFileService);
    jest
      .spyOn(files, 'assertHasReviewManuscriptPackage')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enqueues submission.under_review when reviewer accept auto-transitions', async () => {
    await service.acceptReviewInvitation('asg-two', reviewer.id);

    const underReviewCall = eventPublisher.enqueue.mock.calls.find(
      (call) => call[0] === ROUTING_KEY.submissionUnderReview,
    );
    expect(underReviewCall).toBeDefined();
    const payload = underReviewCall![1] as Record<string, unknown>;
    expect(payload.type).toBe('SubmissionUnderReview');
    expect(payload.trigger).toBe('reviewer_accept');
    expect(payload.submittedCycleAt).toBe(submittedAt.toISOString());
    expect(payload.idempotencyKey).toBe(
      submissionUnderReviewKey('paper-two', submittedAt.toISOString()),
    );
    expect(payload.author).toMatchObject({
      email: author.email,
      displayName: author.displayName,
    });
  });

  it('does not enqueue submission.under_review when submission already under_review', async () => {
    assignmentsRepo.findOne.mockResolvedValue({
      ...assignment,
      status: AssignmentStatus.INVITED,
      submission: {
        ...submission,
        status: SubmissionStatus.UNDER_REVIEW,
      },
    } as ReviewAssignment);

    await service.acceptReviewInvitation('asg-two', reviewer.id);

    const underReviewCall = eventPublisher.enqueue.mock.calls.find(
      (call) => call[0] === ROUTING_KEY.submissionUnderReview,
    );
    expect(underReviewCall).toBeUndefined();
  });
});
