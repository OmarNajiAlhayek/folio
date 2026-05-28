import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPE } from '../notifications/notification-types';
import {
  reviewInvitationAcceptedKey,
  reviewInvitationDeclinedKey,
  reviewSubmittedKey,
} from '../notifications/notification-idempotency';
import { Notification } from '../entities/notification.entity';
import { ROUTING_KEY } from '../messaging/contracts/email-events';
import type {
  CopyeditAssignedEvent,
  CopyeditAuthorReadyEvent,
  CopyeditQueriesSentEvent,
  ReviewerInvitedEvent,
  SubmissionDecisionEvent,
  SubmissionDecisionKind,
  SubmissionSubmittedEvent,
} from '../messaging/contracts/email-events';
import {
  copyeditAssignedKey,
  copyeditAuthorReadyKey,
  copyeditQueriesSentKey,
  reviewerInvitedKey,
  submissionDecisionKey,
  submissionSubmittedKey,
} from '../messaging/shared/idempotency';
import { truncateCopyeditNoteExcerpt } from '../common/copyedit-email-excerpt';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { Review, ReviewRecommendation } from '../entities/review.entity';
import {
  CopyeditAssignment,
  CopyeditAssignmentStatus,
} from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import type { AuthorReviewPublicView } from '../reviews/author-review-public.view';
import { User } from '../entities/user.entity';
import { resolveEmailLocale } from '../common/email-locale';
import { assignmentInvitePageUrl } from '../common/folio-frontend-urls';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { ContributorDto } from './dto/contributor.dto';
import { slugifySubmissionTitle } from './slugify-submission-title';
import {
  applyPublicationCatalogQuery,
  PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
  PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT,
  PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT,
  PUBLICATION_AUTHOR_SUGGESTION_MIN_QUERY_LENGTH,
  PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL,
  PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
  publicationCatalogHasTextOrFilters,
  publicationCatalogNeedsAuthorJoin,
  trimCatalogFilter,
  type PublicationCatalogFilters,
  type PublishedAuthorSuggestionRow,
} from './publication-catalog-search.util';
import {
  normalizeSubmissionFileKind,
  type SubmissionFileKind,
} from './submission-file-kinds';
import {
  resolveSubmitPresentation,
  type ReviewManuscriptPresentation,
} from './review-manuscript-presentation.types';
import {
  isExtensionAllowedForKind,
  sniffUploadMime,
} from './submission-file-upload.policy';
import type { SubmissionContributorJson } from './submission-json.types';
import type {
  ConstructorContent,
  ConstructorValidationError,
} from './constructor-content.types';
import {
  diffOrphanedFileIds,
  hasMeaningfulConstructorContent,
  validateConstructorContentForSubmit,
} from './constructor-content-utils';
import { DocxGeneratorService } from './docx-generator.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { open, readFile, rename, unlink, writeFile } from 'fs/promises';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { sanitizeConstructorContent } from './sanitize-constructor-html';
import { submissionToViewerJson } from './submission-response.mapper';
import type { SubmissionViewerRole } from './submission-viewer-role';
import { AiClientService } from '../ai/ai-client.service';
import { SubmissionDisciplineSource } from '../entities/submission-discipline-source.enum';
import {
  isValidDisciplineLabel,
  ARABIC_DISCIPLINE_LABELS,
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
import {
  isSimilarityCorpusArticleId,
  publicationSimilarityIndexPayload,
} from './publication-similarity.util';
import {
  aggregateCorpusSimilarityMatches,
  attachPublicationMetadata,
  type CorpusSimilarityReport,
} from './corpus-similarity-report.util';
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
const EDITOR_TRANSITIONS: Partial<
  Record<SubmissionStatus, SubmissionStatus[]>
> = {
  [SubmissionStatus.SUBMITTED]: [
    SubmissionStatus.UNDER_REVIEW,
    SubmissionStatus.REVISIONS_REQUESTED,
    SubmissionStatus.REJECTED,
    SubmissionStatus.ACCEPTED,
  ],
  [SubmissionStatus.UNDER_REVIEW]: [
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.REJECTED,
    SubmissionStatus.REVISIONS_REQUESTED,
  ],
};

const DECISION_STATUS_TO_KIND: Partial<
  Record<SubmissionStatus, SubmissionDecisionKind>
> = {
  [SubmissionStatus.REVISIONS_REQUESTED]: 'revisions_requested',
  [SubmissionStatus.ACCEPTED]: 'accepted',
  [SubmissionStatus.REJECTED]: 'rejected',
};

/** Statuses where editors may invite reviewers or reconfigure the review package. */
const REVIEW_CONFIGURATION_STATUSES: readonly SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
];

