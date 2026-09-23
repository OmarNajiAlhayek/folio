/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
import { JournalDirectoryService } from '../journals/journal-directory.service';
import { JournalIssuesService } from '../journals/journal-issues.service';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';

import { AiClientService } from '../ai/ai-client.service';
import { aiJobsServiceMock } from '../ai-jobs/ai-jobs.service.mock';
import { languageToolServiceMock } from './language-tool.service.mock';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
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

describe('SubmissionsService.suggestKeywords', () => {
  let service: SubmissionsService;
  let submissionsRepo: { findOne: jest.Mock };
  let aiClient: {
    isKeywordsEnabled: jest.Mock;
    suggestKeywords: jest.Mock;
  };

  const author: RequestUser = {
    sub: 'author-1',
    email: 'a@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  const draft: Submission = {
    id: 'sub-1',
    slug: 'paper-one',
    authorId: 'author-1',
    status: SubmissionStatus.DRAFT,
    title: 'English title',
    abstract: 'English abstract with enough text.',
    titleAr: null,
    abstractAr: null,
  } as Submission;

  beforeEach(async () => {
    submissionsRepo = {
      findOne: jest.fn().mockResolvedValue({ ...draft }),
    };
    aiClient = {
      isKeywordsEnabled: jest.fn().mockReturnValue(true),
      suggestKeywords: jest.fn().mockResolvedValue({
        status: 'ok',
        data: {
          keywords_en: ['Machine Learning', 'Science'],
          keywords_ar: [],
        },
      }),
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
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(SubmissionFile), useValue: {} },
        { provide: getRepositoryToken(ReviewAssignment), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
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
            findJournal: jest.fn().mockResolvedValue(null),
            assertSubmittableJournal: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: AiClientService, useValue: aiClient },
        aiJobsServiceMock,
        { provide: RbacService, useValue: {} },
        { provide: DocxGeneratorService, useValue: {} },
        { provide: ManuscriptStyleRegistryService, useValue: {} },
        { provide: EventPublisherService, useValue: { enqueue: jest.fn() } },
        notificationsServiceMock,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        languageToolServiceMock,
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
  });

  it('returns normalized English keywords for the author on a draft', async () => {
    const result = await service.suggestKeywords('paper-one', author);
    expect(result.keywordsEn).toEqual(['Machine Learning', 'Science']);
    expect(result.keywordsAr).toEqual([]);
    expect(aiClient.suggestKeywords).toHaveBeenCalledWith({
      title: draft.title,
      abstract: draft.abstract,
      titleAr: undefined,
      abstractAr: undefined,
    });
  });

  it('rejects non-authors', async () => {
    await expect(
      service.suggestKeywords('paper-one', { ...author, sub: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires title and abstract for at least one language', async () => {
    submissionsRepo.findOne.mockResolvedValue({
      ...draft,
      title: 'Only title',
      abstract: '',
    });
    await expect(
      service.suggestKeywords('paper-one', author),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails when AI returns nothing useful', async () => {
    aiClient.suggestKeywords.mockResolvedValue({
      status: 'ok',
      data: {
        keywords_en: [],
        keywords_ar: [],
      },
    });
    await expect(
      service.suggestKeywords('paper-one', author),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AI_KEYWORDS_SUGGESTION_FAILED',
      }),
    });
  });
});
