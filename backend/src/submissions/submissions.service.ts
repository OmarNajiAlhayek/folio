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
import type { ReviewerInvitedEvent } from '../messaging/contracts/email-events';
import { reviewerInvitedKey } from '../messaging/shared/idempotency';
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
import type { AuthorReviewPublicView } from '../reviews/author-review-public.view';
import { User } from '../entities/user.entity';
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
  [SubmissionStatus.ACCEPTED]: [SubmissionStatus.PUBLISHED],
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
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly rbacService: RbacService,
    private readonly docxGeneratorService: DocxGeneratorService,
    private readonly eventPublisher: EventPublisherService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyAssignmentStatus();
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

  /** Journal guideline: each abstract at most 300 words (style.md). */
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
      relations: ['files', 'author', 'reviewAssignments', 'reviewAssignments.reviewer'],
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
    s.status = SubmissionStatus.SUBMITTED;
    return this.submissionsRepo.save(s);
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
    return this.docxGeneratorService.generate(content, async () => null);
  }

  async updateStatus(
    slug: string,
    user: RequestUser,
    next: SubmissionStatus,
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
    s.status = next;
    if (next === SubmissionStatus.PUBLISHED) {
      s.publishedAt = new Date();
      await this.filesRepo.update(
        { submissionId: s.id, kind: 'manuscript' },
        { isPublic: true },
      );
    }
    return this.submissionsRepo.save(s);
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
    },
    em: EntityManager,
  ): Promise<void> {
    const { assignment, submission, reviewer, editorId } = args;
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
    const payload: ReviewerInvitedEvent = {
      type: 'ReviewerInvited',
      occurredAt: new Date().toISOString(),
      idempotencyKey: reviewerInvitedKey(assignment.slug),
      assignmentSlug: assignment.slug,
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
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
    if (
      s.status !== SubmissionStatus.DRAFT &&
      s.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message: 'Cannot upload in current status',
        code: 'VALIDATION_ERROR',
      });
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
