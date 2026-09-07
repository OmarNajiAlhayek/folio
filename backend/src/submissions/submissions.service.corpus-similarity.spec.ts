/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
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
import { AiJobsService } from '../ai-jobs/ai-jobs.service';
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
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';
import { MIN_CORPUS_PLAIN_TEXT_CHARS } from './submission-corpus-text.util';

describe('SubmissionsService.startCorpusSimilarityJob', () => {
  let service: SubmissionsService;
  let aiClient: {
    isCorpusSimilarityEnabled: jest.Mock;
  };
  let aiJobs: {
    enqueueCorpusSimilarity: jest.Mock;
    toResponse: jest.Mock;
  };
  let submissionsRepo: { findOne: jest.Mock; find: jest.Mock };
  let assignmentsRepo: { exists: jest.Mock };

  const baseSubmission: Submission = {
    id: 'sub-1',
    slug: 'paper-1',
    authorId: 'author-1',
    status: SubmissionStatus.SUBMITTED,
    title: 'Title',
    abstract: 'A'.repeat(MIN_CORPUS_PLAIN_TEXT_CHARS),
    constructorContent: null,
  } as Submission;

  const editorUser: RequestUser = {
    sub: 'editor-1',
    email: 'ed@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE],
  };

  const authorEditorUser: RequestUser = {
    sub: 'author-1',
    email: 'author@test.dev',
    roleSlugs: ['author', 'editor'],
    permissionSlugs: [
      PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    ],
  };

  const reviewerUser: RequestUser = {
    sub: 'reviewer-1',
    email: 'rev@test.dev',
    roleSlugs: ['reviewer'],
    permissionSlugs: [PERMISSION_SLUGS.REVIEW_SUBMIT],
  };

  beforeEach(async () => {
    aiClient = {
      isCorpusSimilarityEnabled: jest.fn().mockReturnValue(true),
    };
    aiJobs = {
      enqueueCorpusSimilarity: jest.fn().mockResolvedValue({
        id: 'job-1',
        jobType: 'corpus_similarity',
        status: 'pending',
        createdAt: new Date(),
      }),
      toResponse: jest.fn().mockReturnValue({
        jobId: 'job-1',
        jobType: 'corpus_similarity',
        status: 'pending',
        createdAt: new Date().toISOString(),
      }),
    };
    submissionsRepo = {
      findOne: jest.fn().mockResolvedValue({ ...baseSubmission }),
      find: jest.fn().mockResolvedValue([]),
    };
    assignmentsRepo = {
      exists: jest.fn().mockResolvedValue(false),
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
        { provide: AiClientService, useValue: aiClient },
        { provide: AiJobsService, useValue: aiJobs },
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(SubmissionFile), useValue: {} },
        {
          provide: getRepositoryToken(ReviewAssignment),
          useValue: assignmentsRepo,
        },
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
            assertSubmittableJournal: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: RbacService, useValue: {} },
        { provide: DocxGeneratorService, useValue: {} },
        { provide: ManuscriptStyleRegistryService, useValue: {} },
        { provide: EventPublisherService, useValue: {} },
        notificationsServiceMock,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        languageToolServiceMock,
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    jest.spyOn(service, 'assertCanRead').mockResolvedValue(undefined);
  });

  it('forbids the author even with editor queue permission', async () => {
    await expect(
      service.startCorpusSimilarityJob('paper-1', authorEditorUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enqueues a job for editor when text is sufficient', async () => {
    const response = await service.startCorpusSimilarityJob(
      'paper-1',
      editorUser,
    );
    expect(aiJobs.enqueueCorpusSimilarity).toHaveBeenCalledWith({
      submissionId: 'sub-1',
      submissionSlug: 'paper-1',
      requestedByUserId: 'editor-1',
    });
    expect(response).toEqual({
      jobId: 'job-1',
      jobType: 'corpus_similarity',
      status: 'pending',
      createdAt: expect.any(String),
    });
  });

  it('allows assigned reviewer to enqueue', async () => {
    assignmentsRepo.exists.mockResolvedValue(true);
    await service.startCorpusSimilarityJob('paper-1', reviewerUser);
    expect(aiJobs.enqueueCorpusSimilarity).toHaveBeenCalled();
  });

  it('forbids unassigned reviewer', async () => {
    await expect(
      service.startCorpusSimilarityJob('paper-1', reviewerUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns no_text when plain text is too short', async () => {
    submissionsRepo.findOne.mockResolvedValue({
      ...baseSubmission,
      abstract: 'short',
      title: '',
    });
    const report = await service.startCorpusSimilarityJob(
      'paper-1',
      editorUser,
    );
    expect(report).toEqual({ status: 'no_text' });
    expect(aiJobs.enqueueCorpusSimilarity).not.toHaveBeenCalled();
  });

  it('returns unavailable when feature is disabled', async () => {
    aiClient.isCorpusSimilarityEnabled.mockReturnValue(false);
    const report = await service.startCorpusSimilarityJob(
      'paper-1',
      editorUser,
    );
    expect(report).toEqual({ status: 'unavailable' });
    expect(aiJobs.enqueueCorpusSimilarity).not.toHaveBeenCalled();
  });
});
