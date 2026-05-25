import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionsService } from './submissions.service';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import {
  CopyeditAssignment,
  CopyeditAssignmentStatus,
} from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { RbacService } from '../rbac/rbac.service';
import { DocxGeneratorService } from './docx-generator.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { notificationsServiceMock } from '../notifications/notifications.service.mock';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

describe('SubmissionsService copyedit workflow', () => {
  let service: SubmissionsService;
  let copyeditAssignmentsRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let copyeditNotesRepo: {
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let filesRepo: { createQueryBuilder: jest.Mock };
  let submissionsRepo: { save: jest.Mock };
  let eventPublisher: { enqueue: jest.Mock };

  const editor: RequestUser = {
    sub: 'ed-1',
    email: 'ed@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR],
  };

  const author: RequestUser = {
    sub: 'auth-1',
    email: 'a@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  const submission = {
    id: 'sub-1',
    slug: 'paper-ce',
    title: 'Paper',
    status: SubmissionStatus.COPYEDITING,
    authorId: author.sub,
    author: {
      id: author.sub,
      email: author.email,
      displayName: 'Author',
      preferredLocale: 'en',
    },
  } as Submission;

  const assignment = {
    id: 'ce-1',
    slug: 'ce-paper-ce--abc',
    submissionId: submission.id,
    copyeditorId: 'ce-user',
    status: CopyeditAssignmentStatus.AWAITING_AUTHOR,
    submission,
    notes: [
      {
        id: 'n1',
        round: 1,
        submittedAt: new Date('2026-01-01'),
        noteForAuthor: 'Fix abstract',
      },
    ],
  } as CopyeditAssignment;

  beforeEach(async () => {
    eventPublisher = { enqueue: jest.fn().mockResolvedValue(undefined) };
    copyeditNotesRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      findOneOrFail: jest.fn(),
    };
    copyeditAssignmentsRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(async (x) => x),
      manager: {
        transaction: jest.fn(async (fn) => {
          const mockEm = {
            getRepository: (entity: unknown) => {
              if (entity === CopyeditNote) return copyeditNotesRepo;
              if (entity === CopyeditAssignment) {
                return {
                  save: jest.fn(async (x: CopyeditAssignment) => x),
                };
              }
              if (entity === User) {
                return {
                  findOne: jest.fn().mockResolvedValue({
                    id: 'ce-user',
                    email: 'ce@test.dev',
                    displayName: 'CE',
                    preferredLocale: 'en',
                  }),
                };
              }
              if (entity === Submission) {
                return { save: jest.fn() };
              }
              throw new Error('unexpected entity');
            },
          };
          return fn(mockEm);
        }),
      },
    };
    filesRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      })),
    };
    submissionsRepo = { save: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(SubmissionFile), useValue: filesRepo },
        { provide: getRepositoryToken(ReviewAssignment), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        {
          provide: getRepositoryToken(CopyeditAssignment),
          useValue: copyeditAssignmentsRepo,
        },
        {
          provide: getRepositoryToken(CopyeditNote),
          useValue: copyeditNotesRepo,
        },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: RbacService,
          useValue: { userHasPermission: jest.fn().mockResolvedValue(true) },
        },
        { provide: DocxGeneratorService, useValue: {} },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {},
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

  afterEach(() => jest.restoreAllMocks());

  it('blocks submitCopyeditNote while awaiting_author', async () => {
    copyeditAssignmentsRepo.findOne.mockResolvedValue({
      ...assignment,
      status: CopyeditAssignmentStatus.AWAITING_AUTHOR,
    });
    await expect(
      service.submitCopyeditNote(
        assignment.slug!,
        assignment.copyeditorId,
        'note',
        '',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('markCopyeditAuthorReady requires manuscript after latest note', async () => {
    copyeditAssignmentsRepo.findOne.mockResolvedValue(assignment);
    filesRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    });
    await expect(
      service.markCopyeditAuthorReady(assignment.slug!, author.sub),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
