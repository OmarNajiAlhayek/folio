/* eslint-disable @typescript-eslint/require-await */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionsService } from './submissions.service';
import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { CopyeditWorkflowService } from './copyedit-workflow.service';
import { SectionEditorWorkflowService } from './section-editor-workflow.service';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';
import {
  getSubmissionTestServices,
  mockSubmissionsRepoFindBySlug,
  withStatusClaimSupport,
} from './submissions-service.testing';

import { aiClientServiceMock } from '../ai/ai-client.service.mock';
import { aiJobsServiceMock } from '../ai-jobs/ai-jobs.service.mock';
import { languageToolServiceMock } from './language-tool.service.mock';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { ReviewAssignment } from '../entities/review-assignment.entity';
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
import { hashConstructorContent } from './constructor-content-hash.util';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';

describe('SubmissionsService.submit (constructor files)', () => {
  let service: SubmissionsService;
  let events: SubmissionEventsService;
  let lifecycle: SubmissionLifecycleService;
  let filesRepo: { find: jest.Mock; save: jest.Mock };
  let submissionsRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
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
        keywords: 'one, two, three',
        dir: 'ltr',
        dirSource: 'manual',
      },
      {
        id: 'a2',
        kind: 'abstract',
        lang: 'ar',
        text: 'ملخص عربي.',
        keywords: 'واحد, اثنان',
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

  function readyPreSubmitAnalysis() {
    const contentHash = hashConstructorContent(minimalConstructorContent)!;
    return {
      id: 'psa-1',
      analyzedAt: new Date().toISOString(),
      contentHash,
      formatIssues: [],
      grammarNotes: [],
      referenceIssues: [],
      aiUnavailable: false,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    };
  }

  function draftConstructorRow(): Submission {
    return {
      id: 'sub-c',
      slug: 'constructor-paper',
      authorId: authorUser.sub,
      status: SubmissionStatus.DRAFT,
      constructorContent: minimalConstructorContent,
      preSubmitAnalysis: readyPreSubmitAnalysis(),
      articleType: 'research_article',
      keywords: 'one, two, three, four, five',
      keywordsAr: 'واحد, اثنان, ثلاثة, أربعة, خمسة',
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
    } as unknown as Submission;
  }

  beforeEach(async () => {
    filesRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };

    submissionsRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (row: Submission) => row),
      manager: {
        transaction: jest.fn(async (fn: (em: unknown) => unknown) => {
          const submissionRepo = withStatusClaimSupport({
            save: jest.fn(async (row: Submission) => row),
          });
          return fn({
            getRepository: () => submissionRepo,
          });
        }),
      },
    };
    mockSubmissionsRepoFindBySlug(submissionsRepo, () => draftConstructorRow());

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
        ManuscriptAnalysisService,
        PreSubmitAnalysisService,
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
          useValue: {
            generate: jest.fn().mockResolvedValue(Buffer.from('docx')),
          },
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

        aiJobsServiceMock,
        languageToolServiceMock,
      ],
    }).compile();

    ({ service, events, lifecycle } = getSubmissionTestServices(moduleRef));
    generateDocx = jest.spyOn(lifecycle, 'generateDocx').mockResolvedValue({
      kind: 'attached',
      file: { id: 'file-m', kind: 'manuscript' } as SubmissionFile,
    });
    jest
      .spyOn(events, 'enqueueSubmissionSubmittedForEditors')
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
    submissionsRepo.findOne.mockResolvedValueOnce(uploadDraft);
    filesRepo.find.mockResolvedValue([
      { kind: 'manuscript' },
    ] as SubmissionFile[]);

    await expect(
      service.submit('constructor-paper', authorUser),
    ).rejects.toThrow(BadRequestException);
    expect(generateDocx).not.toHaveBeenCalled();
  });
});
