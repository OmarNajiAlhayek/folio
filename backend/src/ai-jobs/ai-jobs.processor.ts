import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AiClientService } from '../ai/ai-client.service';
import { AiJob, type AiJobStatus } from '../entities/ai-job.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  aggregateCorpusSimilarityMatches,
  aggregateWebSimilarityMatches,
  attachPublicationMetadata,
  buildExactMatchStage,
  collectCorpusArticleIds,
  collectExactMatchSubmissionIds,
  type CorpusArticleLookup,
  type ExactMatchStageReport,
  type CorpusSimilarityReport,
  type CorpusSimilarityStageReport,
  type CorpusSimilaritySource,
  type WebSimilaritySource,
} from '../submissions/corpus-similarity-report.util';
import {
  buildSubmissionCorpusPlainText,
  isCorpusPlainTextSufficient,
} from '../submissions/submission-corpus-text.util';
import { publicationSimilarityIndexPayload } from '../submissions/publication-similarity.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPE } from '../notifications/notification-types';

const CORPUS_SIMILARITY_THRESHOLD = 0.85;
const WEB_SIMILARITY_THRESHOLD = 70;
const MAX_JOB_ATTEMPTS = 3;

class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

@Injectable()
export class AiJobsProcessor {
  private readonly logger = new Logger(AiJobsProcessor.name);

  constructor(
    @InjectRepository(AiJob)
    private readonly jobsRepo: Repository<AiJob>,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(SubmissionFile)
    private readonly filesRepo: Repository<SubmissionFile>,
    private readonly aiClient: AiClientService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async processSimilarityIndex(jobId: string): Promise<void> {
    const claimed = await this.jobsRepo
      .createQueryBuilder()
      .update(AiJob)
      .set({ status: 'running' as AiJobStatus })
      .where('id = :id AND status IN (:...statuses)', {
        id: jobId,
        statuses: ['pending', 'queued'],
      })
      .execute();

    if ((claimed.affected ?? 0) === 0) {
      return;
    }

    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`similarity_index job missing id=${jobId}`);
      return;
    }

    job.startedAt = job.startedAt ?? new Date();
    job.attempts += 1;
    await this.jobsRepo.save(job);

