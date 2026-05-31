import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionsService } from './submissions.service';
import { aiClientServiceMock } from '../ai/ai-client.service.mock';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  ReviewAssignment,
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
import type { RequestUser } from '../common/types/request-user';
import type { ConstructorContent } from './constructor-content.types';

describe('SubmissionsService.submit (constructor files)', () => {
  let service: SubmissionsService;
  let filesRepo: { find: jest.Mock; save: jest.Mock };
  let generateDocx: jest.SpyInstance;

  const authorUser: RequestUser = {
    sub: 'author-1',
    email: 'a@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  const minimalConstructorContent: ConstructorContent = {
    defaultDir: 'ltr',
    sections: [
      {
        id: 't1',
        kind: 'title',
        text: 'Title',
        dir: 'ltr',
        dirSource: 'manual',
      },
      {
        id: 'a1',
        kind: 'abstract',
        lang: 'en',
        text: 'Abstract text here for validation.',
        dir: 'ltr',
        dirSource: 'manual',
      },
      {
        id: 'a2',
        kind: 'abstract',
        lang: 'ar',
        text: 'ملخص عربي.',
        dir: 'rtl',
        dirSource: 'manual',
      },
      {
        id: 'r1',
        kind: 'references',
        items: [{ lang: 'en', html: '<p>Author. Title. 2024.</p>' }],
        dir: 'ltr',
        dirSource: 'manual',
      },
    ],
  };

  function draftConstructorRow(): Submission {
    return {
    id: 'sub-c',
    slug: 'constructor-paper',
    authorId: authorUser.sub,
    status: SubmissionStatus.DRAFT,
    constructorContent: minimalConstructorContent,
    articleType: 'research_article',
    keywords: 'one, two, three',
    keywordsAr: 'واحد, اثنان, ثلاثة',
    titleAr: 'عنوان',
    contributors: [
      {
        fullName: 'Author One',
        affiliation: 'University',
        sortOrder: 0,
        isCorresponding: true,
      },
    ],
    originalityConfirmed: true,
    conflictOfInterestStatement: 'None',
    ethicalApprovalReference: 'N/A',
    aiUsageStatement: 'None used',
    abstract: 'English abstract text.',
    abstractAr: 'ملخص.',
  } as Submission;
  }

  beforeEach(async () => {
    filesRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const submissionsRepo = {
      save: jest.fn(async (row: Submission) => row),
      manager: {
        transaction: jest.fn(async (fn: (em: unknown) => unknown) => {
          const submissionRepo = {
            save: jest.fn(async (row: Submission) => row),
          };
          return fn({
            getRepository: () => submissionRepo,
          });
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(SubmissionFile), useValue: filesRepo },
        { provide: getRepositoryToken(ReviewAssignment), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        {
          provide: getRepositoryToken(User),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: RbacService,
          useValue: {
            listUserIdsWithPermission: jest.fn().mockResolvedValue([]),
            listWorkflowNotificationRecipientIds: jest
              .fn()
              .mockResolvedValue([]),
            userHasPermission: jest.fn(),
          },
        },
        {
          provide: DocxGeneratorService,
          useValue: { generate: jest.fn().mockResolvedValue(Buffer.from('docx')) },
        },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {
            assertConstructorContentStyleKnown: jest.fn(),
            resolveEffectiveStyleId: jest.fn().mockReturnValue('default'),
            getProfile: jest.fn().mockReturnValue({}),
          },
        },
        { provide: EventPublisherService, useValue: { enqueue: jest.fn() } },
        notificationsServiceMock,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k: string, def?: string) => def) },
        },
        aiClientServiceMock,
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    jest
      .spyOn(service, 'getBySlugOrThrow')
      .mockImplementation(async () => draftConstructorRow());
    generateDocx = jest
      .spyOn(service, 'generateDocx')
      .mockResolvedValue({
        kind: 'attached',
        file: { id: 'file-m', kind: 'manuscript' } as SubmissionFile,
      });
    jest
      .spyOn(service, 'enqueueSubmissionSubmittedForEditors')
      .mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches manuscript_constructor from constructor on submit before file check', async () => {
    filesRepo.find.mockResolvedValue([
      { kind: 'manuscript_constructor' },
    ] as SubmissionFile[]);

    await service.submit('constructor-paper', authorUser, {
      constructorContent: minimalConstructorContent,
      presentConstructorManuscript: true,
      presentUploadedManuscript: false,
    });

    expect(generateDocx).toHaveBeenCalledWith(
      'constructor-paper',
      authorUser,
      minimalConstructorContent,
      { attach: true, attachKind: 'manuscript_constructor' },
    );
  });

  it('does not require cover letter or title page when only constructor is presented', async () => {
    filesRepo.find.mockResolvedValue([
      { kind: 'manuscript_constructor' },
    ] as SubmissionFile[]);
    await expect(
      service.submit('constructor-paper', authorUser, {
        presentConstructorManuscript: true,
        presentUploadedManuscript: false,
      }),
    ).resolves.toBeDefined();
  });

  it('requires cover letter and title page in upload mode', async () => {
    const uploadDraft = {
      ...draftConstructorRow(),
      constructorContent: null,
    } as Submission;
    jest.spyOn(service, 'getBySlugOrThrow').mockResolvedValue(uploadDraft);
    filesRepo.find.mockResolvedValue([
      { kind: 'manuscript' },
    ] as SubmissionFile[]);

    await expect(service.submit('constructor-paper', authorUser)).rejects.toThrow(
      BadRequestException,
    );
    expect(generateDocx).not.toHaveBeenCalled();
  });
});
