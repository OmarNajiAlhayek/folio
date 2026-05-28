import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionsService } from './submissions.service';
import { AiClientService } from '../ai/ai-client.service';
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

describe('SubmissionsService.getCorpusSimilarityReport', () => {
  let service: SubmissionsService;
  let aiClient: {
    isCorpusSimilarityEnabled: jest.Mock;
    detectCorpusSimilarity: jest.Mock;
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
      detectCorpusSimilarity: jest.fn().mockResolvedValue([]),
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
        { provide: AiClientService, useValue: aiClient },
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
        { provide: RbacService, useValue: {} },
        { provide: DocxGeneratorService, useValue: {} },
        { provide: ManuscriptStyleRegistryService, useValue: {} },
        { provide: EventPublisherService, useValue: {} },
        notificationsServiceMock,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    jest.spyOn(service, 'assertCanRead').mockResolvedValue(undefined);
  });

  it('forbids the author even with editor queue permission', async () => {
    await expect(
      service.getCorpusSimilarityReport('paper-1', authorEditorUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows editor and returns ok when no matches', async () => {
    const report = await service.getCorpusSimilarityReport('paper-1', editorUser);
    expect(report).toEqual({
      status: 'ok',
      threshold: 0.85,
      matchCount: 0,
      sources: [],
    });
  });

  it('allows assigned reviewer', async () => {
    assignmentsRepo.exists.mockResolvedValue(true);
    const report = await service.getCorpusSimilarityReport(
      'paper-1',
      reviewerUser,
    );
    expect(report.status).toBe('ok');
  });

  it('forbids unassigned reviewer', async () => {
    await expect(
      service.getCorpusSimilarityReport('paper-1', reviewerUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('excludes self-matches from sources', async () => {
    aiClient.detectCorpusSimilarity.mockResolvedValue([
      {
        submissionChunkIndex: 0,
        submissionSnippet: 'overlap',
        sourceArticleId: 'sub-1',
        sourceChunkIndex: 0,
        matchedSnippet: 'overlap',
        similarity: 0.99,
      },
      {
        submissionChunkIndex: 0,
        submissionSnippet: 'other',
        sourceArticleId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        sourceChunkIndex: 0,
        matchedSnippet: 'other',
        similarity: 0.9,
      },
    ]);
    const report = await service.getCorpusSimilarityReport('paper-1', editorUser);
    expect(report.status).toBe('ok');
    if (report.status === 'ok') {
      expect(report.sources).toHaveLength(1);
      expect(report.sources[0].articleId).toBe(
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      );
    }
  });

  it('returns no_text when plain text is too short', async () => {
    submissionsRepo.findOne.mockResolvedValue({
      ...baseSubmission,
      abstract: 'short',
      title: '',
    });
    const report = await service.getCorpusSimilarityReport('paper-1', editorUser);
    expect(report).toEqual({ status: 'no_text' });
  });

  it('returns unavailable when gRPC returns null', async () => {
    aiClient.detectCorpusSimilarity.mockResolvedValue(null);
    const report = await service.getCorpusSimilarityReport('paper-1', editorUser);
    expect(report).toEqual({ status: 'unavailable' });
  });
});
