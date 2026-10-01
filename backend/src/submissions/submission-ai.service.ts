import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { User } from '../entities/user.entity';
import type { RequestUser } from '../common/types/request-user';
import { assertCallerHasEveryPermission } from '../common/authorization/permission-checks';
import {
  PERMISSION_SLUGS,
  SUGGESTED_REVIEWERS_CALLER_PERMISSIONS,
} from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { AiClientService } from '../ai/ai-client.service';
import { AiJobsService, type AiJobResponse } from '../ai-jobs/ai-jobs.service';
import { SubmissionDisciplineSource } from '../entities/submission-discipline-source.enum';
import {
  ARABIC_DISCIPLINE_LABELS,
  labelsFromProbabilities,
  validateDisciplines,
} from '../ai/discipline-labels';
import {
  buildClassificationJson,
  resolveClassifyText,
  parseAllowedDisciplinesFromEnv,
} from './submission-discipline.util';
import {
  hasKeywordLanguagePair,
  normalizeKeywordSuggestions,
} from './keyword-list.util';
import type { CorpusSimilarityReport } from './corpus-similarity-report.util';
import {
  buildSubmissionCorpusPlainText,
  isCorpusPlainTextSufficient,
} from './submission-corpus-text.util';
import {
  buildReviewerMatchQueryText,
  isReviewerMatchQuerySufficient,
} from './submission-reviewer-match.util';
import {
  enrichReviewerSuggestions,
  type SuggestedReviewersReport,
} from './suggested-reviewers-report.util';
import { SubmissionAccessService } from './submission-access.service';
import {
  ACTIVE_REVIEW_STATUSES,
  isAtReviewCapacity,
  isReviewerAvailable,
  utcToday,
} from './reviewer-availability';

