import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiJobsProcessor } from './ai-jobs.processor';
import { AiClientService } from '../ai/ai-client.service';
import { AiJob } from '../entities/ai-job.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { MIN_CORPUS_PLAIN_TEXT_CHARS } from '../submissions/submission-corpus-text.util';

describe('AiJobsProcessor.processCorpusSimilarity', () => {
  let processor: AiJobsProcessor;
  let aiClient: {
    isCorpusSimilarityEnabled: jest.Mock;
    detectCorpusSimilarity: jest.Mock;
  };
  let jobsRepo: { findOne: jest.Mock; save: jest.Mock };
  let submissionsRepo: { findOne: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    aiClient = {
      isCorpusSimilarityEnabled: jest.fn().mockReturnValue(true),
      detectCorpusSimilarity: jest.fn().mockResolvedValue([]),
    };
    jobsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job-1',
        jobType: 'corpus_similarity',
        status: 'pending',
        submissionId: 'sub-1',
        attempts: 0,
      } as AiJob),
      save: jest.fn().mockImplementation((j: AiJob) => Promise.resolve(j)),
    };
    submissionsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'sub-1',
        slug: 'paper-1',
        status: SubmissionStatus.SUBMITTED,
        title: 'Title',
        abstract: 'A'.repeat(MIN_CORPUS_PLAIN_TEXT_CHARS),
        constructorContent: null,
      } as Submission),
      find: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiJobsProcessor,
        { provide: AiClientService, useValue: aiClient },
        { provide: getRepositoryToken(AiJob), useValue: jobsRepo },
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
      ],
    }).compile();

    processor = moduleRef.get(AiJobsProcessor);
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

    await processor.processCorpusSimilarity('job-1');

    const saveMock = jobsRepo.save as jest.MockedFunction<
      (job: AiJob) => Promise<AiJob>
    >;
    const saved = saveMock.mock.calls.at(-1)?.[0] as AiJob;
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
});
