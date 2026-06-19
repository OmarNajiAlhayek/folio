/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiJobsProcessor } from './ai-jobs.processor';
import { AiClientService } from '../ai/ai-client.service';
import { AiJob } from '../entities/ai-job.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { MIN_CORPUS_PLAIN_TEXT_CHARS } from '../submissions/submission-corpus-text.util';
import { NotificationsService } from '../notifications/notifications.service';

function makeQueryBuilder(affected = 1) {
  const execute = jest.fn().mockResolvedValue({ affected });
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute,
  };
  return { qb, execute };
}

function makeJob(overrides: Partial<AiJob> = {}): AiJob {
  return {
    id: 'job-1',
    jobType: 'corpus_similarity',
    status: 'pending',
    submissionId: 'sub-1',
    submissionSlug: 'paper-1',
    attempts: 0,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    result: null,
    requestedByUserId: null,
    idempotencyKey: null,
    createdAt: new Date(),
    ...overrides,
  } as AiJob;
}

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    slug: 'paper-1',
    status: SubmissionStatus.SUBMITTED,
    title: 'Title',
    abstract: 'A'.repeat(MIN_CORPUS_PLAIN_TEXT_CHARS),
    constructorContent: null,
    disciplines: [],
    titleAr: null,
    similarityIndexedAt: null,
    ...overrides,
  } as Submission;
}