    try {
      const submission = await this.submissionsRepo.findOne({
        where: { id: job.submissionId ?? '' },
      });
      if (!submission) {
        throw new PermanentJobError('Submission not found');
      }
      if (submission.status !== SubmissionStatus.PUBLISHED) {
        throw new PermanentJobError('Submission is not published');
      }

      const payload = publicationSimilarityIndexPayload(submission);
      if (!payload) {
        await this.completeJob(job, {
          status: 'skipped',
          reason: 'no_payload',
        });
        return;
      }

      if (!this.aiClient.isSimilarityEnabled()) {
        await this.completeJob(job, { status: 'skipped', reason: 'disabled' });
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
        throw new Error('ai-service UpsertArticle failed');
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
    const claimed = await this.jobsRepo
      .createQueryBuilder()
      .update(AiJob)
      .set({ status: 'running' as AiJobStatus })
      .where('id = :id AND status IN (:...statuses)', {
        id: jobId,
        statuses: ['pending', 'queued'],
      })
      .execute();

    if ((claimed.affected ?? 0) === 0) {
      return;
    }

    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`corpus_similarity job missing id=${jobId}`);
      return;
    }

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
      throw new PermanentJobError('Submission not found');
    }

    const localEnabled = this.aiClient.isSimilarityEnabled();
    const webEnabled = this.aiClient.isWebSimilarityEnabled();

    if (!localEnabled && !webEnabled) {
      return { status: 'unavailable' };
    }

    const plainText = buildSubmissionCorpusPlainText(submission);
    if (!isCorpusPlainTextSufficient(plainText)) {
      return { status: 'no_text' };
    }

    const detectResult = await this.aiClient.detectCorpusSimilarity({
      submissionText: plainText,
      threshold: CORPUS_SIMILARITY_THRESHOLD,
      category: submission.disciplines?.[0]?.trim() || undefined,
      // Without this a published article re-checked against the corpus matches
      // its own indexed copy at ~100%.
      submissionId: submission.id,
    });
    if (detectResult === null) {
      return { status: 'unavailable' };
    }

    let local: CorpusSimilarityStageReport<CorpusSimilaritySource> | null =
      null;
    if (localEnabled) {
      // Resolve article ids *before* aggregating: the published check is a
      // confidentiality gate, so a match against a manuscript that is no longer
      // published must be dropped before it is counted or snippet-copied.
      // Deliberately queried without a status filter — an id that returns no row
      // is an external corpus source (back catalogue, open access, web), which is
      // different from a submission that exists but is not public.
      const articleIds = collectCorpusArticleIds(
        submission,
        detectResult.localMatches,
      );
      const articlesById = new Map<string, CorpusArticleLookup>();
      if (articleIds.length > 0) {
        const rows = await this.submissionsRepo.find({
          where: { id: In(articleIds) },
          select: ['id', 'slug', 'title', 'titleAr', 'status'],
        });
        for (const row of rows) {
          articlesById.set(row.id, {
            isPublished: row.status === SubmissionStatus.PUBLISHED,
            slug: row.slug,
            title: row.title ?? '',
            titleAr: row.titleAr,
          });
        }
      }

      const aggregated = aggregateCorpusSimilarityMatches(
        submission,
        detectResult.localMatches,
        articlesById,
      );
      if (aggregated.suppressedCount > 0) {
        this.logger.warn(
          `corpus_similarity job ${job.id}: suppressed ${aggregated.suppressedCount} match(es) ` +
            'against submissions that are indexed but no longer published',
        );
      }
      local = {
        enabled: true,
        threshold: CORPUS_SIMILARITY_THRESHOLD,
        matchCount: aggregated.matchCount,
        sources: attachPublicationMetadata(aggregated.sources, articlesById),
        ...(detectResult.localError ? { error: detectResult.localError } : {}),
      };
    }

    let web: CorpusSimilarityStageReport<WebSimilaritySource> | null = null;
    if (webEnabled) {
      const aggregated = aggregateWebSimilarityMatches(detectResult.webMatches);
      web = {
        enabled: true,
        threshold: WEB_SIMILARITY_THRESHOLD,
        matchCount: aggregated.matchCount,
        sources: aggregated.sources,
        ...(detectResult.webError ? { error: detectResult.webError } : {}),
      };
    }

    let exact: ExactMatchStageReport | null = null;
    // exactReport may be absent when the manuscript itself is unreadable
    // (exactError=unreadable_submission) — still surface the stage so the UI
    // can say "file unreadable" instead of silently omitting the section.
    if (detectResult.exactReport || detectResult.exactError) {
      const exactReport = detectResult.exactReport ?? {
        totalTokens: 0,
        matchedTokens: 0,
        overallRatio: 0,
        quotedTokens: 0,
        referenceTokensSkipped: 0,
        sources: [],
      };
      // Exact-match sources can point at Folio submissions too, so they get the
      // same published re-check as the semantic stage.
      const exactIds = collectExactMatchSubmissionIds(exactReport);
      const exactArticles = new Map<string, CorpusArticleLookup>();
      if (exactIds.length > 0) {
        const rows = await this.submissionsRepo.find({
          where: { id: In(exactIds) },
          select: ['id', 'slug', 'title', 'titleAr', 'status'],
        });
        for (const row of rows) {
          exactArticles.set(row.id, {
            isPublished: row.status === SubmissionStatus.PUBLISHED,
            slug: row.slug,
            title: row.title ?? '',
            titleAr: row.titleAr,
          });
        }
      }
      exact = buildExactMatchStage(
        exactReport,
        exactArticles,
        detectResult.exactError,
      );
      if (exact.suppressedCount > 0) {
        this.logger.warn(
          `corpus_similarity job ${job.id}: suppressed ${exact.suppressedCount} exact-match ` +
            'source(s) against submissions that are indexed but no longer published',
        );
      }
    }

    return { status: 'ok', local, web, exact };
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
    await this.notifyJobDone(job, true);
  }

  private async failJob(job: AiJob, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    job.errorMessage = message.slice(0, 500);
    if (err instanceof PermanentJobError || job.attempts >= MAX_JOB_ATTEMPTS) {
      job.status = 'failed';
      job.completedAt = new Date();
    } else {
      job.status = 'pending';
    }
    await this.jobsRepo.save(job);
    this.logger.warn(
      `AI job ${job.id} (${job.jobType}) attempt ${job.attempts}/${MAX_JOB_ATTEMPTS}: ${message}`,
    );
    if (job.status === 'failed') {
      await this.notifyJobDone(job, false);
    }
  }

  private async notifyJobDone(job: AiJob, succeeded: boolean): Promise<void> {
    if (
      job.jobType !== 'corpus_similarity' ||
      !job.requestedByUserId ||
      !job.submissionSlug
    ) {
      return;
    }
    const submission = job.submissionId
      ? await this.submissionsRepo.findOne({
          where: { id: job.submissionId },
          select: ['id', 'title'],
        })
      : null;
    const submissionTitle = submission?.title ?? job.submissionSlug;
    const type = succeeded
      ? NOTIFICATION_TYPE.AI_CORPUS_SIMILARITY_COMPLETED
      : NOTIFICATION_TYPE.AI_CORPUS_SIMILARITY_FAILED;
    const notification = await this.notificationsService.createIfAbsent({
      userId: job.requestedByUserId,
      type,
      params: { submissionTitle },
      href: `/submissions/${job.submissionSlug}`,
      idempotencyKey: `ai-job-notify:${job.id}`,
    });
    if (notification) {
      this.notificationsService.emitCreated([notification]);
    }
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
