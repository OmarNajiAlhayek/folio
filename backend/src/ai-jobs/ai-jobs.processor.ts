import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AiClientService } from '../ai/ai-client.service';
import { AiJob } from '../entities/ai-job.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  aggregateCorpusSimilarityMatches,
  attachPublicationMetadata,
  type CorpusSimilarityReport,
} from '../submissions/corpus-similarity-report.util';
import {
  buildSubmissionCorpusPlainText,
  isCorpusPlainTextSufficient,
} from '../submissions/submission-corpus-text.util';
import { publicationSimilarityIndexPayload } from '../submissions/publication-similarity.util';

const CORPUS_SIMILARITY_THRESHOLD = 0.85;
const MAX_JOB_ATTEMPTS = 3;

@Injectable()
export class AiJobsProcessor {
  private readonly logger = new Logger(AiJobsProcessor.name);

  constructor(
    @InjectRepository(AiJob)
    private readonly jobsRepo: Repository<AiJob>,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly aiClient: AiClientService,
  ) {}

  async processSimilarityIndex(jobId: string): Promise<void> {
    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`similarity_index job missing id=${jobId}`);
      return;
    }
    if (job.status === 'completed') {
      return;
    }

    job.status = 'running';
    job.startedAt = job.startedAt ?? new Date();
    job.attempts += 1;
    await this.jobsRepo.save(job);

    try {
      const submission = await this.submissionsRepo.findOne({
        where: { id: job.submissionId ?? '' },
      });
      if (!submission) {
        throw new Error('Submission not found');
      }
      if (submission.status !== SubmissionStatus.PUBLISHED) {
        throw new Error('Submission is not published');
      }

      const payload = publicationSimilarityIndexPayload(submission);
      if (!payload) {
        await this.completeJob(job, {
          status: 'skipped',
          reason: 'no_payload',
        });
        return;
      }

      const ok = await this.aiClient.upsertSimilarityArticle({
        articleId: submission.id,
        abstract: payload.abstract,
        keywords: payload.keywords,
        category: payload.category,
        fullText: payload.fullText,
      });
      if (!ok) {
        throw new Error('ai-service UpsertArticle failed or is disabled');
      }

      submission.similarityIndexedAt = new Date();
      await this.submissionsRepo.save(submission);
      await this.completeJob(job, {
        status: 'indexed',
        submissionId: submission.id,
      });
    } catch (err) {
      await this.failJob(job, err);
      throw err;
    }
  }

  async processCorpusSimilarity(jobId: string): Promise<void> {
    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`corpus_similarity job missing id=${jobId}`);
      return;
    }
    if (job.status === 'completed') {
      return;
    }

    job.status = 'running';
    job.startedAt = job.startedAt ?? new Date();
    job.attempts += 1;
    await this.jobsRepo.save(job);

    try {
      const report = await this.buildCorpusSimilarityReport(job);
      await this.completeJob(job, report as unknown as Record<string, unknown>);
    } catch (err) {
      await this.failJob(job, err);
      throw err;
    }
  }

  private async buildCorpusSimilarityReport(
    job: AiJob,
  ): Promise<CorpusSimilarityReport> {
    const submission = await this.submissionsRepo.findOne({
      where: { id: job.submissionId ?? '' },
    });
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (!this.aiClient.isCorpusSimilarityEnabled()) {
      return { status: 'unavailable' };
    }

    const plainText = buildSubmissionCorpusPlainText(submission);
    if (!isCorpusPlainTextSufficient(plainText)) {
      return { status: 'no_text' };
    }

    const threshold = CORPUS_SIMILARITY_THRESHOLD;
    const matches = await this.aiClient.detectCorpusSimilarity({
      submissionText: plainText,
      threshold,
      category: submission.discipline?.trim() || undefined,
    });
    if (matches === null) {
      return { status: 'unavailable' };
    }

    const aggregated = aggregateCorpusSimilarityMatches(submission, matches);
    const articleIds = aggregated.sources.map((src) => src.articleId);
    const publishedById = new Map<
      string,
      { slug: string; title: string; titleAr: string | null }
    >();
    if (articleIds.length > 0) {
      const rows = await this.submissionsRepo.find({
        where: {
          id: In(articleIds),
          status: SubmissionStatus.PUBLISHED,
        },
        select: ['id', 'slug', 'title', 'titleAr'],
      });
      for (const row of rows) {
        if (!row.slug) continue;
        publishedById.set(row.id, {
          slug: row.slug,
          title: row.title ?? '',
          titleAr: row.titleAr,
        });
      }
    }

    return {
      status: 'ok',
      threshold,
      matchCount: aggregated.matchCount,
      sources: attachPublicationMetadata(aggregated.sources, publishedById),
    };
  }

  private async completeJob(
    job: AiJob,
    result: Record<string, unknown>,
  ): Promise<void> {
    job.status = 'completed';
    job.result = result;
    job.errorMessage = null;
    job.completedAt = new Date();
    await this.jobsRepo.save(job);
  }

  private async failJob(job: AiJob, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    job.errorMessage = message.slice(0, 500);
    if (job.attempts >= MAX_JOB_ATTEMPTS) {
      job.status = 'failed';
      job.completedAt = new Date();
    } else {
      job.status = 'pending';
    }
    await this.jobsRepo.save(job);
    this.logger.warn(
      `AI job ${job.id} (${job.jobType}) attempt ${job.attempts}/${MAX_JOB_ATTEMPTS}: ${message}`,
    );
  }

  shouldRequeue(job: AiJob | null): boolean {
    return (
      job != null && job.status === 'pending' && job.attempts < MAX_JOB_ATTEMPTS
    );
  }

  /** Enqueue index jobs for published submissions missing `similarityIndexedAt`. */
  async countUnindexedPublished(): Promise<number> {
    return this.submissionsRepo.count({
      where: {
        status: SubmissionStatus.PUBLISHED,
        similarityIndexedAt: IsNull(),
      },
    });
  }
}