describe('AiJobsProcessor', () => {
  let processor: AiJobsProcessor;
  let aiClient: {
    isCorpusSimilarityEnabled: jest.Mock;
    isSimilarityEnabled: jest.Mock;
    detectCorpusSimilarity: jest.Mock;
    upsertSimilarityArticle: jest.Mock;
  };
  let jobsRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let submissionsRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };
  let claimExecute: jest.Mock;

  beforeEach(async () => {
    const { qb, execute } = makeQueryBuilder(1);
    claimExecute = execute;

    aiClient = {
      isCorpusSimilarityEnabled: jest.fn().mockReturnValue(true),
      isSimilarityEnabled: jest.fn().mockReturnValue(true),
      detectCorpusSimilarity: jest.fn().mockResolvedValue([]),
      upsertSimilarityArticle: jest.fn().mockResolvedValue(true),
    };
    jobsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockResolvedValue(makeJob()),
      save: jest.fn().mockImplementation((j: AiJob) => Promise.resolve(j)),
    };
    submissionsRepo = {
      findOne: jest.fn().mockResolvedValue(makeSubmission()),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((s: Submission) => Promise.resolve(s)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiJobsProcessor,
        { provide: AiClientService, useValue: aiClient },
        { provide: getRepositoryToken(AiJob), useValue: jobsRepo },
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        {
          provide: NotificationsService,
          useValue: {
            createIfAbsent: jest.fn().mockResolvedValue(null),
            emitCreated: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = moduleRef.get(AiJobsProcessor);
  });

  describe('processCorpusSimilarity', () => {
    it('excludes self-matches from sources', async () => {
      submissionsRepo.findOne.mockResolvedValue(
        makeSubmission({ status: SubmissionStatus.PUBLISHED }),
      );
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

      await processor.processCorpusSimilarity('job-1');

      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('completed');
      const report = saved.result as {
        status: string;
        sources: { articleId: string }[];
      };
      expect(report.status).toBe('ok');
      expect(report.sources).toHaveLength(1);
      expect(report.sources[0].articleId).toBe(
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      );
    });

    it('returns without processing when atomic claim fails (affected=0)', async () => {
      claimExecute.mockResolvedValue({ affected: 0 });

      await processor.processCorpusSimilarity('job-1');

      expect(jobsRepo.findOne).not.toHaveBeenCalled();
      expect(jobsRepo.save).not.toHaveBeenCalled();
    });

    it('marks job failed immediately when submission is missing (PermanentJobError)', async () => {
      submissionsRepo.findOne.mockResolvedValue(null);

      await expect(processor.processCorpusSimilarity('job-1')).rejects.toThrow(
        'Submission not found',
      );

      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('failed');
    });
  });

  describe('processSimilarityIndex', () => {
    it('returns without processing when atomic claim fails (affected=0)', async () => {
      claimExecute.mockResolvedValue({ affected: 0 });

      await processor.processSimilarityIndex('job-1');

      expect(jobsRepo.findOne).not.toHaveBeenCalled();
      expect(jobsRepo.save).not.toHaveBeenCalled();
    });

    it('marks job failed immediately when submission is missing (PermanentJobError)', async () => {
      jobsRepo.findOne.mockResolvedValue(
        makeJob({ jobType: 'similarity_index' }),
      );
      submissionsRepo.findOne.mockResolvedValue(null);

      await expect(processor.processSimilarityIndex('job-1')).rejects.toThrow(
        'Submission not found',
      );

      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('failed');
    });

    it('marks job failed immediately when submission not published (PermanentJobError)', async () => {
      jobsRepo.findOne.mockResolvedValue(
        makeJob({ jobType: 'similarity_index' }),
      );
      submissionsRepo.findOne.mockResolvedValue(
        makeSubmission({ status: SubmissionStatus.SUBMITTED }),
      );

      await expect(processor.processSimilarityIndex('job-1')).rejects.toThrow(
        'Submission is not published',
      );

      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('failed');
    });

    it('skips with status=skipped when similarity is disabled', async () => {
      aiClient.isSimilarityEnabled.mockReturnValue(false);
      jobsRepo.findOne.mockResolvedValue(
        makeJob({ jobType: 'similarity_index' }),
      );
      submissionsRepo.findOne.mockResolvedValue(
        makeSubmission({
          status: SubmissionStatus.PUBLISHED,
          abstract: 'A'.repeat(MIN_CORPUS_PLAIN_TEXT_CHARS),
        }),
      );

      await processor.processSimilarityIndex('job-1');

      expect(aiClient.upsertSimilarityArticle).not.toHaveBeenCalled();
      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('completed');
      expect((saved.result as Record<string, unknown>)?.reason).toBe(
        'disabled',
      );
    });

    it('retries transient errors (status=pending) up to MAX_JOB_ATTEMPTS', async () => {
      jobsRepo.findOne.mockResolvedValue(
        makeJob({ jobType: 'similarity_index', attempts: 1 }),
      );
      submissionsRepo.findOne.mockResolvedValue(
        makeSubmission({ status: SubmissionStatus.PUBLISHED }),
      );
      aiClient.upsertSimilarityArticle.mockResolvedValue(false);

      await expect(processor.processSimilarityIndex('job-1')).rejects.toThrow(
        'ai-service UpsertArticle failed',
      );

      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('pending');
    });

    it('moves to failed after MAX_JOB_ATTEMPTS transient errors', async () => {
      jobsRepo.findOne.mockResolvedValue(
        makeJob({ jobType: 'similarity_index', attempts: 3 }),
      );
      submissionsRepo.findOne.mockResolvedValue(
        makeSubmission({ status: SubmissionStatus.PUBLISHED }),
      );
      aiClient.upsertSimilarityArticle.mockResolvedValue(false);

      await expect(processor.processSimilarityIndex('job-1')).rejects.toThrow();

      const saved = jobsRepo.save.mock.calls.at(-1)?.[0] as AiJob;
      expect(saved.status).toBe('failed');
    });
  });

  describe('shouldRequeue', () => {
    it('returns true when job is pending and under attempt limit', () => {
      expect(
        processor.shouldRequeue(makeJob({ status: 'pending', attempts: 1 })),
      ).toBe(true);
    });

    it('returns false when job is failed', () => {
      expect(
        processor.shouldRequeue(makeJob({ status: 'failed', attempts: 3 })),
      ).toBe(false);
    });

    it('returns false when job is null', () => {
      expect(processor.shouldRequeue(null)).toBe(false);
    });
  });
});
