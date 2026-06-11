import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  AiJob,
  type AiJobStatus,
  type AiJobType,
} from '../entities/ai-job.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { EventPublisherService } from '../messaging/event-publisher.service';
import {
  AI_ROUTING_KEY,
  type CorpusSimilarityRequestedEvent,
  type SimilarityIndexRequestedEvent,
} from '../messaging/contracts/ai-events';
import {
  corpusSimilarityKey,
  similarityIndexKey,
} from '@folio/shared/messaging/idempotency';
import { publicationSimilarityIndexPayload } from '../submissions/publication-similarity.util';
import type { CorpusSimilarityReport } from '../submissions/corpus-similarity-report.util';

export type AiJobResponse = {
  jobId: string;
  jobType: AiJobType;
  status: AiJobStatus;
  result?: CorpusSimilarityReport | Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

const ACTIVE_STATUSES: AiJobStatus[] = ['pending', 'queued', 'running'];

@Injectable()
export class AiJobsService {
  private readonly logger = new Logger(AiJobsService.name);

  constructor(
    @InjectRepository(AiJob)
    private readonly jobsRepo: Repository<AiJob>,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  toResponse(job: AiJob): AiJobResponse {
    const base: AiJobResponse = {
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage,
    };
    if (job.status === 'completed' && job.result) {
      base.result = job.result as CorpusSimilarityReport;
    }
    return base;
  }

  async getJob(jobId: string): Promise<AiJob> {
    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException({
        message: 'AI job not found',
        code: 'NOT_FOUND',
      });
    }
    return job;
  }

  async getLatestCompletedCorpusJob(
    submissionSlug: string,
  ): Promise<AiJob | null> {
    return this.jobsRepo.findOne({
      where: {
        submissionSlug,
        jobType: 'corpus_similarity',
        status: 'completed',
      },
      order: { completedAt: 'DESC' },
    });
  }

  async findActiveCorpusJob(submissionSlug: string): Promise<AiJob | null> {
    return this.jobsRepo.findOne({
      where: {
        submissionSlug,
        jobType: 'corpus_similarity',
        status: In(ACTIVE_STATUSES),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Queue similarity indexing for a published submission (idempotent).
   * Returns null when similarity is disabled or the submission has no indexable payload.
   */
  async enqueueSimilarityIndex(
    submissionId: string,
    manager: EntityManager | null = null,
  ): Promise<AiJob | null> {
    const submission = await this.submissionsRepo.findOne({
      where: { id: submissionId },
    });
    if (!submission || submission.status !== SubmissionStatus.PUBLISHED) {
      return null;
    }
    if (submission.similarityIndexedAt) {
      return null;
    }
    if (!publicationSimilarityIndexPayload(submission)) {
      return null;
    }

    const idempotencyKey = similarityIndexKey(submissionId);
    const jobsRepo = manager ? manager.getRepository(AiJob) : this.jobsRepo;

    const existing = await jobsRepo.findOne({
      where: {
        idempotencyKey,
        status: In(ACTIVE_STATUSES),
      },
    });
    if (existing) {
      return existing;
    }

    const jobId = randomUUID();
    const job = jobsRepo.create({
      id: jobId,
      jobType: 'similarity_index',
      status: 'pending',
      idempotencyKey,
      submissionId,
      submissionSlug: submission.slug,
    });
    await jobsRepo.save(job);

    const event: SimilarityIndexRequestedEvent = {
      type: 'SimilarityIndexRequested',
      jobId,
      idempotencyKey,
      submissionId,
    };
    await this.eventPublisher.enqueue(
      AI_ROUTING_KEY.similarityIndexRequested,
      event,
      manager,
    );

    return job;
  }

  async enqueueCorpusSimilarity(args: {
    submissionId: string;
    submissionSlug: string;
    requestedByUserId: string;
  }): Promise<AiJob> {
    const active = await this.findActiveCorpusJob(args.submissionSlug);
    if (active) {
      return active;
    }

    const jobId = randomUUID();
    const idempotencyKey = corpusSimilarityKey(jobId);
    const job = this.jobsRepo.create({
      id: jobId,
      jobType: 'corpus_similarity',
      status: 'pending',
      idempotencyKey,
      submissionId: args.submissionId,
      submissionSlug: args.submissionSlug,
      requestedByUserId: args.requestedByUserId,
    });
    await this.jobsRepo.save(job);

    const event: CorpusSimilarityRequestedEvent = {
      type: 'CorpusSimilarityRequested',
      jobId,
      idempotencyKey,
      submissionId: args.submissionId,
      submissionSlug: args.submissionSlug,
      requestedByUserId: args.requestedByUserId,
    };
    await this.eventPublisher.enqueue(
      AI_ROUTING_KEY.corpusSimilarityRequested,
      event,
      null,
    );

    return job;
  }

  /**
   * Enqueue index jobs for all published articles missing `similarityIndexedAt`.
   * Non-blocking — returns the number of jobs created.
   */
  async enqueueMissingSimilarityIndexJobs(): Promise<number> {
    const rows = await this.submissionsRepo.find({
      where: {
        status: SubmissionStatus.PUBLISHED,
        similarityIndexedAt: IsNull(),
      },
      select: ['id'],
    });
    let created = 0;
    for (const row of rows) {
      const job = await this.enqueueSimilarityIndex(row.id);
      if (job) created += 1;
    }
    if (created > 0) {
      this.logger.log(`Enqueued ${created} similarity index job(s)`);
    }
    return created;
  }

  async markQueued(jobId: string): Promise<void> {
    await this.jobsRepo.update(
      { id: jobId, status: In(['pending', 'queued']) },
      { status: 'queued' },
    );
  }
}