@Injectable()
export class SubmissionsService implements OnModuleInit {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(SubmissionFile)
    private readonly filesRepo: Repository<SubmissionFile>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    @InjectRepository(Review)
    private readonly reviewsRepo: Repository<Review>,
    @InjectRepository(CopyeditAssignment)
    private readonly copyeditAssignmentsRepo: Repository<CopyeditAssignment>,
    @InjectRepository(CopyeditNote)
    private readonly copyeditNotesRepo: Repository<CopyeditNote>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly rbacService: RbacService,
    private readonly docxGeneratorService: DocxGeneratorService,
    private readonly manuscriptStyles: ManuscriptStyleRegistryService,
    private readonly eventPublisher: EventPublisherService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly aiClient: AiClientService,
  ) {}

  listDisciplineLabels(): { labels: readonly string[]; journalScope: string[] } {
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

  private async refreshDisciplineSuggestion(submission: Submission): Promise<boolean> {
    const text = resolveClassifyText(submission);
    if (!text.abstract.trim()) {
      return false;
    }
    const result = await this.aiClient.classifyArticle(text);
    if (!result) {
      return false;
    }
    const allowed = this.journalAllowedDisciplines();
    submission.disciplineSuggested = result.top_label;
    submission.disciplineSuggestedConfidence = String(result.top_confidence);
    submission.disciplineClassification = buildClassificationJson(result, allowed);
    return true;
  }

  async suggestDiscipline(
    slug: string,
    user: RequestUser,
  ): Promise<{
    topLabel: string;
    topConfidence: number;
    probabilities: Record<string, number>;
    scopeInJournal: boolean;
    scopeWarning: string | null;
    discipline: string | null;
    disciplineSuggested: string | null;
  }> {
    const s = await this.getBySlugOrThrow(slug);
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
        message: 'Discipline suggestion is only available while editing the draft',
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
    const ok = await this.refreshDisciplineSuggestion(s);
    if (!ok) {
      throw new BadRequestException({
        message: 'Could not classify submission; try again later',
        code: 'AI_CLASSIFICATION_FAILED',
      });
    }
    await this.submissionsRepo.save(s);
    const classification = s.disciplineClassification!;
    return {
      topLabel: s.disciplineSuggested!,
      topConfidence: Number(s.disciplineSuggestedConfidence),
      probabilities: classification.probabilities,
      scopeInJournal: classification.scopeInJournal,
      scopeWarning: classification.scopeWarning,
      discipline: s.discipline,
      disciplineSuggested: s.disciplineSuggested,
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
    const s = await this.getBySlugOrThrow(slug);
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
        message: 'Keyword suggestions are only available while editing the draft',
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
    discipline: string,
  ): Promise<Submission> {
    if (!isValidDisciplineLabel(discipline)) {
      throw new BadRequestException({
        message: 'Invalid discipline label',
        code: 'VALIDATION_ERROR',
      });
    }
    const s = await this.getBySlugOrThrow(slug);
    const isAuthor =
      s.authorId === user.sub &&
      (s.status === SubmissionStatus.DRAFT ||
        s.status === SubmissionStatus.REVISIONS_REQUESTED);
    if (isAuthor) {
      s.discipline = discipline;
      s.disciplineSource = SubmissionDisciplineSource.AUTHOR;
      return this.submissionsRepo.save(s);
    }
    throw new ForbiddenException({
      message: 'Only the author can set discipline on this submission',
      code: 'FORBIDDEN',
    });
  }

  private emitPendingNotifications(pending: Notification[]): void {
    if (pending.length > 0) {
      this.notifications.emitCreated(pending);
    }
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

  private appBaseUrl(): string {
    return (this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240').replace(
      /\/+$/,
      '',
    );
  }

  private hasPerm(user: RequestUser, slug: string): boolean {
    return user.permissionSlugs.includes(slug);
  }

  private viewerRole(
    submission: Submission,
    user: RequestUser,
  ): SubmissionViewerRole {
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)) {
      return 'editor';
    }
    if (submission.authorId === user.sub) {
      return 'author';
    }
    if (
      this.hasPerm(user, PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE) &&
      submission.copyeditAssignments?.some((a) => a.copyeditorId === user.sub)
    ) {
      return 'copyeditor';
    }
    return 'reviewer';
  }

  private async assertHasReviewManuscriptPackage(submissionId: string): Promise<void> {
    const count = await this.filesRepo.count({
      where: {
        submissionId,
        fileStage: SubmissionFileStage.REVIEW,
        kind: In(['manuscript', 'manuscript_constructor']),
      },
    });
    if (count < 1) {
      throw new BadRequestException({
        message:
          'Add at least one manuscript file to the review package (editor file stage) before starting peer review',
        code: 'REVIEW_PACKAGE_INCOMPLETE',
      });
    }
  }

  private parseKeywordList(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw
      .split(/[,;]/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  private mapContributors(dtos: ContributorDto[]): SubmissionContributorJson[] {
    return dtos.map((c, i) => ({
      fullName: c.fullName.trim(),
      email: c.email?.trim() || undefined,
      affiliation: c.affiliation.trim(),
      sortOrder: c.sortOrder ?? i,
      isCorresponding: c.isCorresponding,
    }));
  }

  private static readonly ABSTRACT_MAX_WORDS = 300;

  private countWords(s: string): number {
    const t = s.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  /** Journal guideline: each abstract at most 300 words (Damascus / docs/styles). */
  private assertAbstractWordLimits(english: string, arabic: string): void {
    const { ABSTRACT_MAX_WORDS: max } = SubmissionsService;
    if (this.countWords(english) > max) {
      throw new BadRequestException({
        message: `English abstract must be at most ${max} words`,
        code: 'SUBMISSION_ABSTRACT_TOO_LONG_EN',
      });
    }
    if (this.countWords(arabic) > max) {
      throw new BadRequestException({
        message: `Arabic abstract must be at most ${max} words`,
        code: 'SUBMISSION_ABSTRACT_TOO_LONG_AR',
      });
    }
  }

  /**
   * Editorial-style completeness check before first submit / resubmit.
   */
  private async assertReadyForSubmit(
    s: Submission,
    presentation: ReviewManuscriptPresentation,
  ): Promise<void> {
    if (!s.articleType) {
      throw new BadRequestException({
        message: 'Select an article type before submitting',
        code: 'SUBMISSION_INCOMPLETE_ARTICLE_TYPE',
      });
    }
    const kw = this.parseKeywordList(s.keywords);
    if (kw.length < 3 || kw.length > 6) {
      throw new BadRequestException({
        message:
          'Provide between 3 and 6 English keywords, separated by commas or semicolons',
        code: 'SUBMISSION_INCOMPLETE_KEYWORDS',
      });
    }
    const kwAr = this.parseKeywordList(s.keywordsAr);
    if (kwAr.length < 3 || kwAr.length > 6) {
      throw new BadRequestException({
        message:
          'Provide between 3 and 6 Arabic keywords, separated by commas or semicolons',
        code: 'SUBMISSION_INCOMPLETE_KEYWORDS_AR',
      });
    }
    if (!s.titleAr?.trim()) {
      throw new BadRequestException({
        message: 'Provide an Arabic title',
        code: 'SUBMISSION_INCOMPLETE_TITLE_AR',
      });
    }
    const contributors = s.contributors;
    if (!Array.isArray(contributors) || contributors.length < 1) {
      throw new BadRequestException({
        message: 'Add at least one author with affiliation',
        code: 'SUBMISSION_INCOMPLETE_CONTRIBUTORS',
      });
    }
    const corr = contributors.filter((c) => c.isCorresponding);
    if (corr.length !== 1) {
      throw new BadRequestException({
        message: 'Mark exactly one corresponding author',
        code: 'SUBMISSION_INCOMPLETE_CORRESPONDING',
      });
    }
    for (const c of contributors) {
      if (!c.fullName?.trim() || !c.affiliation?.trim()) {
        throw new BadRequestException({
          message: 'Each author needs a full name and affiliation',
          code: 'SUBMISSION_INCOMPLETE_CONTRIBUTOR_FIELDS',
        });
      }
    }
    if (!s.originalityConfirmed) {
      throw new BadRequestException({
        message: 'Confirm originality and single-journal submission',
        code: 'SUBMISSION_INCOMPLETE_ORIGINALITY',
      });
    }
    if (!s.conflictOfInterestStatement?.trim()) {
      throw new BadRequestException({
        message:
          'Provide a conflict-of-interest statement (or “None declared”)',
        code: 'SUBMISSION_INCOMPLETE_COI',
      });
    }
    if (!s.ethicalApprovalReference?.trim()) {
      throw new BadRequestException({
        message:
          'Provide ethics approval reference, or “N/A” if not applicable',
        code: 'SUBMISSION_INCOMPLETE_ETHICS',
      });
    }
    if (!s.aiUsageStatement?.trim()) {
      throw new BadRequestException({
        message:
          'Declare whether generative AI was used in preparation or analysis',
        code: 'SUBMISSION_INCOMPLETE_AI',
      });
    }
    if (!s.abstract?.trim()) {
      throw new BadRequestException({
        message: 'Provide an English abstract',
        code: 'SUBMISSION_INCOMPLETE_ABSTRACT',
      });
    }
    if (!s.abstractAr?.trim()) {
      throw new BadRequestException({
        message: 'Provide an Arabic abstract',
        code: 'SUBMISSION_INCOMPLETE_ABSTRACT_AR',
      });
    }
    this.assertAbstractWordLimits(s.abstract, s.abstractAr);
    const files = await this.filesRepo.find({
      where: { submissionId: s.id },
    });
    const kinds = new Set(files.map((f) => f.kind));
    const need: { kind: string; label: string }[] = [];
    if (presentation.presentUploaded) {
      need.push(
        { kind: 'cover_letter', label: 'cover letter' },
        { kind: 'title_page', label: 'title page' },
        { kind: 'manuscript', label: 'uploaded main manuscript' },
      );
    }
    if (presentation.presentConstructor) {
      need.push({
        kind: 'manuscript_constructor',
        label: 'constructor main manuscript',
      });
    }
    for (const { kind, label } of need) {
      if (!kinds.has(kind)) {
        throw new BadRequestException({
          message: `Upload or generate at least one file of type: ${label}`,
          code: 'SUBMISSION_INCOMPLETE_FILES',
        });
      }
    }
  }

  private async applyReviewManuscriptPresentation(
    submissionId: string,
    presentation: ReviewManuscriptPresentation,
  ): Promise<void> {
    const files = await this.filesRepo.find({ where: { submissionId } });
    for (const file of files) {
      if (file.kind === 'manuscript') {
        file.fileStage = presentation.presentUploaded
          ? SubmissionFileStage.REVIEW
          : SubmissionFileStage.SUBMISSION;
      } else if (file.kind === 'manuscript_constructor') {
        file.fileStage = presentation.presentConstructor
          ? SubmissionFileStage.REVIEW
          : SubmissionFileStage.SUBMISSION;
      }
    }
    if (files.length > 0) {
      await this.filesRepo.save(files);
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
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(content);
    const profile = this.manuscriptStyles.getProfile(styleId);
    return validateConstructorContentForSubmit(content, profile.constructor);
  }

  private uploadRoot(): string {
    const rel = process.env.UPLOAD_DIR ?? join('..', 'uploads');
    return join(process.cwd(), rel);
  }

  private ensureUploadDir(): string {
    const dir = this.uploadRoot();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private async unlinkUploadTemp(file: Express.Multer.File): Promise<void> {
    if (!file.path) return;
    try {
      await unlink(file.path);
    } catch {
      /* ignore missing temp */
    }
  }

  private assertAuthorMayAddFile(
    submission: Submission,
    user: RequestUser,
    kind: SubmissionFileKind,
  ): void {
    if (submission.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can upload files',
        code: 'FORBIDDEN',
      });
    }
    const canUpload =
      submission.status === SubmissionStatus.DRAFT ||
      submission.status === SubmissionStatus.REVISIONS_REQUESTED ||
      submission.status === SubmissionStatus.COPYEDITING;
    if (!canUpload) {
      throw new BadRequestException({
        message: 'Cannot upload in current status',
        code: 'VALIDATION_ERROR',
      });
    }
    if (
      submission.status === SubmissionStatus.COPYEDITING &&
      kind !== 'manuscript'
    ) {
      throw new BadRequestException({
        message: 'During copyediting only manuscript revisions may be uploaded',
        code: 'VALIDATION_ERROR',
      });
    }
  }

  private async replaceSubmissionFilesOfKind(
    submissionId: string,
    kind: SubmissionFileKind,
  ): Promise<void> {
    const existing = await this.filesRepo.find({
      where: { submissionId, kind },
    });
    for (const row of existing) {
      try {
        unlinkSync(join(this.uploadRoot(), row.storageKey));
      } catch {
        /* ignore */
      }
    }
    if (existing.length > 0) {
      await this.filesRepo.remove(existing);
    }
  }

  private async readFileSniffBuffer(
    source:
      | { type: 'path'; path: string }
      | { type: 'buffer'; buffer: Buffer },
  ): Promise<Buffer> {
    if (source.type === 'buffer') {
      return source.buffer.subarray(0, Math.min(4096, source.buffer.length));
    }
    const handle = await open(source.path, 'r');
    const sniffBuf = Buffer.alloc(4096);
    await handle.read(sniffBuf, 0, 4096, 0);
    await handle.close();
    return sniffBuf;
  }

  /**
   * Store a submission file on disk and insert its row. Accepts either a
   * Multer temp path (user upload) or an in-memory buffer (generated docx).
   */
  private async persistSubmissionFile(params: {
    submissionId: string;
    source:
      | { type: 'path'; path: string }
      | { type: 'buffer'; buffer: Buffer };
    originalName: string;
    kind: SubmissionFileKind;
    sizeBytes: number;
  }): Promise<SubmissionFile> {
    const ext = extname(params.originalName).toLowerCase();
    const sniffBuf = await this.readFileSniffBuffer(params.source);
    const sniff = sniffUploadMime(sniffBuf, ext, params.kind);
    if (!sniff.ok) {
      throw new BadRequestException({
        message: sniff.reason,
        code: 'VALIDATION_ERROR',
      });
    }

    const dir = this.ensureUploadDir();
    const storageKey = `${randomUUID()}${ext}`;
    const destPath = join(dir, storageKey);

    if (params.source.type === 'path') {
      await rename(params.source.path, destPath);
    } else {
      await writeFile(destPath, params.source.buffer);
    }

    const row = this.filesRepo.create({
      submissionId: params.submissionId,
      storageKey,
      originalName: params.originalName,
      mimeType: sniff.mimeType,
      sizeBytes: String(params.sizeBytes),
      kind: params.kind,
      fileStage: SubmissionFileStage.SUBMISSION,
      isPublic: false,
    });
    return this.filesRepo.save(row);
  }

  private async assertSubmissionSlugAvailable(
    slug: string,
    excludeSubmissionId?: string,
  ): Promise<void> {
    const qb = this.submissionsRepo
      .createQueryBuilder('s')
      .where('s.slug = :slug', { slug });
    if (excludeSubmissionId) {
      qb.andWhere('s.id != :excludeId', { excludeId: excludeSubmissionId });
    }
    const row = await qb.getOne();
    if (row) {
      throw new ConflictException({
        message: 'This title is already in use; please choose another',
        code: 'SUBMISSION_SLUG_TAKEN',
      });
    }
  }

  private async nextAssignmentSlug(submissionSlug: string): Promise<string> {
    for (let i = 0; i < 32; i++) {
      const suffix = randomBytes(4).toString('hex');
      const candidate = `${submissionSlug}--${suffix}`;
      const taken = await this.assignmentsRepo.exist({
        where: { slug: candidate },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException({
      message: 'Could not allocate assignment slug',
      code: 'VALIDATION_ERROR',
    });
  }

  async create(
    authorId: string,
    dto: CreateSubmissionDto,
  ): Promise<Submission> {
    this.assertAbstractWordLimits(dto.abstract, dto.abstractAr ?? '');
    const slug = slugifySubmissionTitle(dto.title);
    await this.assertSubmissionSlugAvailable(slug);
    const s = this.submissionsRepo.create({
      authorId,
      title: dto.title,
      titleAr: dto.titleAr,
      abstract: dto.abstract,
      abstractAr: dto.abstractAr,
      status: SubmissionStatus.DRAFT,
      slug,
      articleType: dto.articleType ?? null,
      keywords: dto.keywords?.trim() ?? null,
      keywordsAr: dto.keywordsAr?.trim() ?? null,
      contributors: dto.contributors?.length
        ? this.mapContributors(dto.contributors)
        : null,
      fundingStatement: dto.fundingStatement?.trim() ?? null,
      conflictOfInterestStatement:
        dto.conflictOfInterestStatement?.trim() ?? null,
      ethicalApprovalReference: dto.ethicalApprovalReference?.trim() ?? null,
      originalityConfirmed: dto.originalityConfirmed === true,
      aiUsageStatement: dto.aiUsageStatement?.trim() ?? null,
    });
    return this.submissionsRepo.save(s);
  }

  async findAllForUser(
    user: RequestUser,
    status?: SubmissionStatus,
  ): Promise<Submission[]> {
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)) {
      const qb = this.submissionsRepo
        .createQueryBuilder('s')
        .where('s.status != :draft', { draft: SubmissionStatus.DRAFT })
        .orderBy('s.updatedAt', 'DESC');
      if (status) {
        qb.andWhere('s.status = :status', { status });
      }
      return qb.getMany();
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
  ): Promise<Submission[]> {
    const hasFilters = publicationCatalogHasTextOrFilters(filters);
    if (!hasFilters) {
      return this.submissionsRepo.find({
        where: { status: SubmissionStatus.PUBLISHED },
        order: { publishedAt: 'DESC' },
        relations: ['author'],
      });
    }

    const qb = this.submissionsRepo.createQueryBuilder('s');
    applyPublicationCatalogQuery(qb, filters);
    if (!publicationCatalogNeedsAuthorJoin(filters)) {
      qb.leftJoinAndSelect('s.author', 'author');
    }
    return qb.getMany();
  }

  async findPublishedAuthorSuggestions(
    q: string,
    limit = PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT,
  ): Promise<PublishedAuthorSuggestionRow[]> {
    const trimmed = trimCatalogFilter(q);
    if (
      !trimmed ||
      trimmed.length < PUBLICATION_AUTHOR_SUGGESTION_MIN_QUERY_LENGTH
    ) {
      return [];
    }
    const lim = Math.min(
      PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT,
      Math.max(1, limit),
    );
    const matchParams = {
      pubAuthor: trimmed,
      pubAuthorSimMin: PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
    };

    const rows = await this.submissionsRepo
      .createQueryBuilder('s')
      .innerJoin('s.author', 'author')
      .select('author.displayName', 'displayName')
      .addSelect('COUNT(s.id)', 'publicationCount')
      .where('s.status = :pubStatus', { pubStatus: SubmissionStatus.PUBLISHED })
      .andWhere("COALESCE(author.display_name, '') <> ''")
      .andWhere(PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL, matchParams)
      .groupBy('author.displayName')
      .orderBy(PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL, 'DESC')
      .addOrderBy('COUNT(s.id)', 'DESC')
      .setParameters(matchParams)
      .limit(lim)
      .getRawMany<{ displayName: string; publicationCount: string }>();

    return rows.map((row) => ({
      displayName: row.displayName,
      publicationCount: Number(row.publicationCount) || 0,
    }));
  }

  async findPublishedSemanticList(
    filters: PublicationCatalogFilters,
    limit = 20,
  ): Promise<
    (ReturnType<SubmissionsService['toPublicationListItem']> & {
      searchSnippet: string;
      searchScore: number;
    })[]
  > {
    const q = filters.q?.trim();
    if (!q || !this.aiClient.isSimilarityEnabled()) {
      return [];
    }
    await this.backfillPublishedSimilarityIndex();
    const lim = Math.min(30, Math.max(1, limit));
    const hits = (
      await this.aiClient.semanticSearchPublications({ query: q, limit: lim })
    ).filter((h) => isSimilarityCorpusArticleId(h.article_id));
    if (hits.length === 0) {
      return [];
    }

    const ids = hits.map((h) => h.article_id);
    const { q: _omit, ...rest } = filters;
    const filtersWithoutQ: PublicationCatalogFilters = rest;
    const qb = this.submissionsRepo.createQueryBuilder('s');
    applyPublicationCatalogQuery(qb, filtersWithoutQ, {
      skipQuickSearch: true,
    });
    qb.andWhere('s.id IN (:...semanticIds)', { semanticIds: ids });
    if (!publicationCatalogNeedsAuthorJoin(filtersWithoutQ)) {
      qb.leftJoinAndSelect('s.author', 'author');
    }
    const rows = await qb.getMany();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const hitById = new Map(hits.map((h) => [h.article_id, h]));

    const ordered: (ReturnType<SubmissionsService['toPublicationListItem']> & {
      searchSnippet: string;
      searchScore: number;
    })[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      const hit = hitById.get(id);
      if (!row || !hit) {
        continue;
      }
      ordered.push({
        ...this.toPublicationListItem(row),
        searchSnippet: hit.snippet,
        searchScore: hit.score,
      });
    }
    return ordered;
  }

  async findPublishedOne(slug: string): Promise<Submission> {
    const s = await this.submissionsRepo.findOne({
      where: { slug, status: SubmissionStatus.PUBLISHED },
      relations: ['author', 'files'],
    });
    if (!s) {
      throw new NotFoundException({
        message: 'Publication not found',
        code: 'NOT_FOUND',
      });
    }
    return s;
  }

  async indexPublishedSubmissionForSimilarity(s: Submission): Promise<void> {
    if (!this.aiClient.isSimilarityEnabled()) {
      return;
    }
    const payload = publicationSimilarityIndexPayload(s);
    if (!payload) {
      return;
    }
    await this.aiClient.upsertSimilarityArticle({
      articleId: s.id,
      abstract: payload.abstract,
      keywords: payload.keywords,
      category: payload.category,
      fullText: payload.fullText,
    });
  }

  /** Index all published articles so related search works for existing corpus. */
  async backfillPublishedSimilarityIndex(): Promise<void> {
    if (!this.aiClient.isSimilarityEnabled()) {
      return;
    }
    const published = await this.findPublishedList();
    for (const row of published) {
      await this.indexPublishedSubmissionForSimilarity(row);
    }
  }

  async findRelatedPublications(
    slug: string,
    limit = 5,
  ): Promise<
    {
      id: string;
      slug: string;
      title: string;
      titleAr: string | null;
      abstract: string;
      abstractAr: string | null;
      similarity: number;
    }[]
  > {
    if (!this.aiClient.isSimilarityEnabled()) {
      return [];
    }
    await this.backfillPublishedSimilarityIndex();
    const s = await this.findPublishedOne(slug);
    const hits = (
      await this.aiClient.findSimilarArticles({
        articleId: s.id,
        limit,
      })
    ).filter(
      (h) =>
        isSimilarityCorpusArticleId(h.article_id) && h.article_id !== s.id,
    );
    if (hits.length === 0) {
      return [];
    }
    const ids = hits.map((h) => h.article_id);
    const related = await this.submissionsRepo.find({
      where: {
        id: In(ids),
        status: SubmissionStatus.PUBLISHED,
      },
    });
    const byId = new Map(related.map((r) => [r.id, r]));
    const rows: {
      id: string;
      slug: string;
      title: string;
      titleAr: string | null;
      abstract: string;
      abstractAr: string | null;
      similarity: number;
    }[] = [];
    for (const hit of hits) {
      const row = byId.get(hit.article_id);
      if (!row?.slug) {
        continue;
      }
      rows.push({
        id: row.id,
        slug: row.slug,
        title: row.title,
        titleAr: row.titleAr,
        abstract: row.abstract,
        abstractAr: row.abstractAr,
        similarity: hit.similarity,
      });
    }
    return rows;
  }

  async getBySlugOrThrow(slug: string): Promise<Submission> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    return s;
  }

  /** Drafts are author-only until submit; editor queue must not read them by slug. */
  private assertEditorQueueSubmissionVisible(submission: Submission): void {
    if (submission.status === SubmissionStatus.DRAFT) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
  }

  async assertCanRead(
    submission: Submission,
    user: RequestUser,
  ): Promise<void> {
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)) {
      this.assertEditorQueueSubmissionVisible(submission);
      return;
    }
    if (submission.authorId === user.sub) {
      return;
    }
    const assigned = await this.assignmentsRepo.exists({
      where: {
        submissionId: submission.id,
        reviewerId: user.sub,
        status: In([AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED]),
      },
    });
    if (assigned && this.hasPerm(user, PERMISSION_SLUGS.REVIEW_SUBMIT)) {
      return;
    }
    if (this.hasPerm(user, PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE)) {
      const copyeditAssigned = await this.copyeditAssignmentsRepo.exists({
        where: { submissionId: submission.id, copyeditorId: user.sub },
      });
      if (copyeditAssigned) return;
    }
    throw new ForbiddenException({
      message: 'Cannot access this submission',
      code: 'FORBIDDEN',
    });
  }

  async findOneForUser(
    slug: string,
    user: RequestUser,
  ): Promise<Record<string, unknown>> {
    const s = await this.submissionsRepo.findOne({
      where: { slug },
      relations: ['files', 'author', 'reviewAssignments', 'reviewAssignments.reviewer', 'copyeditAssignments'],
    });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.assertCanRead(s, user);
    const role = this.viewerRole(s, user);
    return submissionToViewerJson(s, role);
  }

  private static readonly CORPUS_SIMILARITY_THRESHOLD = 0.85;

  async getCorpusSimilarityReport(
    slug: string,
    user: RequestUser,
  ): Promise<CorpusSimilarityReport> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.assertCanRead(s, user);

    if (s.authorId === user.sub) {
      throw new ForbiddenException({
        message: 'Corpus similarity is not available to authors',
        code: 'FORBIDDEN',
      });
    }

    const isEditor = this.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const isCopyeditorOnly =
      this.hasPerm(user, PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE) && !isEditor;
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
        message: 'Corpus similarity requires editor or assigned reviewer access',
        code: 'FORBIDDEN',
      });
    }

    if (!this.aiClient.isCorpusSimilarityEnabled()) {
      return { status: 'unavailable' };
    }

    const plainText = buildSubmissionCorpusPlainText(s);
    if (!isCorpusPlainTextSufficient(plainText)) {
      return { status: 'no_text' };
    }

    const threshold = SubmissionsService.CORPUS_SIMILARITY_THRESHOLD;
    const matches = await this.aiClient.detectCorpusSimilarity({
      submissionText: plainText,
      threshold,
      category: s.discipline?.trim() || undefined,
    });
    if (matches === null) {
      return { status: 'unavailable' };
    }

    const aggregated = aggregateCorpusSimilarityMatches(s, matches);
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
        if (!row.slug) {
          continue;
        }
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
    await this.assertCanRead(s, user);

    if (
      !this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER) ||
      !this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
    ) {
      throw new ForbiddenException({
        message: 'Reviewer suggestions require editor assign permission',
        code: 'FORBIDDEN',
      });
    }

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
    const excludeReviewerIds = busyAssignments.map((a) => a.reviewerId);
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
    Array<{
      id: string;
      displayName: string;
      email: string;
      affiliation: string | null;
      reviewKeywords: string | null;
    }>
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
      ],
      order: { displayName: 'ASC', email: 'ASC' },
    });
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
      const abstract = (sub.abstractAr?.trim() || sub.abstract?.trim() || '').trim();
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

  async update(
    slug: string,
    user: RequestUser,
    dto: UpdateSubmissionDto,
  ): Promise<Submission> {
    const s = await this.getBySlugOrThrow(slug);
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can update this submission',
        code: 'FORBIDDEN',
      });
    }
    if (
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message: 'Cannot edit submission in current status',
        code: 'VALIDATION_ERROR',
      });
    }
    if (dto.title !== undefined) {
      const nextSlug = slugifySubmissionTitle(dto.title);
      if (nextSlug !== (s.slug ?? '')) {
        await this.assertSubmissionSlugAvailable(nextSlug, s.id);
        s.slug = nextSlug;
      }
      s.title = dto.title;
    }
    if (dto.titleAr !== undefined) {
      s.titleAr = dto.titleAr;
    }
    if (dto.abstract !== undefined) {
      s.abstract = dto.abstract;
    }
    if (dto.abstractAr !== undefined) {
      s.abstractAr = dto.abstractAr;
    }
    if (dto.articleType !== undefined) {
      s.articleType = dto.articleType;
    }
    if (dto.keywords !== undefined) {
      s.keywords = dto.keywords?.trim() ?? null;
    }
    if (dto.keywordsAr !== undefined) {
      s.keywordsAr = dto.keywordsAr?.trim() ?? null;
    }
    if (dto.contributors !== undefined) {
      s.contributors =
        dto.contributors && dto.contributors.length > 0
          ? this.mapContributors(dto.contributors)
          : null;
    }
    if (dto.fundingStatement !== undefined) {
      s.fundingStatement = dto.fundingStatement?.trim() ?? null;
    }
    if (dto.conflictOfInterestStatement !== undefined) {
      s.conflictOfInterestStatement =
        dto.conflictOfInterestStatement?.trim() ?? null;
    }
    if (dto.ethicalApprovalReference !== undefined) {
      s.ethicalApprovalReference = dto.ethicalApprovalReference?.trim() ?? null;
    }
    if (dto.originalityConfirmed !== undefined) {
      s.originalityConfirmed = dto.originalityConfirmed;
    }
    if (dto.aiUsageStatement !== undefined) {
      s.aiUsageStatement = dto.aiUsageStatement?.trim() ?? null;
    }
    let orphanedFileIds: string[] = [];
    if (dto.constructorContent !== undefined) {
      const oldContent = s.constructorContent;
      const rawContent =
        (dto.constructorContent as ConstructorContent | null) ?? null;
      const newContent = sanitizeConstructorContent(rawContent);
      if (newContent) {
        this.manuscriptStyles.assertConstructorContentStyleKnown(newContent);
      }
      orphanedFileIds = diffOrphanedFileIds(oldContent, newContent);
      s.constructorContent = newContent;
    }
    this.assertAbstractWordLimits(s.abstract, s.abstractAr ?? '');
    const saved = await this.submissionsRepo.save(s);
    if (orphanedFileIds.length > 0) {
      await this.dereferenceOrphanedFiles(saved.id, orphanedFileIds);
    }
    return saved;
  }

  /**
   * Deletes submission_files rows (DB + disk) whose IDs were dropped from
   * the constructor content during a PATCH. Best-effort on disk: a missing
   * file does not block the DB row removal.
   */
  private async dereferenceOrphanedFiles(
    submissionId: string,
    fileIds: string[],
  ): Promise<void> {
    if (fileIds.length === 0) return;
    const rows = await this.filesRepo.find({
      where: { id: In(fileIds), submissionId },
    });
    for (const row of rows) {
      try {
        unlinkSync(join(this.uploadRoot(), row.storageKey));
      } catch {
        /* missing file is fine; remove the row anyway */
      }
    }
    if (rows.length > 0) {
      await this.filesRepo.remove(rows);
    }
  }

  async submit(
    slug: string,
    user: RequestUser,
    options?: {
      constructorContent?: ConstructorContent;
      useUploadedManuscript?: boolean;
      presentUploadedManuscript?: boolean;
      presentConstructorManuscript?: boolean;
    },
  ): Promise<Submission> {
    const s = await this.getBySlugOrThrow(slug);
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can submit',
        code: 'FORBIDDEN',
      });
    }
    if (
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message: 'Invalid status for submit',
        code: 'VALIDATION_ERROR',
      });
    }
    const contentForDoc = sanitizeConstructorContent(
      options?.constructorContent ?? s.constructorContent ?? null,
    );
    const hasUploadedManuscript =
      (
        await this.filesRepo.find({
          where: { submissionId: s.id, kind: 'manuscript' },
          take: 1,
        })
      ).length > 0;
    const hasConstructorDraft = hasMeaningfulConstructorContent(contentForDoc);
    const presentation = resolveSubmitPresentation({
      presentUploadedManuscript: options?.presentUploadedManuscript,
      presentConstructorManuscript: options?.presentConstructorManuscript,
      useUploadedManuscript: options?.useUploadedManuscript,
      hasUploadedManuscript,
      hasConstructorDraft,
    });
    if (!presentation.presentUploaded && !presentation.presentConstructor) {
      throw new BadRequestException({
        message:
          'Select at least one main manuscript to present for review (uploaded file and/or Word Constructor)',
        code: 'SUBMISSION_MANUSCRIPT_PRESENTATION_REQUIRED',
      });
    }
    if (presentation.presentUploaded && !hasUploadedManuscript) {
      throw new BadRequestException({
        message: 'Upload a main manuscript file before submitting with that option',
        code: 'SUBMISSION_INCOMPLETE_FILES',
      });
    }
    if (presentation.presentConstructor) {
      if (!contentForDoc || !hasConstructorDraft) {
        throw new BadRequestException({
          message: 'Constructor content is required for this submission',
          code: 'CONSTRUCTOR_VALIDATION_FAILED',
          errors: [
            {
              code: 'CONSTRUCTOR_EMPTY',
              message: 'Constructor content is empty',
            },
          ],
        });
      }
      this.manuscriptStyles.assertConstructorContentStyleKnown(contentForDoc);
      const styleId =
        this.manuscriptStyles.resolveEffectiveStyleId(contentForDoc);
      const profile = this.manuscriptStyles.getProfile(styleId);
      const errors = validateConstructorContentForSubmit(
        contentForDoc,
        profile.constructor,
      );
      if (errors.length > 0) {
        throw new BadRequestException({
          message:
            'Constructor content is incomplete; please address the listed issues',
          code: 'CONSTRUCTOR_VALIDATION_FAILED',
          errors,
        });
      }
      await this.generateDocx(slug, user, contentForDoc, {
        attach: true,
        attachKind: 'manuscript_constructor',
      });
    }
    await this.assertReadyForSubmit(s, presentation);
    await this.applyReviewManuscriptPresentation(s.id, presentation);
    s.reviewManuscriptPresentation = presentation;
    if (this.aiClient.isEnabled()) {
      try {
        await this.refreshDisciplineSuggestion(s);
      } catch (err) {
        this.logger.warn(
          'Discipline classification on submit failed for %s: %s',
          slug,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    await this.submissionsRepo.save(s);
    const previousStatus = s.status;
    const isResubmission = previousStatus === SubmissionStatus.REVISIONS_REQUESTED;

    const pending: Notification[] = [];
    return this.submissionsRepo.manager
      .transaction(async (em) => {
        const submissionRepo = em.getRepository(Submission);
        s.status = SubmissionStatus.SUBMITTED;
        const saved = await submissionRepo.save(s);
        const created = await this.enqueueSubmissionSubmittedForEditors(
          {
            submission: saved,
            isResubmission,
          },
          em,
        );
        pending.push(...created);
        return saved;
      })
      .then((saved) => {
        this.emitPendingNotifications(pending);
        return saved;
      });
  }

  /**
   * Build a `.docx` from the supplied constructor content. The content is
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
  ): Promise<{ kind: 'buffer'; data: Buffer } | { kind: 'attached'; file: SubmissionFile }> {
    const s = await this.getBySlugOrThrow(submissionSlug);
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can generate documents',
        code: 'FORBIDDEN',
      });
    }
    if (
      options.attach &&
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message: 'Cannot replace manuscript in current status',
        code: 'VALIDATION_ERROR',
      });
    }
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(content);
    const profile = this.manuscriptStyles.getProfile(styleId);
    const buffer = await this.docxGeneratorService.generate(
      content,
      async (fileId) => {
        const file = await this.filesRepo.findOne({
          where: { id: fileId, submissionId: s.id },
        });
        if (!file) return null;
        const path = join(this.uploadRoot(), file.storageKey);
        try {
          const data = await readFile(path);
          return { data, mime: file.mimeType };
        } catch {
          return null;
        }
      },
      profile,
    );
    if (!options.attach) {
      return { kind: 'buffer', data: buffer };
    }
    const attachKind =
      options.attachKind === 'manuscript_constructor'
        ? 'manuscript_constructor'
        : 'manuscript';
    this.assertAuthorMayAddFile(s, user, attachKind);
    await this.replaceSubmissionFilesOfKind(s.id, attachKind);
    const fileName = `${s.slug ?? 'manuscript'}-constructor.docx`;
    const file = await this.persistSubmissionFile({
      submissionId: s.id,
      source: { type: 'buffer', buffer },
      originalName: fileName,
      kind: attachKind,
      sizeBytes: buffer.length,
    });
    return { kind: 'attached', file };
  }

  /**
   * Build a `.docx` directly from constructor content without requiring
   * a submission row. Used by the pre-submission constructor page when
   * the user only wants to download a Word file.
   */
  async generateDocxStandalone(content: ConstructorContent): Promise<Buffer> {
    const sanitized = sanitizeConstructorContent(content)!;
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(sanitized);
    const profile = this.manuscriptStyles.getProfile(styleId);
    return this.docxGeneratorService.generate(
      sanitized,
      async () => null,
      profile,
    );
  }

  async updateStatus(
    slug: string,
    user: RequestUser,
    next: SubmissionStatus,
    editorFolioLocale?: string,
  ): Promise<Submission> {
    if (!this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS)) {
      throw new ForbiddenException({
        message: 'Editor role required',
        code: 'FORBIDDEN',
      });
    }
    const s = await this.getBySlugOrThrow(slug);
    const allowed = EDITOR_TRANSITIONS[s.status];
    if (!allowed?.includes(next)) {
      throw new BadRequestException({
        message: `Cannot transition from ${s.status} to ${next}`,
        code: 'INVALID_STATUS_TRANSITION',
        fromStatus: s.status,
        toStatus: next,
      });
    }
    if (next === SubmissionStatus.UNDER_REVIEW) {
      await this.assertHasReviewManuscriptPackage(s.id);
    }
    const decisionKind = DECISION_STATUS_TO_KIND[next];

    const pending: Notification[] = [];
    return this.submissionsRepo.manager
      .transaction(async (em) => {
        const submissionRepo = em.getRepository(Submission);
        s.status = next;
        if (next === SubmissionStatus.PUBLISHED) {
          s.publishedAt = new Date();
          await em.getRepository(SubmissionFile).update(
            { submissionId: s.id, kind: 'manuscript' },
            { isPublic: true },
          );
        }
        const saved = await submissionRepo.save(s);
        if (decisionKind) {
          const n = await this.enqueueSubmissionDecisionEvent(
            {
              submission: saved,
              decision: decisionKind,
              editorId: user.sub,
              editorFolioLocale,
            },
            em,
          );
          if (n) pending.push(n);
        }
        return saved;
      })
      .then((saved) => {
        this.emitPendingNotifications(pending);
        return saved;
      });
  }

  private assertEditorMayConfigureReview(user: RequestUser): void {
    const ok =
      this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS) ||
      this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER);
    if (!ok) {
      throw new ForbiddenException({
        message: 'Editor permissions required',
        code: 'FORBIDDEN',
      });
    }
  }

  private assertSubmissionAllowsReviewConfiguration(
    submission: Submission,
  ): void {
    if (!REVIEW_CONFIGURATION_STATUSES.includes(submission.status)) {
      throw new BadRequestException({
        message:
          'Peer review can only be configured while the submission is submitted or under review',
        code: 'VALIDATION_ERROR',
      });
    }
  }

  async updateReviewMethod(
    slug: string,
    user: RequestUser,
    method: SubmissionReviewMethod,
  ): Promise<Submission> {
    this.assertEditorMayConfigureReview(user);
    const s = await this.getBySlugOrThrow(slug);
    this.assertSubmissionAllowsReviewConfiguration(s);
    s.reviewMethod = method;
    return this.submissionsRepo.save(s);
  }

  async updateSubmissionFileStage(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
    stage: SubmissionFileStage,
  ): Promise<SubmissionFile> {
    this.assertEditorMayConfigureReview(user);
    const s = await this.getBySlugOrThrow(submissionSlug);
    this.assertSubmissionAllowsReviewConfiguration(s);
    const file = await this.filesRepo.findOne({
      where: { id: fileId, submissionId: s.id },
    });
    if (!file) {
      throw new NotFoundException({
        message: 'File not found',
        code: 'NOT_FOUND',
      });
    }
    file.fileStage = stage;
    return this.filesRepo.save(file);
  }

  async assignReviewer(
    submissionSlug: string,
    reviewerId: string,
    editor: RequestUser,
    editorFolioLocale?: string,
  ): Promise<ReviewAssignment> {
    if (!this.hasPerm(editor, PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)) {
      throw new ForbiddenException({
        message: 'Editor role required',
        code: 'FORBIDDEN',
      });
    }
    const submission = await this.getBySlugOrThrow(submissionSlug);
    this.assertSubmissionAllowsReviewConfiguration(submission);
    if (!submission.slug) {
      throw new BadRequestException({
        message: 'Submission has no public slug',
        code: 'VALIDATION_ERROR',
      });
    }
    const submissionId = submission.id;
    const reviewer = await this.usersRepo.findOne({
      where: { id: reviewerId },
    });
    if (
      !reviewer ||
      !(await this.rbacService.userHasPermission(
        reviewerId,
        PERMISSION_SLUGS.REVIEW_SUBMIT,
      ))
    ) {
      throw new BadRequestException({
        message: 'User is not a reviewer',
        code: 'VALIDATION_ERROR',
      });
    }
    const activeDup = await this.assignmentsRepo.findOne({
      where: {
        submissionId,
        reviewerId,
        status: In([AssignmentStatus.INVITED, AssignmentStatus.ACCEPTED]),
      },
    });
    if (activeDup) {
      throw new BadRequestException({
        message: 'Reviewer already assigned',
        code: 'VALIDATION_ERROR',
      });
    }
    const assignmentSlug = await this.nextAssignmentSlug(submission.slug);

    const pending: Notification[] = [];
    return this.assignmentsRepo.manager
      .transaction(async (em) => {
        const assignmentRepo = em.getRepository(ReviewAssignment);
        const row = assignmentRepo.create({
          submissionId,
          reviewerId,
          status: AssignmentStatus.INVITED,
          slug: assignmentSlug,
        });
        const saved = await assignmentRepo.save(row);
        const n = await this.enqueueReviewerInvitedEvent(
          {
            assignment: saved,
            submission,
            reviewer,
            editorId: editor.sub,
            editorFolioLocale,
          },
          em,
        );
        if (n) pending.push(n);
        return saved;
      })
      .then((saved) => {
        this.emitPendingNotifications(pending);
        return saved;
      });
  }

  /**
   * Build the ReviewerInvitedEvent payload and insert the outbox row.
   * Must run inside the same DB transaction as the assignment insert
   * (pass transactional `EntityManager`).
   */
  private async enqueueReviewerInvitedEvent(
    args: {
      assignment: ReviewAssignment;
      submission: Submission;
      reviewer: User;
      editorId: string;
      editorFolioLocale?: string;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { assignment, submission, reviewer, editorId, editorFolioLocale } =
      args;
    if (!assignment.slug || !submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue reviewer invite: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const editorRow = await em.getRepository(User).findOne({
      where: { id: editorId },
      select: ['id', 'displayName'],
    });
    if (!editorRow) {
      throw new InternalServerErrorException({
        message: 'Editor account not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const baseUrl = (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: reviewer.preferredLocale,
      editorHeaderLocale: editorFolioLocale?.trim() || undefined,
      siteDefault,
    });
    const payload: ReviewerInvitedEvent = {
      type: 'ReviewerInvited',
      occurredAt: new Date().toISOString(),
      idempotencyKey: reviewerInvitedKey(assignment.slug),
      assignmentSlug: assignment.slug,
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
      emailLocale,
      reviewer: {
        id: reviewer.id,
        email: reviewer.email,
        displayName: reviewer.displayName,
      },
      invitedBy: {
        id: editorRow.id,
        displayName: editorRow.displayName,
      },
      acceptUrl: assignmentInvitePageUrl(
        baseUrl,
        assignment.slug,
        emailLocale,
      ),
      declineUrl: assignmentInvitePageUrl(
        baseUrl,
        assignment.slug,
        emailLocale,
      ),
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.reviewerInvited,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: reviewer.id,
        type: NOTIFICATION_TYPE.REVIEWER_INVITED,
        params: {
          submissionTitle: submission.title,
          submissionSlug: submission.slug,
        },
        href: '/assignments',
        idempotencyKey: reviewerInvitedKey(assignment.slug),
      },
      em,
    );
  }

  private async enqueueSubmissionSubmittedForEditors(
    args: {
      submission: Submission;
      isResubmission: boolean;
    },
    em: EntityManager,
  ): Promise<Notification[]> {
    const { submission, isResubmission } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue submission submitted: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const slug = submission.slug;
    const author = await em.getRepository(User).findOne({
      where: { id: submission.authorId },
      select: ['id', 'email', 'displayName'],
    });
    if (!author) {
      throw new InternalServerErrorException({
        message: 'Submission author not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const editorIds = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    );
    if (editorIds.length === 0) {
      this.logger.warn(
        `submission.submitted: no handling editors to notify for slug=${slug}`,
      );
      return [];
    }
    const editors = await em.getRepository(User).find({
      where: { id: In(editorIds) },
      select: ['id', 'email', 'displayName', 'preferredLocale'],
    });
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const editorQueueUrl = `${this.appBaseUrl()}/submissions/${slug}`;
    const occurredAt = new Date().toISOString();
    const outboxEvents = editors.map((editor) => {
      const emailLocale = resolveEmailLocale({
        recipientPreferred: editor.preferredLocale,
        siteDefault,
      });
      const payload: SubmissionSubmittedEvent = {
        type: 'SubmissionSubmitted',
        occurredAt,
        idempotencyKey: submissionSubmittedKey(slug, editor.id),
        submissionSlug: slug,
        submissionTitle: submission.title,
        isResubmission,
        emailLocale,
        author: {
          id: author.id,
          email: author.email,
          displayName: author.displayName,
        },
        editor: {
          id: editor.id,
          email: editor.email,
          displayName: editor.displayName,
        },
        editorQueueUrl,
      };
      return {
        routingKey: ROUTING_KEY.submissionSubmitted,
        payload: payload as unknown as Record<string, unknown>,
      };
    });
    await this.eventPublisher.enqueueMany(outboxEvents, em);
    return this.notifications.createManyIfAbsent(
      editors.map((editor) => ({
        userId: editor.id,
        type: NOTIFICATION_TYPE.SUBMISSION_SUBMITTED,
        params: {
          submissionTitle: submission.title,
          authorDisplayName: author.displayName,
          isResubmission: isResubmission ? 'true' : 'false',
        },
        href: `/submissions/${slug}`,
        idempotencyKey: submissionSubmittedKey(slug, editor.id),
      })),
      em,
    );
  }

  private async enqueueSubmissionDecisionEvent(
    args: {
      submission: Submission;
      decision: SubmissionDecisionKind;
      editorId: string;
      editorFolioLocale?: string;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { submission, decision, editorId, editorFolioLocale } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue submission decision: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const author = await em.getRepository(User).findOne({
      where: { id: submission.authorId },
      select: ['id', 'email', 'displayName', 'preferredLocale'],
    });
    if (!author) {
      throw new InternalServerErrorException({
        message: 'Submission author not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const editorRow = await em.getRepository(User).findOne({
      where: { id: editorId },
      select: ['id', 'displayName'],
    });
    if (!editorRow) {
      throw new InternalServerErrorException({
        message: 'Editor account not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: author.preferredLocale,
      editorHeaderLocale: editorFolioLocale?.trim() || undefined,
      siteDefault,
    });
    const payload: SubmissionDecisionEvent = {
      type: 'SubmissionDecision',
      occurredAt: new Date().toISOString(),
      idempotencyKey: submissionDecisionKey(submission.slug, decision),
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
      decision,
      emailLocale,
      author: {
        id: author.id,
        email: author.email,
        displayName: author.displayName,
      },
      decidedBy: {
        id: editorRow.id,
        displayName: editorRow.displayName,
      },
      submissionUrl: `${this.appBaseUrl()}/submissions/${submission.slug}`,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.submissionDecision,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: author.id,
        type: NOTIFICATION_TYPE.SUBMISSION_DECISION,
        params: {
          submissionTitle: submission.title,
          decision,
        },
        href: `/submissions/${submission.slug}`,
        idempotencyKey: submissionDecisionKey(submission.slug, decision),
      },
      em,
    );
  }

  private async notifyAllEditors(
    em: EntityManager,
    input: {
      type: (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];
      params: Record<string, unknown>;
      href: string;
      idempotencyKeyForEditor: (editorId: string) => string;
    },
  ): Promise<Notification[]> {
    const editorIds = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    );
    if (editorIds.length === 0) {
      return [];
    }
    return this.notifications.createManyIfAbsent(
      editorIds.map((editorId) => ({
        userId: editorId,
        type: input.type,
        params: input.params,
        href: input.href,
        idempotencyKey: input.idempotencyKeyForEditor(editorId),
      })),
      em,
    );
  }

  async acceptReviewInvitation(
    assignmentSlug: string,
    reviewerId: string,
  ): Promise<ReviewAssignment> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
      relations: ['submission', 'reviewer'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    if (assignment.status !== AssignmentStatus.INVITED) {
      throw new BadRequestException({
        message: 'Invitation is not pending',
        code: 'VALIDATION_ERROR',
      });
    }
    const reviewer = assignment.reviewer;
    const submissionRow =
      assignment.submission ??
      (await this.submissionsRepo.findOne({
        where: { id: assignment.submissionId },
      }));
    const pending: Notification[] = [];
    const saved = await this.assignmentsRepo.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(ReviewAssignment);
      assignment.status = AssignmentStatus.ACCEPTED;
      const row = await assignmentRepo.save(assignment);
      if (submissionRow?.status === SubmissionStatus.SUBMITTED) {
        await this.assertHasReviewManuscriptPackage(submissionRow.id);
        submissionRow.status = SubmissionStatus.UNDER_REVIEW;
        await em.getRepository(Submission).save(submissionRow);
      }
      if (submissionRow?.slug && assignment.slug && reviewer) {
        const created = await this.notifyAllEditors(em, {
          type: NOTIFICATION_TYPE.REVIEW_INVITATION_ACCEPTED,
          params: {
            submissionTitle: submissionRow.title,
            reviewerDisplayName: reviewer.displayName,
          },
          href: `/submissions/${submissionRow.slug}`,
          idempotencyKeyForEditor: (editorId) =>
            `${reviewInvitationAcceptedKey(assignment.slug!)}:${editorId}`,
        });
        pending.push(...created);
      }
      return row;
    });
    this.emitPendingNotifications(pending);
    return saved;
  }

  async declineReviewInvitation(
    assignmentSlug: string,
    reviewerId: string,
  ): Promise<ReviewAssignment> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
      relations: ['submission', 'reviewer'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    if (assignment.status !== AssignmentStatus.INVITED) {
      throw new BadRequestException({
        message: 'Invitation is not pending',
        code: 'VALIDATION_ERROR',
      });
    }
    const submissionRow = assignment.submission;
    const reviewer = assignment.reviewer;
    const pending: Notification[] = [];
    const saved = await this.assignmentsRepo.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(ReviewAssignment);
      assignment.status = AssignmentStatus.DECLINED;
      const row = await assignmentRepo.save(assignment);
      if (submissionRow?.slug && assignment.slug && reviewer) {
        const created = await this.notifyAllEditors(em, {
          type: NOTIFICATION_TYPE.REVIEW_INVITATION_DECLINED,
          params: {
            submissionTitle: submissionRow.title,
            reviewerDisplayName: reviewer.displayName,
          },
          href: `/submissions/${submissionRow.slug}`,
          idempotencyKeyForEditor: (editorId) =>
            `${reviewInvitationDeclinedKey(assignment.slug!)}:${editorId}`,
        });
        pending.push(...created);
      }
      return row;
    });
    this.emitPendingNotifications(pending);
    return saved;
  }

  async listAssignments(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<ReviewAssignment[]> {
    if (!this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS)) {
      throw new ForbiddenException({
        message: 'Editor role required',
        code: 'FORBIDDEN',
      });
    }
    const sub = await this.getBySlugOrThrow(submissionSlug);
    this.assertEditorQueueSubmissionVisible(sub);
    return this.assignmentsRepo.find({
      where: { submissionId: sub.id },
      relations: ['reviewer'],
    });
  }

  async listMyAssignments(
    reviewerId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.assignmentsRepo.find({
      where: { reviewerId },
      relations: ['submission', 'submission.files', 'submission.author'],
      order: { assignedAt: 'DESC' },
    });
    return rows.map((a) => {
      const sub = a.submission;
      const payload: Record<string, unknown> = {
        id: a.id,
        slug: a.slug,
        status: a.status,
        assignedAt: a.assignedAt,
      };
      if (sub) {
        payload.submission = submissionToViewerJson(sub, 'reviewer');
      }
      return payload;
    });
  }

  async listReviews(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Review[] | AuthorReviewPublicView[]> {
    const submission = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!submission) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.assertCanRead(submission, user);
    const submissionId = submission.id;
    const assignments = await this.assignmentsRepo.find({
      where: { submissionId },
      select: ['id', 'reviewerId'],
    });
    const ids = assignments.map((a) => a.id);
    if (ids.length === 0) {
      return [];
    }
    const editor = this.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const relations = editor
      ? (['assignment', 'assignment.reviewer'] as const)
      : (['assignment'] as const);
    const reviews = await this.reviewsRepo.find({
      where: { assignmentId: In(ids) },
      relations: [...relations],
    });

    if (editor) {
      return reviews;
    }

    if (submission.authorId === user.sub) {
      return reviews.map((r) => ({
        id: r.id,
        commentsForAuthor: r.commentsForAuthor,
        submittedAt: r.submittedAt,
      }));
    }

    return reviews.filter(
      (r) => r.assignment && r.assignment.reviewerId === user.sub,
    );
  }

  async submitReview(
    assignmentSlug: string,
    reviewerId: string,
    commentsForAuthor: string,
    commentsToEditorOnly: string,
    recommendation: ReviewRecommendation,
  ): Promise<Review> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
      relations: ['submission', 'reviewer'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    if (assignment.status !== AssignmentStatus.ACCEPTED) {
      throw new BadRequestException({
        message: 'Accept the review invitation before submitting',
        code: 'VALIDATION_ERROR',
      });
    }
    const authorPart = (commentsForAuthor ?? '').trim();
    const editorPart = (commentsToEditorOnly ?? '').trim();
    if (!authorPart && !editorPart) {
      throw new BadRequestException({
        message:
          'Provide comments for the author and/or confidential comments for the editor',
        code: 'VALIDATION_ERROR',
      });
    }
    const assignmentId = assignment.id;
    const existing = await this.reviewsRepo.findOne({
      where: { assignmentId },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'Review already submitted',
        code: 'VALIDATION_ERROR',
      });
    }
    const pending: Notification[] = [];
    const review = await this.assignmentsRepo.manager.transaction(async (em) => {
      const reviewRepo = em.getRepository(Review);
      const assignmentRepo = em.getRepository(ReviewAssignment);
      const row = reviewRepo.create({
        assignmentId,
        commentsForAuthor: authorPart,
        commentsToEditorOnly: editorPart,
        recommendation,
        submittedAt: new Date(),
      });
      await reviewRepo.save(row);
      assignment.status = AssignmentStatus.COMPLETED;
      await assignmentRepo.save(assignment);
      const submission = assignment.submission;
      const reviewer = await em.getRepository(User).findOne({
        where: { id: reviewerId },
        select: ['id', 'displayName'],
      });
      if (submission?.slug && assignment.slug && reviewer) {
        const created = await this.notifyAllEditors(em, {
          type: NOTIFICATION_TYPE.REVIEW_SUBMITTED,
          params: {
            submissionTitle: submission.title,
            reviewerDisplayName: reviewer.displayName,
          },
          href: `/submissions/${submission.slug}`,
          idempotencyKeyForEditor: (editorId) =>
            `${reviewSubmittedKey(assignment.slug!)}:${editorId}`,
        });
        pending.push(...created);
      }
      return row;
    });
    this.emitPendingNotifications(pending);
    return this.reviewsRepo.findOneOrFail({
      where: { assignmentId: review.assignmentId },
      relations: ['assignment'],
    });
  }

  async addFile(
    submissionSlug: string,
    user: RequestUser,
    file: Express.Multer.File,
    kindRaw?: string,
  ): Promise<SubmissionFile> {
    const s = await this.getBySlugOrThrow(submissionSlug);
    const kind = normalizeSubmissionFileKind(kindRaw);
    this.assertAuthorMayAddFile(s, user, kind);

    if (!isExtensionAllowedForKind(file.originalname, kind)) {
      await this.unlinkUploadTemp(file);
      throw new BadRequestException({
        message: `File type not allowed for ${kind}`,
        code: 'VALIDATION_ERROR',
      });
    }

    const tempPath = file.path;
    if (!tempPath) {
      throw new BadRequestException({
        message: 'Upload temp file missing',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      return await this.persistSubmissionFile({
        submissionId: s.id,
        source: { type: 'path', path: tempPath },
        originalName: file.originalname,
        kind,
        sizeBytes: file.size,
      });
    } catch (e) {
      await this.unlinkUploadTemp(file);
      throw e;
    }
  }

  async getFileForUser(
    submissionSlug: string,
    fileId: string,
    user: RequestUser | null,
  ): Promise<{ file: SubmissionFile; path: string }> {
    const subRow = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!subRow) {
      throw new NotFoundException({
        message: 'File not found',
        code: 'NOT_FOUND',
      });
    }
    const submissionId = subRow.id;
    const file = await this.filesRepo.findOne({
      where: { id: fileId, submissionId },
      relations: ['submission', 'submission.author'],
    });
    if (!file) {
      throw new NotFoundException({
        message: 'File not found',
        code: 'NOT_FOUND',
      });
    }
    const sub = file.submission;
    if (sub.status === SubmissionStatus.PUBLISHED && file.isPublic) {
      return { file, path: join(this.uploadRoot(), file.storageKey) };
    }
    if (!user) {
      throw new ForbiddenException({
        message: 'Authentication required',
        code: 'FORBIDDEN',
      });
    }
    await this.assertCanRead(sub, user);
    const isEditor = this.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const isAuthor = sub.authorId === user.sub;
    if (!isEditor && !isAuthor) {
      if (file.fileStage !== SubmissionFileStage.REVIEW) {
        throw new ForbiddenException({
          message: 'Reviewers may only access files in the review package',
          code: 'FORBIDDEN',
        });
      }
    }
    return { file, path: join(this.uploadRoot(), file.storageKey) };
  }

  async deleteFile(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
  ): Promise<void> {
    const s = await this.getBySlugOrThrow(submissionSlug);
    const submissionId = s.id;
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can delete files',
        code: 'FORBIDDEN',
      });
    }
    if (
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message: 'Cannot delete files in current status',
        code: 'VALIDATION_ERROR',
      });
    }
    const file = await this.filesRepo.findOne({
      where: { id: fileId, submissionId },
    });
    if (!file) {
      throw new NotFoundException({
        message: 'File not found',
        code: 'NOT_FOUND',
      });
    }
    const path = join(this.uploadRoot(), file.storageKey);
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
    await this.filesRepo.remove(file);
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
      discipline: s.discipline,
      publishedAt: s.publishedAt,
      author: s.author
        ? {
            displayName: s.author.displayName,
          }
        : undefined,
    };
  }

  private async nextCopyeditAssignmentSlug(submissionSlug: string): Promise<string> {
    for (let i = 0; i < 32; i++) {
      const suffix = randomBytes(4).toString('hex');
      const candidate = `ce-${submissionSlug}--${suffix}`;
      const taken = await this.copyeditAssignmentsRepo.exists({
        where: { slug: candidate },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException({
      message: 'Could not allocate copyedit assignment slug',
      code: 'VALIDATION_ERROR',
    });
  }

  private copyeditNoteCanBeSubmitted(status: CopyeditAssignmentStatus): boolean {
    return (
      status === CopyeditAssignmentStatus.ACTIVE ||
      status === CopyeditAssignmentStatus.READY_FOR_REVIEW
    );
  }

  private copyeditNoteToJson(
    n: CopyeditNote,
    assignment?: CopyeditAssignment,
    copyeditor?: User,
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {
      id: n.id,
      assignmentId: n.assignmentId,
      round: n.round,
      noteForAuthor: n.noteForAuthor,
      noteToEditorOnly: n.noteToEditorOnly,
      submittedAt: n.submittedAt,
    };
    if (assignment?.slug) row.assignmentSlug = assignment.slug;
    if (copyeditor) {
      row.copyeditor = {
        id: copyeditor.id,
        displayName: copyeditor.displayName,
        email: copyeditor.email,
      };
    }
    return row;
  }

  private async assertManuscriptRevisionAfterNote(
    submissionId: string,
    latestNote: CopyeditNote,
  ): Promise<void> {
    const ok = await this.filesRepo
      .createQueryBuilder('f')
      .where('f.submission_id = :submissionId', { submissionId })
      .andWhere('f.kind = :kind', { kind: 'manuscript' })
      .andWhere('f.createdAt > :since', { since: latestNote.submittedAt })
      .getExists();
    if (!ok) {
      throw new BadRequestException({
        message:
          'Upload a revised manuscript file after the latest copyedit request before marking ready',
        code: 'VALIDATION_ERROR',
      });
    }
  }

  private async enqueueCopyeditAssignedEvent(
    args: {
      assignment: CopyeditAssignment;
      submission: Submission;
      copyeditor: User;
      editorId: string;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { assignment, submission, copyeditor, editorId } = args;
    if (!assignment.slug || !submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue copyedit assign: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const editorRow = await em.getRepository(User).findOne({
      where: { id: editorId },
      select: ['id', 'displayName'],
    });
    if (!editorRow) {
      throw new InternalServerErrorException({
        message: 'Editor account not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: copyeditor.preferredLocale,
      siteDefault,
    });
    const payload: CopyeditAssignedEvent = {
      type: 'CopyeditAssigned',
      occurredAt: new Date().toISOString(),
      idempotencyKey: copyeditAssignedKey(assignment.slug),
      assignmentSlug: assignment.slug,
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
      emailLocale,
      copyeditor: {
        id: copyeditor.id,
        email: copyeditor.email,
        displayName: copyeditor.displayName,
      },
      assignedBy: {
        id: editorRow.id,
        displayName: editorRow.displayName,
      },
      workbenchUrl: `${this.appBaseUrl()}/copyedit-assignments/${assignment.slug}`,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.copyeditAssigned,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: copyeditor.id,
        type: NOTIFICATION_TYPE.COPYEDIT_ASSIGNED,
        params: { submissionTitle: submission.title },
        href: `/copyedit-assignments/${assignment.slug}`,
        idempotencyKey: copyeditAssignedKey(assignment.slug),
      },
      em,
    );
  }

  private async enqueueCopyeditQueriesSentEvent(
    args: {
      assignment: CopyeditAssignment;
      submission: Submission;
      author: User;
      copyeditor: User;
      note: CopyeditNote;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { assignment, submission, author, copyeditor, note } = args;
    if (!assignment.slug || !submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue copyedit queries: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: author.preferredLocale,
      siteDefault,
    });
    const payload: CopyeditQueriesSentEvent = {
      type: 'CopyeditQueriesSent',
      occurredAt: new Date().toISOString(),
      idempotencyKey: copyeditQueriesSentKey(assignment.slug, note.round),
      assignmentSlug: assignment.slug,
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
      round: note.round,
      emailLocale,
      author: {
        id: author.id,
        email: author.email,
        displayName: author.displayName,
      },
      copyeditor: {
        id: copyeditor.id,
        email: copyeditor.email,
        displayName: copyeditor.displayName,
      },
      submissionUrl: `${this.appBaseUrl()}/submissions/${submission.slug}`,
      noteExcerpt: truncateCopyeditNoteExcerpt(note.noteForAuthor),
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.copyeditQueriesSent,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: author.id,
        type: NOTIFICATION_TYPE.COPYEDIT_QUERIES_SENT,
        params: { submissionTitle: submission.title },
        href: `/submissions/${submission.slug}`,
        idempotencyKey: copyeditQueriesSentKey(assignment.slug, note.round),
      },
      em,
    );
  }

  private async enqueueCopyeditAuthorReadyEvent(
    args: {
      assignment: CopyeditAssignment;
      submission: Submission;
      author: User;
      copyeditor: User;
      round: number;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { assignment, submission, author, copyeditor, round } = args;
    if (!assignment.slug || !submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue copyedit author ready: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: copyeditor.preferredLocale,
      siteDefault,
    });
    const payload: CopyeditAuthorReadyEvent = {
      type: 'CopyeditAuthorReady',
      occurredAt: new Date().toISOString(),
      idempotencyKey: copyeditAuthorReadyKey(assignment.slug, round),
      assignmentSlug: assignment.slug,
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
      round,
      emailLocale,
      copyeditor: {
        id: copyeditor.id,
        email: copyeditor.email,
        displayName: copyeditor.displayName,
      },
      author: {
        id: author.id,
        email: author.email,
        displayName: author.displayName,
      },
      workbenchUrl: `${this.appBaseUrl()}/copyedit-assignments/${assignment.slug}`,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.copyeditAuthorReady,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: copyeditor.id,
        type: NOTIFICATION_TYPE.COPYEDIT_AUTHOR_READY,
        params: { submissionTitle: submission.title },
        href: `/copyedit-assignments/${assignment.slug}`,
        idempotencyKey: copyeditAuthorReadyKey(assignment.slug, round),
      },
      em,
    );
  }

  async assignCopyeditor(
    submissionSlug: string,
    copyeditorId: string,
    editor: RequestUser,
  ): Promise<CopyeditAssignment> {
    if (!this.hasPerm(editor, PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR)) {
      throw new ForbiddenException({
        message: 'Editor role required',
        code: 'FORBIDDEN',
      });
    }
    const submission = await this.getBySlugOrThrow(submissionSlug);
    if (
      submission.status !== SubmissionStatus.ACCEPTED &&
      submission.status !== SubmissionStatus.COPYEDITING
    ) {
      throw new BadRequestException({
        message:
          'Submission must be accepted (or already in copyediting) before assigning a copyeditor',
        code: 'VALIDATION_ERROR',
      });
    }
    if (
      !(await this.rbacService.userHasPermission(
        copyeditorId,
        PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE,
      ))
    ) {
      throw new BadRequestException({
        message: 'User does not have the copyeditor role',
        code: 'VALIDATION_ERROR',
      });
    }
    const existing = await this.copyeditAssignmentsRepo.findOne({
      where: { submissionId: submission.id, copyeditorId },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'Copyeditor already assigned to this submission',
        code: 'VALIDATION_ERROR',
      });
    }
    const copyeditor = await this.usersRepo.findOne({ where: { id: copyeditorId } });
    if (!copyeditor) {
      throw new BadRequestException({
        message: 'Copyeditor user not found',
        code: 'VALIDATION_ERROR',
      });
    }
    const slug = await this.nextCopyeditAssignmentSlug(submission.slug!);

    const pending: Notification[] = [];
    return this.copyeditAssignmentsRepo.manager
      .transaction(async (em) => {
        const assignmentRepo = em.getRepository(CopyeditAssignment);
        const assignment = assignmentRepo.create({
          submissionId: submission.id,
          copyeditorId,
          status: CopyeditAssignmentStatus.ACTIVE,
          slug,
        });
        const saved = await assignmentRepo.save(assignment);
        submission.status = SubmissionStatus.COPYEDITING;
        await em.getRepository(Submission).save(submission);
        const n = await this.enqueueCopyeditAssignedEvent(
          { assignment: saved, submission, copyeditor, editorId: editor.sub },
          em,
        );
        if (n) pending.push(n);
        return saved;
      })
      .then((saved) => {
        this.emitPendingNotifications(pending);
        return saved;
      });
  }

  async listCopyeditAssignments(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<CopyeditAssignment[]> {
    if (!this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)) {
      throw new ForbiddenException({
        message: 'Editor role required',
        code: 'FORBIDDEN',
      });
    }
    const sub = await this.getBySlugOrThrow(submissionSlug);
    this.assertEditorQueueSubmissionVisible(sub);
    return this.copyeditAssignmentsRepo.find({
      where: { submissionId: sub.id },
      relations: ['copyeditor', 'notes'],
      order: { assignedAt: 'ASC' },
    });
  }

  async listMyCopyeditAssignments(
    copyeditorId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.copyeditAssignmentsRepo.find({
      where: { copyeditorId },
      relations: [
        'submission',
        'submission.files',
        'submission.author',
        'notes',
        'copyeditor',
      ],
      order: { assignedAt: 'DESC' },
    });
    return rows.map((a) => {
      const sub = a.submission;
      const notes = [...(a.notes ?? [])].sort((x, y) => x.round - y.round);
      const payload: Record<string, unknown> = {
        id: a.id,
        slug: a.slug,
        status: a.status,
        assignedAt: a.assignedAt,
        notes: notes.map((n) => this.copyeditNoteToJson(n, a, a.copyeditor)),
      };
      if (sub) {
        payload.submission = submissionToViewerJson(sub, 'copyeditor');
      }
      return payload;
    });
  }

  async submitCopyeditNote(
    assignmentSlug: string,
    copyeditorId: string,
    noteForAuthor: string,
    noteToEditorOnly: string,
  ): Promise<CopyeditNote> {
    const assignment = await this.copyeditAssignmentsRepo.findOne({
      where: { slug: assignmentSlug, copyeditorId },
      relations: ['submission', 'submission.author'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    if (!this.copyeditNoteCanBeSubmitted(assignment.status)) {
      throw new BadRequestException({
        message:
          'Cannot submit queries while waiting for the author; mark ready first or start a new round after author responds',
        code: 'VALIDATION_ERROR',
      });
    }
    const submission = assignment.submission;
    if (!submission || submission.status !== SubmissionStatus.COPYEDITING) {
      throw new BadRequestException({
        message: 'Submission is not in copyediting',
        code: 'VALIDATION_ERROR',
      });
    }
    const authorPart = (noteForAuthor ?? '').trim();
    if (!authorPart) {
      throw new BadRequestException({
        message: 'Provide at least a note for the author',
        code: 'VALIDATION_ERROR',
      });
    }
    const author = submission.author;
    if (!author) {
      throw new InternalServerErrorException({
        message: 'Submission author not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const copyeditor = await this.usersRepo.findOne({ where: { id: copyeditorId } });
    if (!copyeditor) {
      throw new NotFoundException({
        message: 'Copyeditor not found',
        code: 'NOT_FOUND',
      });
    }

    const pending: Notification[] = [];
    return this.copyeditAssignmentsRepo.manager
      .transaction(async (em) => {
        const noteRepo = em.getRepository(CopyeditNote);
        const assignmentRepo = em.getRepository(CopyeditAssignment);
        const round =
          (await noteRepo.count({ where: { assignmentId: assignment.id } })) +
          1;
        const note = noteRepo.create({
          assignmentId: assignment.id,
          round,
          noteForAuthor: authorPart,
          noteToEditorOnly: (noteToEditorOnly ?? '').trim(),
          submittedAt: new Date(),
        });
        await noteRepo.save(note);
        assignment.status = CopyeditAssignmentStatus.AWAITING_AUTHOR;
        await assignmentRepo.save(assignment);
        const n = await this.enqueueCopyeditQueriesSentEvent(
          { assignment, submission, author, copyeditor, note },
          em,
        );
        if (n) pending.push(n);
        return noteRepo.findOneOrFail({
          where: { id: note.id },
          relations: ['assignment'],
        });
      })
      .then((note) => {
        this.emitPendingNotifications(pending);
        return note;
      });
  }

  async markCopyeditAuthorReady(
    assignmentSlug: string,
    authorId: string,
  ): Promise<CopyeditAssignment> {
    const assignment = await this.copyeditAssignmentsRepo.findOne({
      where: { slug: assignmentSlug },
      relations: ['submission', 'submission.author', 'notes'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    const submission = assignment.submission;
    if (!submission || submission.authorId !== authorId) {
      throw new ForbiddenException({
        message: 'Only the submission author can mark copyedit ready',
        code: 'FORBIDDEN',
      });
    }
    if (submission.status !== SubmissionStatus.COPYEDITING) {
      throw new BadRequestException({
        message: 'Submission is not in copyediting',
        code: 'VALIDATION_ERROR',
      });
    }
    if (assignment.status !== CopyeditAssignmentStatus.AWAITING_AUTHOR) {
      throw new BadRequestException({
        message: 'No pending copyedit requests for this assignment',
        code: 'VALIDATION_ERROR',
      });
    }
    const notes = [...(assignment.notes ?? [])].sort((a, b) => b.round - a.round);
    const latest = notes[0];
    if (!latest) {
      throw new BadRequestException({
        message: 'No copyedit requests to respond to',
        code: 'VALIDATION_ERROR',
      });
    }
    await this.assertManuscriptRevisionAfterNote(submission.id, latest);

    const author = submission.author!;
    const copyeditor = await this.usersRepo.findOne({
      where: { id: assignment.copyeditorId },
    });
    if (!copyeditor) {
      throw new InternalServerErrorException({
        message: 'Copyeditor not found',
        code: 'INTERNAL_ERROR',
      });
    }

    const pending: Notification[] = [];
    return this.copyeditAssignmentsRepo.manager
      .transaction(async (em) => {
        const assignmentRepo = em.getRepository(CopyeditAssignment);
        assignment.status = CopyeditAssignmentStatus.READY_FOR_REVIEW;
        const saved = await assignmentRepo.save(assignment);
        const n = await this.enqueueCopyeditAuthorReadyEvent(
          {
            assignment: saved,
            submission,
            author,
            copyeditor,
            round: latest.round,
          },
          em,
        );
        if (n) pending.push(n);
        return saved;
      })
      .then((saved) => {
        this.emitPendingNotifications(pending);
        return saved;
      });
  }

  async listCopyeditNotes(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
    const submission = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!submission) {
      throw new NotFoundException({ message: 'Submission not found', code: 'NOT_FOUND' });
    }
    await this.assertCanRead(submission, user);
    const assignments = await this.copyeditAssignmentsRepo.find({
      where: { submissionId: submission.id },
      relations: ['copyeditor', 'notes'],
    });
    if (assignments.length === 0) return [];

    const isEditor = this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE);
    const rows: Array<Record<string, unknown>> = [];

    for (const a of assignments) {
      const sorted = [...(a.notes ?? [])].sort((x, y) => y.round - x.round);
      for (const n of sorted) {
        if (isEditor) {
          rows.push(this.copyeditNoteToJson(n, a, a.copyeditor));
          continue;
        }
        if (submission.authorId === user.sub) {
          rows.push({
            id: n.id,
            assignmentId: n.assignmentId,
            assignmentSlug: a.slug,
            round: n.round,
            noteForAuthor: n.noteForAuthor,
            submittedAt: n.submittedAt,
            assignmentStatus: a.status,
            copyeditor: a.copyeditor
              ? {
                  id: a.copyeditor.id,
                  displayName: a.copyeditor.displayName,
                }
              : undefined,
          });
          continue;
        }
        if (a.copyeditorId === user.sub) {
          rows.push(this.copyeditNoteToJson(n, a, a.copyeditor));
        }
      }
    }

    rows.sort((x, y) => {
      const ta = new Date(String(x.submittedAt)).getTime();
      const tb = new Date(String(y.submittedAt)).getTime();
      return tb - ta;
    });
    return rows;
  }

  async publishSubmission(
    slug: string,
    user: RequestUser,
  ): Promise<Submission> {
    if (!this.hasPerm(user, PERMISSION_SLUGS.COPYEDIT_PUBLISH)) {
      throw new ForbiddenException({
        message: 'Copyeditor role required',
        code: 'FORBIDDEN',
      });
    }
    const s = await this.getBySlugOrThrow(slug);
    if (s.status !== SubmissionStatus.COPYEDITING) {
      throw new BadRequestException({
        message: 'Submission must be in copyediting stage to publish',
        code: 'VALIDATION_ERROR',
      });
    }
    const assignments = await this.copyeditAssignmentsRepo.find({
      where: { submissionId: s.id },
    });
    if (assignments.length === 0) {
      throw new BadRequestException({
        message: 'No copyedit assignments on this submission',
        code: 'VALIDATION_ERROR',
      });
    }
    const mine = assignments.some((a) => a.copyeditorId === user.sub);
    if (!mine) {
      throw new ForbiddenException({
        message: 'You are not assigned as copyeditor on this submission',
        code: 'FORBIDDEN',
      });
    }
    const blocking = assignments.find(
      (a) => a.status !== CopyeditAssignmentStatus.READY_FOR_REVIEW,
    );
    if (blocking) {
      throw new BadRequestException({
        message:
          'All copyedit assignments must be ready for review before publishing',
        code: 'VALIDATION_ERROR',
      });
    }
    s.status = SubmissionStatus.PUBLISHED;
    s.publishedAt = new Date();
    await this.filesRepo.update(
      { submissionId: s.id, kind: 'manuscript' },
      { isPublic: true },
    );
    const saved = await this.submissionsRepo.save(s);
    void this.indexPublishedSubmissionForSimilarity(saved).catch((err) => {
      this.logger.warn(
        'Failed to index publication for similarity: %s',
        err instanceof Error ? err.message : String(err),
      );
    });
    return saved;
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
      a.slug = await this.nextAssignmentSlug(sub.slug);
      await this.assignmentsRepo.save(a);
    }
  }
}
