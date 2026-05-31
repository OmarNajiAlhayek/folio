import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { SubmissionsService } from './submissions.service';
import { aiClientServiceMock } from '../ai/ai-client.service.mock';
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
import { ROUTING_KEY } from '../messaging/contracts/email-events';
import {
  submissionDecisionKey,
  submissionSubmittedKey,
} from '../messaging/shared/idempotency';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

describe('SubmissionsService phase2 email (outbox)', () => {
  let service: SubmissionsService;
  let eventPublisher: { enqueue: jest.Mock; enqueueMany: jest.Mock };
  let submissionsRepo: {
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
      save: jest.fn(async (s: Submission) => s),
      manager: {
        transaction: jest.fn(async (fn: (em: EntityManager) => Promise<unknown>) => {
          const mockEm = {
            getRepository: jest.fn((entity: unknown) => {
              if (entity === Submission) {
                return { save: submissionsRepo.save };
              }
              if (entity === SubmissionFile) {
                return { update: jest.fn().mockResolvedValue(undefined) };
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
        }),
      },
    };
    usersRepo = {
      findOne: jest.fn().mockResolvedValue(author),
      find: jest.fn(),
    };
    listEditorIds = jest.fn().mockResolvedValue(['editor-1', 'editor-2']);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
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
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    jest.spyOn(service, 'getBySlugOrThrow').mockResolvedValue(submission);
    jest
      .spyOn(service as unknown as { assertReadyForSubmit: () => Promise<void> }, 'assertReadyForSubmit')
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
  });

  it('enqueues submission.submitted per editor on submit', async () => {
    const draft = {
      ...submission,
      status: SubmissionStatus.DRAFT,
    } as Submission;
    jest.spyOn(service, 'getBySlugOrThrow').mockResolvedValue(draft);

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
    expect(events.every((e) => e.routingKey === ROUTING_KEY.submissionSubmitted)).toBe(
      true,
    );
  });
});
