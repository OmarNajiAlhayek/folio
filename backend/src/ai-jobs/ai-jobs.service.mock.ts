import { AiJobsService } from './ai-jobs.service';

export const aiJobsServiceMock = {
  provide: AiJobsService,
  useValue: {
    enqueueSimilarityIndex: jest.fn().mockResolvedValue(null),
    enqueueCorpusSimilarity: jest.fn().mockResolvedValue({
      id: 'job-mock',
      jobType: 'corpus_similarity',
      status: 'pending',
      createdAt: new Date(),
    }),
    enqueueMissingSimilarityIndexJobs: jest.fn().mockResolvedValue(0),
    getJob: jest.fn(),
    getLatestCompletedCorpusJob: jest.fn().mockResolvedValue(null),
    findActiveCorpusJob: jest.fn().mockResolvedValue(null),
    toResponse: jest.fn().mockReturnValue({
      jobId: 'job-mock',
      jobType: 'corpus_similarity',
      status: 'pending',
      createdAt: new Date().toISOString(),
    }),
    markQueued: jest.fn().mockResolvedValue(undefined),
  },
};
