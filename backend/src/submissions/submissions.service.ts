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
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { Readable } from 'stream';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { ContributorDto } from './dto/contributor.dto';
import { slugifySubmissionTitle } from './slugify-submission-title';
import { normalizeSubmissionFileKind } from './submission-file-kinds';
import type { SubmissionContributorJson } from './submission-json.types';
import type {
  ConstructorContent,
  ConstructorValidationError,
} from './constructor-content.types';
import {
  diffOrphanedFileIds,
  validateConstructorContentForSubmit,
} from './constructor-content-utils';
import { DocxGeneratorService } from './docx-generator.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { readFile } from 'fs/promises';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { submissionToViewerJson } from './submission-response.mapper';
import type { SubmissionViewerRole } from './submission-viewer-role';
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
    private readonly config: ConfigService,
  ) {}

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
    const ok = await this.filesRepo.exists({
      where: {
        submissionId,
        kind: 'manuscript',
        fileStage: SubmissionFileStage.REVIEW,
      },
    });
    if (!ok) {
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
  private async assertReadyForSubmit(s: Submission): Promise<void> {
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
    const need: { kind: string; label: string }[] = [
      { kind: 'cover_letter', label: 'cover letter' },
      { kind: 'title_page', label: 'title page' },
      { kind: 'manuscript', label: 'main manuscript' },
    ];
    for (const { kind, label } of need) {
      if (!kinds.has(kind)) {
        throw new BadRequestException({
          message: `Upload at least one file of type: ${label}`,
          code: 'SUBMISSION_INCOMPLETE_FILES',
        });
      }
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
    return validateConstructorContentForSubmit(content);
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

  async findPublishedList(): Promise<Submission[]> {
    return this.submissionsRepo.find({
      where: { status: SubmissionStatus.PUBLISHED },
      order: { publishedAt: 'DESC' },
      relations: ['author'],
    });
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

  async assertCanRead(
    submission: Submission,
    user: RequestUser,
  ): Promise<void> {
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)) {
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
      const newContent = (dto.constructorContent as ConstructorContent | null) ?? null;
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

  async submit(slug: string, user: RequestUser): Promise<Submission> {
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
    if (s.constructorContent) {
      this.manuscriptStyles.assertConstructorContentStyleKnown(s.constructorContent);
      const errors = validateConstructorContentForSubmit(s.constructorContent);
      if (errors.length > 0) {
        throw new BadRequestException({
          message:
            'Constructor content is incomplete; please address the listed issues',
          code: 'CONSTRUCTOR_VALIDATION_FAILED',
          errors,
        });
      }
    }
    await this.assertReadyForSubmit(s);
    const previousStatus = s.status;
    const isResubmission = previousStatus === SubmissionStatus.REVISIONS_REQUESTED;

    return this.submissionsRepo.manager.transaction(async (em) => {
      const submissionRepo = em.getRepository(Submission);
      s.status = SubmissionStatus.SUBMITTED;
      const saved = await submissionRepo.save(s);
      await this.enqueueSubmissionSubmittedForEditors(
        {
          submission: saved,
          isResubmission,
        },
        em,
      );
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
    options: { attach?: boolean } = {},
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
    // Replace any existing manuscript file
    const existing = await this.filesRepo.find({
      where: { submissionId: s.id, kind: 'manuscript' },
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
    const fileName = `${s.slug ?? 'manuscript'}-constructor.docx`;
    const fakeFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
      size: buffer.length,
      destination: '',
      filename: fileName,
      path: '',
      stream: Readable.from(buffer),
    };
    const file = await this.addFile(submissionSlug, user, fakeFile, 'manuscript');
    return { kind: 'attached', file };
  }

  /**
   * Build a `.docx` directly from constructor content without requiring
   * a submission row. Used by the pre-submission constructor page when
   * the user only wants to download a Word file.
   */
  async generateDocxStandalone(content: ConstructorContent): Promise<Buffer> {
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(content);
    const profile = this.manuscriptStyles.getProfile(styleId);
    return this.docxGeneratorService.generate(content, async () => null, profile);
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
        code: 'VALIDATION_ERROR',
      });
    }
    if (next === SubmissionStatus.UNDER_REVIEW) {
      await this.assertHasReviewManuscriptPackage(s.id);
    }
    const decisionKind = DECISION_STATUS_TO_KIND[next];

    return this.submissionsRepo.manager.transaction(async (em) => {
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
        await this.enqueueSubmissionDecisionEvent(
          {
            submission: saved,
            decision: decisionKind,
            editorId: user.sub,
            editorFolioLocale,
          },
          em,
        );
      }
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

  async updateReviewMethod(
    slug: string,
    user: RequestUser,
    method: SubmissionReviewMethod,
  ): Promise<Submission> {
    this.assertEditorMayConfigureReview(user);
    const s = await this.getBySlugOrThrow(slug);
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

    return this.assignmentsRepo.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(ReviewAssignment);
      const row = assignmentRepo.create({
        submissionId,
        reviewerId,
        status: AssignmentStatus.INVITED,
        slug: assignmentSlug,
      });
      const saved = await assignmentRepo.save(row);
      await this.enqueueReviewerInvitedEvent(
        {
          assignment: saved,
          submission,
          reviewer,
          editorId: editor.sub,
          editorFolioLocale,
        },
        em,
      );
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
  ): Promise<void> {
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
      acceptUrl: `${baseUrl}/assignments/${assignment.slug}/accept`,
      declineUrl: `${baseUrl}/assignments/${assignment.slug}/decline`,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.reviewerInvited,
      payload as unknown as Record<string, unknown>,
      em,
    );
  }

  private async enqueueSubmissionSubmittedForEditors(
    args: {
      submission: Submission;
      isResubmission: boolean;
    },
    em: EntityManager,
  ): Promise<void> {
    const { submission, isResubmission } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue submission submitted: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
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
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    if (editorIds.length === 0) {
      this.logger.warn(
        `submission.submitted: no editors to notify for slug=${submission.slug}`,
      );
      return;
    }
    const editors = await em.getRepository(User).find({
      where: { id: In(editorIds) },
      select: ['id', 'email', 'displayName', 'preferredLocale'],
    });
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const editorQueueUrl = `${this.appBaseUrl()}/submissions/${submission.slug}`;
    const occurredAt = new Date().toISOString();
    for (const editor of editors) {
      const emailLocale = resolveEmailLocale({
        recipientPreferred: editor.preferredLocale,
        siteDefault,
      });
      const payload: SubmissionSubmittedEvent = {
        type: 'SubmissionSubmitted',
        occurredAt,
        idempotencyKey: submissionSubmittedKey(submission.slug, editor.id),
        submissionSlug: submission.slug,
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
      await this.eventPublisher.enqueue(
        ROUTING_KEY.submissionSubmitted,
        payload as unknown as Record<string, unknown>,
        em,
      );
    }
  }

  private async enqueueSubmissionDecisionEvent(
    args: {
      submission: Submission;
      decision: SubmissionDecisionKind;
      editorId: string;
      editorFolioLocale?: string;
    },
    em: EntityManager,
  ): Promise<void> {
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
  }

  async acceptReviewInvitation(
    assignmentSlug: string,
    reviewerId: string,
  ): Promise<ReviewAssignment> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
      relations: ['submission'],
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
    assignment.status = AssignmentStatus.ACCEPTED;
    await this.assignmentsRepo.save(assignment);
    const submissionRow =
      assignment.submission ??
      (await this.submissionsRepo.findOne({
        where: { id: assignment.submissionId },
      }));
    if (submissionRow?.status === SubmissionStatus.SUBMITTED) {
      await this.assertHasReviewManuscriptPackage(submissionRow.id);
      submissionRow.status = SubmissionStatus.UNDER_REVIEW;
      await this.submissionsRepo.save(submissionRow);
    }
    return assignment;
  }

  async declineReviewInvitation(
    assignmentSlug: string,
    reviewerId: string,
  ): Promise<ReviewAssignment> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
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
    assignment.status = AssignmentStatus.DECLINED;
    await this.assignmentsRepo.save(assignment);
    return assignment;
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
      relations: ['submission'],
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
    const review = this.reviewsRepo.create({
      assignmentId,
      commentsForAuthor: authorPart,
      commentsToEditorOnly: editorPart,
      recommendation,
      submittedAt: new Date(),
    });
    await this.reviewsRepo.save(review);
    assignment.status = AssignmentStatus.COMPLETED;
    await this.assignmentsRepo.save(assignment);
    return this.reviewsRepo.findOneOrFail({
      where: { assignmentId },
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
    const submissionId = s.id;
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can upload files',
        code: 'FORBIDDEN',
      });
    }
    const canUpload =
      s.status === SubmissionStatus.DRAFT ||
      s.status === SubmissionStatus.REVISIONS_REQUESTED ||
      s.status === SubmissionStatus.COPYEDITING;
    if (!canUpload) {
      throw new BadRequestException({
        message: 'Cannot upload in current status',
        code: 'VALIDATION_ERROR',
      });
    }
    if (s.status === SubmissionStatus.COPYEDITING) {
      const kind = normalizeSubmissionFileKind(kindRaw);
      if (kind !== 'manuscript') {
        throw new BadRequestException({
          message: 'During copyediting only manuscript revisions may be uploaded',
          code: 'VALIDATION_ERROR',
        });
      }
    }
    const dir = this.ensureUploadDir();
    const storageKey = `${randomUUID()}${extname(file.originalname)}`;
    const fs = await import('fs/promises');
    await fs.writeFile(join(dir, storageKey), file.buffer);
    const kind = normalizeSubmissionFileKind(kindRaw);
    const row = this.filesRepo.create({
      submissionId,
      storageKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: String(file.size),
      kind,
      fileStage: SubmissionFileStage.SUBMISSION,
      isPublic: false,
    });
    return this.filesRepo.save(row);
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
      constructorContent: s.constructorContent,
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
      publishedAt: s.publishedAt,
      author: s.author
        ? {
            displayName: s.author.displayName,
            email: s.author.email,
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
  ): Promise<void> {
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
  ): Promise<void> {
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
  ): Promise<void> {
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

    return this.copyeditAssignmentsRepo.manager.transaction(async (em) => {
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
      await this.enqueueCopyeditAssignedEvent(
        { assignment: saved, submission, copyeditor, editorId: editor.sub },
        em,
      );
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

    return this.copyeditAssignmentsRepo.manager.transaction(async (em) => {
      const noteRepo = em.getRepository(CopyeditNote);
      const assignmentRepo = em.getRepository(CopyeditAssignment);
      const round =
        (await noteRepo.count({ where: { assignmentId: assignment.id } })) + 1;
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
      await this.enqueueCopyeditQueriesSentEvent(
        { assignment, submission, author, copyeditor, note },
        em,
      );
      return noteRepo.findOneOrFail({
        where: { id: note.id },
        relations: ['assignment'],
      });
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

    return this.copyeditAssignmentsRepo.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(CopyeditAssignment);
      assignment.status = CopyeditAssignmentStatus.READY_FOR_REVIEW;
      const saved = await assignmentRepo.save(assignment);
      await this.enqueueCopyeditAuthorReadyEvent(
        {
          assignment: saved,
          submission,
          author,
          copyeditor,
          round: latest.round,
        },
        em,
      );
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
    return this.submissionsRepo.save(s);
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
