import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { ReviewRecommendation } from '../entities/review.entity';
import {
  CopyeditAssignment,
  CopyeditAssignmentStatus,
} from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import type { RequestUser } from '../common/types/request-user';
import {
  JournalIssuesService,
  type PublishableIssue,
} from '../journals/journal-issues.service';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { slugifySubmissionTitle } from './slugify-submission-title';
import { PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT } from './publication-catalog-search.util';
import type { PublicationCatalogFilters } from './publication-catalog-search.util';
import type { SubmissionFileKind } from './submission-file-kinds';
import type {
  ConstructorContent,
  ConstructorValidationError,
} from './constructor-content.types';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { sanitizeConstructorContent } from './sanitize-constructor-html';
import type { AiJobResponse } from '../ai-jobs/ai-jobs.service';
import type { CorpusSimilarityReport } from './corpus-similarity-report.util';
import type { SuggestedReviewersReport } from './suggested-reviewers-report.util';
import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { CopyeditWorkflowService } from './copyedit-workflow.service';
import {
  SubmissionLifecycleService,
  type UpdateStatusOptions,
} from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';
import { SectionEditorWorkflowService } from './section-editor-workflow.service';

@Injectable()
export class SubmissionsService implements OnModuleInit {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    @InjectRepository(CopyeditAssignment)
    private readonly copyeditAssignmentsRepo: Repository<CopyeditAssignment>,
    private readonly access: SubmissionAccessService,
    private readonly catalog: PublicationCatalogService,
    private readonly files: SubmissionFileService,
    private readonly reviewWorkflow: ReviewWorkflowService,
    private readonly copyeditWorkflow: CopyeditWorkflowService,
    private readonly lifecycle: SubmissionLifecycleService,
    private readonly ai: SubmissionAiService,
    private readonly preSubmitAnalysis: PreSubmitAnalysisService,
    private readonly sectionEditorWorkflow: SectionEditorWorkflowService,
    private readonly journalMemberships: JournalMembershipService,
    private readonly journalIssues: JournalIssuesService,
  ) {}

  listDisciplineLabels(): {
    labels: readonly string[];
    journalScope: string[];
  } {
    return this.ai.listDisciplineLabels();
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
    return this.ai.suggestDiscipline(slug, user);
  }

  async suggestKeywordsPreview(
    user: RequestUser,
    input: {
      title?: string;
      abstract?: string;
      titleAr?: string;
      abstractAr?: string;
    },
  ): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    return this.ai.suggestKeywordsPreview(user, input);
  }

  async suggestKeywords(
    slug: string,
    user: RequestUser,
  ): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    return this.ai.suggestKeywords(slug, user);
  }

  async setDisciplineForUser(
    slug: string,
    user: RequestUser,
    disciplines: string[],
  ): Promise<Submission> {
    return this.ai.setDisciplineForUser(slug, user, disciplines);
  }

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyAssignmentStatus();
    await this.migrateLegacyCopyeditAssignmentStatus();
  }

  /** Map pre-invitation enum value `pending` to `accepted` for existing rows. */
  private async migrateLegacyAssignmentStatus(): Promise<void> {
    try {
      await this.assignmentsRepo.query(
        `UPDATE review_assignments SET status = $1 WHERE status = $2`,
        [AssignmentStatus.ACCEPTED, 'pending'],
      );
    } catch {
      /* ignore if column type differs on first sync */
    }
  }

  /** Map legacy `completed` copyedit assignment rows to `ready_for_review`. */
  private async migrateLegacyCopyeditAssignmentStatus(): Promise<void> {
    try {
      await this.copyeditAssignmentsRepo.query(
        `UPDATE copyedit_assignments SET status = $1 WHERE status = $2`,
        [CopyeditAssignmentStatus.READY_FOR_REVIEW, 'completed'],
      );
    } catch {
      /* ignore on first sync */
    }
  }

  /**
   * Submit-time validation for constructor-mode submissions. Returns the
   * structured error array used by the frontend ValidationBanner. Empty
   * array means valid.
   */
  validateConstructorContentForSubmit(
    content: ConstructorContent | null | undefined,
  ): ConstructorValidationError[] {
    return this.lifecycle.validateConstructorContentForSubmit(content);
  }

  async create(
    authorId: string,
    dto: CreateSubmissionDto,
  ): Promise<Submission> {
    return this.lifecycle.create(authorId, dto);
  }

  /**
   * Journals whose queue this editor may see, or `'all'` for the
   * university-wide `journal_manager`.
   *
   * An editor with no memberships is scoped to nothing rather than to
   * everything — the opposite default would make the scope silently
   * unenforced for exactly the accounts nobody has configured yet.
   */
  private async editorQueueJournalIds(
    user: RequestUser,
  ): Promise<string[] | 'all'> {
    if (user.roleSlugs.includes(ROLE_SLUGS.JOURNAL_MANAGER)) {
      return 'all';
    }
    return this.journalMemberships.listJournalIdsForUser(
      user.sub,
      ROLE_SLUGS.EDITOR,
    );
  }

  async findAllForUser(
    user: RequestUser,
    status?: SubmissionStatus,
  ): Promise<Submission[]> {
    if (
      this.access.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
    ) {
      const qb = this.submissionsRepo
        .createQueryBuilder('s')
        .where('s.status != :draft', { draft: SubmissionStatus.DRAFT })
        .orderBy('s.updatedAt', 'DESC');
      if (status) {
        qb.andWhere('s.status = :status', { status });
      }
      const journalIds = await this.editorQueueJournalIds(user);
      if (journalIds !== 'all') {
        // Unplaced submissions (`journal_id IS NULL`) stay visible to every
        // editor: the column is nullable until the author picker lands, and a
        // row nobody can see is a row nobody can triage. Once slice 6 makes it
        // NOT NULL this disjunct becomes dead and should be dropped.
        if (journalIds.length === 0) {
          qb.andWhere('s.journal_id IS NULL');
        } else {
          qb.andWhere(
            '(s.journal_id IS NULL OR s.journal_id IN (:...journalIds))',
            { journalIds },
          );
        }
      }
      return qb.getMany();
    }
    if (
      this.access.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE)
    ) {
      return this.sectionEditorWorkflow.listSectionQueue(user.sub, status);
    }
    const qb = this.submissionsRepo
      .createQueryBuilder('s')
      .where('s.author_id = :authorId', { authorId: user.sub })
      .orderBy('s.updatedAt', 'DESC');
    if (status) {
      qb.andWhere('s.status = :status', { status });
    }
    return qb.getMany();
  }

  async findPublishedList(
    filters: PublicationCatalogFilters = {},
    pagination?: { limit?: number; offset?: number },
  ) {
    return this.catalog.findPublishedList(filters, pagination);
  }

  async findPublishedAuthorSuggestions(
    q: string,
    limit = PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT,
  ) {
    return this.catalog.findPublishedAuthorSuggestions(q, limit);
  }

  async findPublishedSemanticList(
    filters: PublicationCatalogFilters,
    limit = 20,
  ) {
    return this.catalog.findPublishedSemanticList(filters, limit);
  }

  async findPublishedOne(slug: string): Promise<Submission> {
    return this.catalog.findPublishedOne(slug);
  }

  /** Queue async similarity indexing for a published submission. */
  async enqueuePublishedSubmissionForSimilarity(
    submissionId: string,
  ): Promise<void> {
    return this.catalog.enqueuePublishedSubmissionForSimilarity(submissionId);
  }

  /** Queue index jobs for published articles not yet in the similarity corpus. */
  async enqueueMissingSimilarityIndexJobs(): Promise<number> {
    return this.catalog.enqueueMissingSimilarityIndexJobs();
  }

  async findRelatedPublications(slug: string, limit = 5) {
    return this.catalog.findRelatedPublications(slug, limit);
  }

  async getBySlugOrThrow(slug: string): Promise<Submission> {
    return this.access.getBySlugOrThrow(slug);
  }

  async getBySlugForAuthor(
    slug: string,
    authorId: string,
  ): Promise<Submission | null> {
    return this.access.getBySlugForAuthor(slug, authorId);
  }

  /** Read the attached `manuscript_constructor` file for round-trip re-import. */
  async readAttachedConstructorDocxBuffer(
    slug: string,
    user: RequestUser,
  ): Promise<Buffer> {
    return this.files.readAttachedConstructorDocxBuffer(slug, user);
  }

  async findOneForUser(
    slug: string,
    user: RequestUser,
  ): Promise<Record<string, unknown>> {
    return this.access.findOneForUser(slug, user);
  }

  async assertCanRead(
    submission: Submission,
    user: RequestUser,
  ): Promise<void> {
    return this.access.assertCanRead(submission, user);
  }

  async startCorpusSimilarityJob(
    slug: string,
    user: RequestUser,
  ): Promise<AiJobResponse | CorpusSimilarityReport> {
    return this.ai.startCorpusSimilarityJob(slug, user);
  }

  async getCorpusSimilarityJob(
    slug: string,
    jobId: string,
    user: RequestUser,
  ): Promise<AiJobResponse> {
    return this.ai.getCorpusSimilarityJob(slug, jobId, user);
  }

  async getLatestCorpusSimilarityJob(
    slug: string,
    user: RequestUser,
  ): Promise<AiJobResponse | null> {
    return this.ai.getLatestCorpusSimilarityJob(slug, user);
  }

  async getSuggestedReviewers(
    slug: string,
    user: RequestUser,
  ): Promise<SuggestedReviewersReport> {
    return this.ai.getSuggestedReviewers(slug, user);
  }

  async update(
    slug: string,
    user: RequestUser,
    dto: UpdateSubmissionDto,
  ): Promise<Submission> {
    return this.lifecycle.update(slug, user, dto);
  }

  async submit(
    slug: string,
    user: RequestUser,
    options?: {
      constructorContent?: ConstructorContent;
      useUploadedManuscript?: boolean;
      presentUploadedManuscript?: boolean;
      presentConstructorManuscript?: boolean;
      authorResponseToReviewers?: string;
    },
  ): Promise<Submission> {
    return this.lifecycle.submit(slug, user, options);
  }

  /**
   * Generate a `.docx` from the supplied constructor content. The content is
   * read directly from the request body (NOT the DB) to eliminate any race
   * with pending debounced PATCH saves on the client.
   *
   * When `attach=true`, the binary is saved as the submission's
   * `kind=manuscript` file (replacing any existing one) and the file row
   * is returned. Otherwise the buffer is returned for the controller to
   * stream back to the client.
   */
  async generateDocx(
    submissionSlug: string,
    user: RequestUser,
    content: ConstructorContent,
    options: {
      attach?: boolean;
      attachKind?: SubmissionFileKind;
    } = {},
  ): Promise<
    | { kind: 'buffer'; data: Buffer }
    | { kind: 'attached'; file: SubmissionFile }
  > {
    return this.lifecycle.generateDocx(submissionSlug, user, content, options);
  }

  /**
   * Generate a `.docx` from constructor content without requiring
   * a submission row. Used by the pre-submission constructor page when
   * the user only wants to download a Word file.
   */
  async generateDocxStandalone(content: ConstructorContent): Promise<Buffer> {
    return this.lifecycle.generateDocxStandalone(content);
  }

  async updateStatus(
    slug: string,
    user: RequestUser,
    next: SubmissionStatus,
    editorFolioLocale?: string,
    messageForAuthorInput?: string,
    options?: UpdateStatusOptions,
  ): Promise<Submission> {
    return this.lifecycle.updateStatus(
      slug,
      user,
      next,
      editorFolioLocale,
      messageForAuthorInput,
      options,
    );
  }

  async updateReviewMethod(
    slug: string,
    user: RequestUser,
    method: SubmissionReviewMethod,
  ) {
    return this.reviewWorkflow.updateReviewMethod(slug, user, method);
  }

  async setReviewFileRelease(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
    released: boolean,
  ): Promise<SubmissionFile> {
    return this.files.setReviewFileRelease(
      submissionSlug,
      fileId,
      user,
      released,
    );
  }

  async deleteReviewerFile(
    assignmentSlug: string,
    reviewerId: string,
    fileId: string,
  ): Promise<void> {
    return this.files.deleteReviewerFile(assignmentSlug, reviewerId, fileId);
  }

  async updateSubmissionFileStage(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
    stage: SubmissionFileStage,
  ) {
    return this.reviewWorkflow.updateSubmissionFileStage(
      submissionSlug,
      fileId,
      user,
      stage,
    );
  }

  async assignReviewer(
    submissionSlug: string,
    reviewerId: string,
    editor: RequestUser,
    editorFolioLocale?: string,
    options?: {
      assignmentSlug?: string;
      emitReviewerInvited?: boolean;
      responseDueAt?: string;
      reviewDueAt?: string;
      editorInstructions?: string;
    },
  ): Promise<ReviewAssignment> {
    return this.reviewWorkflow.assignReviewer(
      submissionSlug,
      reviewerId,
      editor,
      editorFolioLocale,
      options,
    );
  }

  async acceptReviewInvitation(assignmentSlug: string, reviewerId: string) {
    return this.reviewWorkflow.acceptReviewInvitation(
      assignmentSlug,
      reviewerId,
    );
  }

  async declineReviewInvitation(assignmentSlug: string, reviewerId: string) {
    return this.reviewWorkflow.declineReviewInvitation(
      assignmentSlug,
      reviewerId,
    );
  }

  async listAssignments(submissionSlug: string, user: RequestUser) {
    return this.reviewWorkflow.listAssignments(submissionSlug, user);
  }

  async listMyAssignments(reviewerId: string) {
    return this.reviewWorkflow.listMyAssignments(reviewerId);
  }

  async getMyAssignmentBySlug(assignmentSlug: string, reviewerId: string) {
    return this.reviewWorkflow.getMyAssignmentBySlug(
      assignmentSlug,
      reviewerId,
    );
  }

  async listReviews(submissionSlug: string, user: RequestUser) {
    return this.reviewWorkflow.listReviews(submissionSlug, user);
  }

  async submitReview(
    assignmentSlug: string,
    reviewerId: string,
    commentsForAuthor: string,
    commentsToEditorOnly: string,
    recommendation: ReviewRecommendation,
  ) {
    return this.reviewWorkflow.submitReview(
      assignmentSlug,
      reviewerId,
      commentsForAuthor,
      commentsToEditorOnly,
      recommendation,
    );
  }

  async addFile(
    submissionSlug: string,
    user: RequestUser,
    file: Express.Multer.File,
    kindRaw?: string,
  ) {
    return this.files.addFile(submissionSlug, user, file, kindRaw);
  }

  async getFileForUser(
    submissionSlug: string,
    fileId: string,
    user: RequestUser | null,
  ) {
    return this.files.getFileForUser(submissionSlug, fileId, user);
  }

  async deleteFile(submissionSlug: string, fileId: string, user: RequestUser) {
    return this.files.deleteFile(submissionSlug, fileId, user);
  }

  toPublicSummary(s: Submission) {
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      titleAr: s.titleAr,
      abstract: s.abstract,
      abstractAr: s.abstractAr,
      articleType: s.articleType,
      keywords: s.keywords,
      keywordsAr: s.keywordsAr,
      contributors: s.contributors,
      fundingStatement: s.fundingStatement,
      conflictOfInterestStatement: s.conflictOfInterestStatement,
      ethicalApprovalReference: s.ethicalApprovalReference,
      originalityConfirmed: s.originalityConfirmed,
      aiUsageStatement: s.aiUsageStatement,
      constructorContent: sanitizeConstructorContent(s.constructorContent),
      reviewManuscriptPresentation: s.reviewManuscriptPresentation,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      publishedAt: s.publishedAt,
      authorId: s.authorId,
      reviewMethod: s.reviewMethod,
    };
  }

  toPublicationListItem(s: Submission) {
    return this.catalog.toPublicationListItem(s);
  }

  async assignCopyeditor(
    submissionSlug: string,
    copyeditorId: string,
    editor: RequestUser,
  ): Promise<CopyeditAssignment> {
    return this.copyeditWorkflow.assignCopyeditor(
      submissionSlug,
      copyeditorId,
      editor,
    );
  }

  async listCopyeditAssignments(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
    return this.copyeditWorkflow.listCopyeditAssignments(submissionSlug, user);
  }

  async listMyCopyeditAssignments(
    copyeditorId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.copyeditWorkflow.listMyCopyeditAssignments(copyeditorId);
  }

  async submitCopyeditNote(
    assignmentSlug: string,
    copyeditorId: string,
    noteForAuthor: string,
    noteToEditorOnly: string,
  ): Promise<CopyeditNote> {
    return this.copyeditWorkflow.submitCopyeditNote(
      assignmentSlug,
      copyeditorId,
      noteForAuthor,
      noteToEditorOnly,
    );
  }

  async markCopyeditAuthorReady(
    assignmentSlug: string,
    authorId: string,
  ): Promise<CopyeditAssignment> {
    return this.copyeditWorkflow.markCopyeditAuthorReady(
      assignmentSlug,
      authorId,
    );
  }

  async markCopyeditCopyeditorApproved(
    assignmentSlug: string,
    copyeditorId: string,
  ): Promise<CopyeditAssignment> {
    return this.copyeditWorkflow.markCopyeditCopyeditorApproved(
      assignmentSlug,
      copyeditorId,
    );
  }

  async listCopyeditNotes(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
    return this.copyeditWorkflow.listCopyeditNotes(submissionSlug, user);
  }

  async publishSubmission(
    slug: string,
    user: RequestUser,
    issueId: string,
  ): Promise<Submission> {
    return this.copyeditWorkflow.publishSubmission(slug, user, issueId);
  }

  /**
   * Issues of this submission's journal that can receive it. Read through the
   * submission rather than the journal so the caller's existing access to the
   * submission is what governs, and an unplaced submission returns nothing
   * instead of leaking another journal's issue list.
   */
  async listPublishableIssues(
    slug: string,
    user: RequestUser,
  ): Promise<PublishableIssue[]> {
    const submission = await this.access.getBySlugOrThrow(slug);
    await this.access.assertCanRead(submission, user);
    if (!submission.journalId) return [];
    return this.journalIssues.listPublishableIssues(submission.journalId);
  }

  async retractSubmission(
    slug: string,
    user: RequestUser,
  ): Promise<Submission> {
    return this.copyeditWorkflow.retractSubmission(slug, user);
  }

  /**
   * Backfill slugs for legacy rows (seed / one-off maintenance).
   */
  async backfillSlugs(): Promise<void> {
    const subs = await this.submissionsRepo.find({
      order: { createdAt: 'ASC' },
    });
    const used = new Set(
      subs.map((x) => x.slug).filter((x): x is string => !!x),
    );
    for (const s of subs) {
      if (s.slug) continue;
      const base = slugifySubmissionTitle(s.title);
      let candidate = base;
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${base}-${n}`;
        n += 1;
      }
      s.slug = candidate;
      used.add(candidate);
      await this.submissionsRepo.save(s);
    }
    const assignments = await this.assignmentsRepo.find({
      relations: ['submission'],
      order: { assignedAt: 'ASC' },
    });
    for (const a of assignments) {
      if (a.slug) continue;
      const sub = a.submission
        ? a.submission
        : await this.submissionsRepo.findOne({
            where: { id: a.submissionId },
          });
      if (!sub?.slug) continue;
      a.slug = await this.reviewWorkflow.allocateAssignmentSlugForSeed(
        sub.slug,
      );
      await this.assignmentsRepo.save(a);
    }
  }

  async runPreSubmitAnalysis(slug: string, user: RequestUser) {
    return this.preSubmitAnalysis.runAnalysis(slug, user);
  }

  async acknowledgePreSubmitAnalysis(slug: string, user: RequestUser) {
    return this.preSubmitAnalysis.acknowledge(slug, user);
  }

  async runCopyeditAnalysis(
    assignmentSlug: string,
    user: RequestUser,
  ): Promise<{
    formatIssues: string[];
    grammarNotes: Array<{ excerpt: string; suggestion: string; rule: string }>;
    referenceIssues: string[];
    aiUnavailable: boolean;
  }> {
    return this.copyeditWorkflow.runCopyeditAnalysis(assignmentSlug, user);
  }
}