@Injectable()
export class SubmissionAiService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly rbacService: RbacService,
    private readonly config: ConfigService,
    private readonly aiClient: AiClientService,
    private readonly aiJobs: AiJobsService,
    private readonly access: SubmissionAccessService,
  ) {}

  listDisciplineLabels(): {
    labels: readonly string[];
    journalScope: string[];
  } {
    return {
      labels: ARABIC_DISCIPLINE_LABELS,
      journalScope: this.journalAllowedDisciplines(),
    };
  }

  private journalAllowedDisciplines(): string[] {
    return parseAllowedDisciplinesFromEnv(
      this.config.get<string>('JOURNAL_ALLOWED_DISCIPLINES'),
    );
  }

  async refreshDisciplineSuggestion(
    submission: Submission,
  ): Promise<import('../ai/ai-client.types').ClassifyArticleResponse | null> {
    const text = resolveClassifyText(submission);
    if (!text.abstract.trim()) {
      return null;
    }
    const result = await this.aiClient.classifyArticle(text);
    if (!result) {
      return null;
    }
    const allowed = this.journalAllowedDisciplines();
    submission.disciplineSuggestedLabels = labelsFromProbabilities(
      result.top_label,
      result.probabilities,
    );
    submission.disciplineSuggestedConfidence = String(result.top_confidence);
    submission.disciplineClassification = buildClassificationJson(
      result,
      allowed,
    );
    return result;
  }

  async suggestDiscipline(
    slug: string,
    user: RequestUser,
  ): Promise<{
    topLabel: string;
    topConfidence: number;
    suggestedLabels: string[];
    probabilities: Record<string, number>;
    scopeInJournal: boolean;
    scopeWarning: string | null;
    disciplines: string[];
  }> {
    const s = await this.access.getBySlugOrThrow(slug);
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can request discipline suggestion',
        code: 'FORBIDDEN',
      });
    }
    if (
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message:
          'Discipline suggestion is only available while editing the draft',
        code: 'VALIDATION_ERROR',
      });
    }
    const text = resolveClassifyText(s);
    if (!text.abstract.trim()) {
      throw new BadRequestException({
        message:
          'Provide an Arabic or English abstract before requesting a discipline suggestion',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!this.aiClient.isEnabled()) {
      throw new BadRequestException({
        message: 'AI classification service is not configured',
        code: 'AI_SERVICE_UNAVAILABLE',
      });
    }
    const result = await this.refreshDisciplineSuggestion(s);
    if (!result) {
      throw new BadRequestException({
        message: 'Could not classify submission; try again later',
        code: 'AI_CLASSIFICATION_FAILED',
      });
    }
    await this.submissionsRepo.save(s);
    const classification = s.disciplineClassification!;
    return {
      topLabel: result.top_label,
      topConfidence: Number(s.disciplineSuggestedConfidence),
      suggestedLabels: s.disciplineSuggestedLabels,
      probabilities: classification.probabilities,
      scopeInJournal: classification.scopeInJournal,
      scopeWarning: classification.scopeWarning,
      disciplines: s.disciplines ?? [],
    };
  }

  async suggestKeywordsPreview(
    _user: RequestUser,
    input: {
      title?: string;
      abstract?: string;
      titleAr?: string;
      abstractAr?: string;
    },
  ): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    return this.suggestKeywordsFromMetadata(input);
  }

  async suggestKeywords(
    slug: string,
    user: RequestUser,
  ): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    const s = await this.access.getBySlugOrThrow(slug);
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can request keyword suggestions',
        code: 'FORBIDDEN',
      });
    }
    if (
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message:
          'Keyword suggestions are only available while editing the draft',
        code: 'VALIDATION_ERROR',
      });
    }
    const hasEn = hasKeywordLanguagePair(s.title, s.abstract);
    const hasAr = hasKeywordLanguagePair(s.titleAr, s.abstractAr);
    return this.suggestKeywordsFromMetadata({
      title: hasEn ? (s.title ?? undefined) : undefined,
      abstract: hasEn ? (s.abstract ?? undefined) : undefined,
      titleAr: hasAr ? (s.titleAr ?? undefined) : undefined,
      abstractAr: hasAr ? (s.abstractAr ?? undefined) : undefined,
    });
  }

  private async suggestKeywordsFromMetadata(input: {
    title?: string;
    abstract?: string;
    titleAr?: string;
    abstractAr?: string;
  }): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    const hasEn = hasKeywordLanguagePair(input.title, input.abstract);
    const hasAr = hasKeywordLanguagePair(input.titleAr, input.abstractAr);
    if (!hasEn && !hasAr) {
      throw new BadRequestException({
        message:
          'Provide English or Arabic title and abstract before requesting keyword suggestions',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!this.aiClient.isKeywordsEnabled()) {
      throw new BadRequestException({
        message: 'AI keyword suggestion service is not configured',
        code: 'AI_SERVICE_UNAVAILABLE',
      });
    }
    const outcome = await this.aiClient.suggestKeywords({
      title: hasEn ? input.title : undefined,
      abstract: hasEn ? input.abstract : undefined,
      titleAr: hasAr ? input.titleAr : undefined,
      abstractAr: hasAr ? input.abstractAr : undefined,
    });
    if (outcome.status === 'unavailable') {
      throw new BadRequestException({
        message: 'AI keyword suggestion service is not configured',
        code: 'AI_SERVICE_UNAVAILABLE',
      });
    }
    if (outcome.status !== 'ok') {
      throw new BadRequestException({
        message: 'Could not suggest keywords; try again later',
        code: 'AI_KEYWORDS_SUGGESTION_FAILED',
      });
    }
    const keywordsEn = normalizeKeywordSuggestions(
      outcome.data.keywords_en ?? [],
      'en',
    );
    const keywordsAr = normalizeKeywordSuggestions(
      outcome.data.keywords_ar ?? [],
      'ar',
    );
    if (keywordsEn.length === 0 && keywordsAr.length === 0) {
      throw new BadRequestException({
        message: 'Could not suggest keywords from the provided text',
        code: 'AI_KEYWORDS_SUGGESTION_FAILED',
      });
    }
    return { keywordsEn, keywordsAr };
  }

  async setDisciplineForUser(
    slug: string,
    user: RequestUser,
    disciplines: string[],
  ): Promise<Submission> {
    try {
      validateDisciplines(disciplines);
    } catch (err) {
      throw new BadRequestException({
        message:
          err instanceof Error ? err.message : 'Invalid discipline labels',
        code: 'VALIDATION_ERROR',
      });
    }
    const s = await this.access.getBySlugOrThrow(slug);
    const isAuthor =
      s.authorId === user.sub &&
      (s.status === SubmissionStatus.DRAFT ||
        s.status === SubmissionStatus.REVISIONS_REQUESTED);
    if (isAuthor) {
      s.disciplines = disciplines;
      s.disciplineSource = SubmissionDisciplineSource.AUTHOR;
      return this.submissionsRepo.save(s);
    }
    if (
      this.access.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
    ) {
      s.disciplines = disciplines;
      s.disciplineSource = SubmissionDisciplineSource.EDITOR;
      return this.submissionsRepo.save(s);
    }
    throw new ForbiddenException({
      message:
        'Only the author or an editor can set disciplines on this submission',
      code: 'FORBIDDEN',
    });
  }

  private async assertCorpusSimilarityAccess(
    s: Submission,
    user: RequestUser,
  ): Promise<void> {
    await this.access.assertCanRead(s, user);

    if (s.authorId === user.sub) {
      throw new ForbiddenException({
        message: 'Corpus similarity is not available to authors',
        code: 'FORBIDDEN',
      });
    }

    const isEditor = this.access.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const isCopyeditorOnly =
      this.access.hasPerm(user, PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE) &&
      !isEditor;
    if (isCopyeditorOnly) {
      throw new ForbiddenException({
        message: 'Corpus similarity is not available to copyeditors',
        code: 'FORBIDDEN',
      });
    }

    const assignedReviewer = await this.assignmentsRepo.exists({
      where: {
        submissionId: s.id,
        reviewerId: user.sub,
        status: In([AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED]),
      },
    });
    if (!isEditor && !assignedReviewer) {
      throw new ForbiddenException({
        message:
          'Corpus similarity requires editor or assigned reviewer access',
        code: 'FORBIDDEN',
      });
    }
  }

  private corpusSimilarityPrecheck(
    s: Submission,
  ): CorpusSimilarityReport | null {
    if (!this.aiClient.isCorpusSimilarityEnabled()) {
      return { status: 'unavailable' };
    }
    const plainText = buildSubmissionCorpusPlainText(s);
    if (!isCorpusPlainTextSufficient(plainText)) {
      return { status: 'no_text' };
    }
    return null;
  }

  async startCorpusSimilarityJob(
    slug: string,
    user: RequestUser,
  ): Promise<AiJobResponse | CorpusSimilarityReport> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.assertCorpusSimilarityAccess(s, user);

    const precheck = this.corpusSimilarityPrecheck(s);
    if (precheck) {
      return precheck;
    }

    const job = await this.aiJobs.enqueueCorpusSimilarity({
      submissionId: s.id,
      submissionSlug: slug,
      requestedByUserId: user.sub,
    });
    return this.aiJobs.toResponse(job);
  }

  async getCorpusSimilarityJob(
    slug: string,
    jobId: string,
    user: RequestUser,
  ): Promise<AiJobResponse> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.assertCorpusSimilarityAccess(s, user);

    const job = await this.aiJobs.getJob(jobId);
    if (job.submissionSlug !== slug) {
      throw new NotFoundException({
        message: 'AI job not found',
        code: 'NOT_FOUND',
      });
    }
    return this.aiJobs.toResponse(job);
  }

  async getLatestCorpusSimilarityJob(
    slug: string,
    user: RequestUser,
  ): Promise<AiJobResponse | null> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.assertCorpusSimilarityAccess(s, user);

    const active = await this.aiJobs.findActiveCorpusJob(slug);
    if (active) {
      return this.aiJobs.toResponse(active);
    }
    const completed = await this.aiJobs.getLatestCompletedCorpusJob(slug);
    return completed ? this.aiJobs.toResponse(completed) : null;
  }

  async getSuggestedReviewers(
    slug: string,
    user: RequestUser,
  ): Promise<SuggestedReviewersReport> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.access.assertCanRead(s, user);

    assertCallerHasEveryPermission(
      user,
      SUGGESTED_REVIEWERS_CALLER_PERMISSIONS,
      'Reviewer suggestions require editor assign permission',
    );

    if (!this.aiClient.isReviewerMatchingEnabled()) {
      return { status: 'unavailable' };
    }

    const queryText = buildReviewerMatchQueryText(s);
    if (!isReviewerMatchQuerySufficient(queryText)) {
      return { status: 'no_text' };
    }

    const profiles = await this.listReviewerProfilesForMatching();
    if (profiles.length === 0) {
      return { status: 'no_candidates' };
    }

    const busyAssignments = await this.assignmentsRepo.find({
      where: {
        submissionId: s.id,
        status: In([AssignmentStatus.INVITED, AssignmentStatus.ACCEPTED]),
      },
      select: ['reviewerId'],
    });
    // "Use" on a suggestion should never pick someone the assign path will
    // refuse, so reviewers who are away or at their limit are left out too.
    const excludeReviewerIds = [
      ...busyAssignments.map((a) => a.reviewerId),
      ...(await this.listReviewerIdsNotTakingInvitations(profiles)),
    ];
    const candidateIds = profiles.map((p) => p.id);
    const indexHistory = await this.loadReviewHistoryForMatching(
      candidateIds,
      s.id,
    );

    const outcome = await this.aiClient.suggestReviewers({
      queryText,
      candidateIds,
      excludeReviewerIds,
      indexProfiles: profiles.map((p) => ({
        reviewerId: p.id,
        affiliation: p.affiliation ?? '',
        reviewKeywords: p.reviewKeywords ?? '',
        displayName: p.displayName,
      })),
      indexHistory,
    });

    if (outcome.status === 'unavailable') {
      return { status: 'unavailable' };
    }
    if (outcome.status === 'failed') {
      return { status: 'unavailable' };
    }

    const profilesById = new Map(
      profiles.map((p) => [
        p.id,
        { displayName: p.displayName, email: p.email },
      ]),
    );
    return {
      status: 'ok',
      suggestions: enrichReviewerSuggestions(outcome.hits, profilesById),
    };
  }

  private async listReviewerProfilesForMatching(): Promise<
    Array<
      Pick<
        User,
        | 'id'
        | 'displayName'
        | 'email'
        | 'affiliation'
        | 'reviewKeywords'
        | 'reviewerAvailable'
        | 'reviewerUnavailableUntil'
        | 'reviewerMaxActiveReviews'
      >
    >
  > {
    const ids = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.REVIEW_SUBMIT,
    );
    if (ids.length === 0) {
      return [];
    }
    return this.usersRepo.find({
      where: { id: In(ids), willingToReview: true },
      select: [
        'id',
        'displayName',
        'email',
        'affiliation',
        'reviewKeywords',
        'reviewerAvailable',
        'reviewerUnavailableUntil',
        'reviewerMaxActiveReviews',
      ],
      order: { displayName: 'ASC', email: 'ASC' },
    });
  }

  private async listReviewerIdsNotTakingInvitations(
    profiles: Array<
      Pick<
        User,
        | 'id'
        | 'reviewerAvailable'
        | 'reviewerUnavailableUntil'
        | 'reviewerMaxActiveReviews'
      >
    >,
  ): Promise<string[]> {
    const today = utcToday();
    const unavailable = profiles
      .filter((p) => !isReviewerAvailable(p, today))
      .map((p) => p.id);
    const limited = profiles.filter(
      (p) =>
        p.reviewerMaxActiveReviews != null && isReviewerAvailable(p, today),
    );
    if (limited.length === 0) return unavailable;
    const loads: Array<{ reviewerId: string; n: number }> =
      await this.assignmentsRepo
        .createQueryBuilder('a')
        .select('a.reviewerId', 'reviewerId')
        .addSelect('COUNT(*)::int', 'n')
        .where('a.reviewerId IN (:...ids)', { ids: limited.map((p) => p.id) })
        .andWhere('a.status IN (:...statuses)', {
          statuses: [...ACTIVE_REVIEW_STATUSES],
        })
        .groupBy('a.reviewerId')
        .getRawMany();
    const loadById = new Map(loads.map((l) => [l.reviewerId, l.n]));
    const atCapacity = limited
      .filter((p) =>
        isAtReviewCapacity(loadById.get(p.id) ?? 0, p.reviewerMaxActiveReviews),
      )
      .map((p) => p.id);
    return [...unavailable, ...atCapacity];
  }

  private async loadReviewHistoryForMatching(
    reviewerIds: string[],
    excludeSubmissionId: string,
  ): Promise<
    Array<{
      reviewerId: string;
      submissionId: string;
      abstract: string;
      keywords: string;
    }>
  > {
    if (reviewerIds.length === 0) {
      return [];
    }
    const assignments = await this.assignmentsRepo.find({
      where: {
        reviewerId: In(reviewerIds),
        status: AssignmentStatus.COMPLETED,
      },
      relations: ['submission'],
    });
    const rows: Array<{
      reviewerId: string;
      submissionId: string;
      abstract: string;
      keywords: string;
    }> = [];
    for (const assignment of assignments) {
      if (assignment.submissionId === excludeSubmissionId) {
        continue;
      }
      const sub = assignment.submission;
      if (!sub) {
        continue;
      }
      const abstract = (
        sub.abstractAr?.trim() ||
        sub.abstract?.trim() ||
        ''
      ).trim();
      const keywords = [sub.keywordsAr, sub.keywords]
        .map((k) => k?.trim())
        .filter((k): k is string => !!k)
        .join(', ');
      if (!abstract && !keywords) {
        continue;
      }
      rows.push({
        reviewerId: assignment.reviewerId,
        submissionId: assignment.submissionId,
        abstract: sub.abstract ?? '',
        keywords: sub.keywords ?? '',
      });
    }
    return rows;
  }
}
