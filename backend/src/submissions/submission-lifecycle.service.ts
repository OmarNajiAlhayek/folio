import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import { Notification } from '../entities/notification.entity';
import type { RequestUser } from '../common/types/request-user';
import { assertCallerPermission } from '../common/authorization/permission-checks';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { ContributorDto } from './dto/contributor.dto';
import { slugifySubmissionTitle } from './slugify-submission-title';
import type { SubmissionFileKind } from './submission-file-kinds';
import {
  resolveSubmitPresentation,
  type ReviewManuscriptPresentation,
} from './review-manuscript-presentation.types';
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
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { sanitizeConstructorContent } from './sanitize-constructor-html';
import {
  countJournalSelfCitations,
  extractConstructorReferenceTexts,
} from './journal-self-citation.util';
import { AiClientService } from '../ai/ai-client.service';
import { JournalDirectoryService } from '../journals/journal-directory.service';
import { SubmissionAccessService } from './submission-access.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { SubmissionAiService } from './submission-ai.service';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';
import { setPublishedManuscriptFile } from './publish-public-files';
import { claimStatusTransition } from './claim-status-transition';
import {
  DECISION_STATUS_TO_KIND,
  EDITOR_TRANSITIONS,
  resolveDetailedDecisionKind,
  type RevisionSeverity,
} from './submission-workflow.constants';

export type UpdateStatusOptions = {
  /** Required when moving to `revisions_requested`, rejected otherwise. */
  revisionSeverity?: RevisionSeverity;
  /** Reviewer `review_response` files to release to the author with this decision. */
  releaseReviewFileIds?: string[];
};

@Injectable()
export class SubmissionLifecycleService {
  private static readonly ABSTRACT_MAX_WORDS = 300;
  private readonly logger = new Logger(SubmissionLifecycleService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(SubmissionFile)
    private readonly filesRepo: Repository<SubmissionFile>,
    private readonly rbacService: RbacService,
    private readonly docxGeneratorService: DocxGeneratorService,
    private readonly manuscriptStyles: ManuscriptStyleRegistryService,
    private readonly aiClient: AiClientService,
    private readonly access: SubmissionAccessService,
    private readonly files: SubmissionFileService,
    private readonly events: SubmissionEventsService,
    private readonly ai: SubmissionAiService,
    private readonly preSubmitAnalysis: PreSubmitAnalysisService,
    private readonly journals: JournalDirectoryService,
  ) {}

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

  private countWords(s: string): number {
    const t = s.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  private assertAbstractWordLimits(english: string, arabic: string): void {
    const max = SubmissionLifecycleService.ABSTRACT_MAX_WORDS;
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

  private async assertJournalSelfCitations(
    content: ConstructorContent,
  ): Promise<void> {
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(content);
    const profile = this.manuscriptStyles.getProfile(styleId);
    const minCitations = profile.minJournalSelfCitations ?? 0;
    if (minCitations <= 0) return;

    const refTexts = extractConstructorReferenceTexts(content);
    if (refTexts.length === 0) return;

    const publishedRows = await this.submissionsRepo
      .createQueryBuilder('s')
      .select(['s.title', 's.titleAr'])
      .where('s.status = :status', { status: SubmissionStatus.PUBLISHED })
      .getMany();

    const publishedTitles = publishedRows.flatMap((r) =>
      [r.title, r.titleAr ?? ''].filter(Boolean),
    );

    const found = countJournalSelfCitations(refTexts, publishedTitles);
    if (found < minCitations) {
      throw new BadRequestException({
        message: `Your submission must cite at least ${minCitations} article(s) previously published in this journal (found ${found}).`,
        code: 'SUBMISSION_INSUFFICIENT_JOURNAL_SELF_CITATIONS',
        required: minCitations,
        found,
      });
    }
  }

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
    if (kw.length !== 5) {
      throw new BadRequestException({
        message:
          'Provide exactly 5 English keywords, separated by commas or semicolons',
        code: 'SUBMISSION_INCOMPLETE_KEYWORDS',
      });
    }
    const kwAr = this.parseKeywordList(s.keywordsAr);
    if (kwAr.length !== 5) {
      throw new BadRequestException({
        message:
          'Provide exactly 5 Arabic keywords, separated by commas or semicolons',
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

    if (
      presentation.presentUploaded &&
      s.docxManuscriptViolations &&
      s.docxManuscriptViolations.length > 0
    ) {
      const messages = s.docxManuscriptViolations
        .map((v) => v.message)
        .join('; ');
      throw new BadRequestException({
        message: `Uploaded manuscript does not meet formatting requirements: ${messages}`,
        code: 'DOCX_FORMAT_VIOLATIONS',
        violations: s.docxManuscriptViolations,
      });
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

  validateConstructorContentForSubmit(
    content: ConstructorContent | null | undefined,
  ): ConstructorValidationError[] {
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(content);
    const profile = this.manuscriptStyles.getProfile(styleId);
    return validateConstructorContentForSubmit(content, profile.constructor);
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

  async create(
    authorId: string,
    dto: CreateSubmissionDto,
  ): Promise<Submission> {
    this.assertAbstractWordLimits(dto.abstract, dto.abstractAr ?? '');
    // Reject a retired or unknown journal here so the author sees a validation
    // error, not the foreign key's 500.
    await this.journals.assertSubmittableJournal(dto.journalId);
    const slug = slugifySubmissionTitle(dto.title);
    await this.assertSubmissionSlugAvailable(slug);
    const s = this.submissionsRepo.create({
      authorId,
      journalId: dto.journalId,
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

  async update(
    slug: string,
    user: RequestUser,
    dto: UpdateSubmissionDto,
  ): Promise<Submission> {
    const s = await this.access.getBySlugOrThrow(slug);
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
    if (dto.journalId !== undefined && dto.journalId !== s.journalId) {
      await this.journals.assertSubmittableJournal(dto.journalId);
      s.journalId = dto.journalId;
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
        unlinkSync(join(this.files.uploadRoot(), row.storageKey));
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
      authorResponseToReviewers?: string;
    },
  ): Promise<Submission> {
    const s = await this.access.getBySlugOrThrow(slug);
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
        message:
          'Upload a main manuscript file before submitting with that option',
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
      await this.assertJournalSelfCitations(contentForDoc);
    }
    this.preSubmitAnalysis.assertReadyForPreSubmit(
      s,
      sanitizeConstructorContent(s.constructorContent ?? null),
      presentation,
    );
    await this.assertReadyForSubmit(s, presentation);
    await this.applyReviewManuscriptPresentation(s.id, presentation);
    s.reviewManuscriptPresentation = presentation;
    if (this.aiClient.isEnabled()) {
      try {
        await this.ai.refreshDisciplineSuggestion(s);
      } catch (err) {
        this.logger.warn(
          'Discipline classification on submit failed for %s: %s',
          slug,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    const previousStatus = s.status;
    const isResubmission =
      previousStatus === SubmissionStatus.REVISIONS_REQUESTED;
    if (isResubmission) {
      s.authorResponseToReviewers =
        options?.authorResponseToReviewers?.trim() || null;
    }
    await this.submissionsRepo.save(s);
    const editorIds =
      await this.rbacService.listWorkflowNotificationRecipientIds();

    const pending: Notification[] = [];
    return this.submissionsRepo.manager
      .transaction(async (em) => {
        const submissionRepo = em.getRepository(Submission);
        // Guards a double-submit: the second request finds the status already
        // moved and is rejected instead of notifying every editor twice.
        await claimStatusTransition(
          em,
          s.id,
          previousStatus,
          SubmissionStatus.SUBMITTED,
        );
        s.status = SubmissionStatus.SUBMITTED;
        const saved = await submissionRepo.save(s);
        const created = await this.events.enqueueSubmissionSubmittedForEditors(
          {
            submission: saved,
            isResubmission,
            editorIds,
          },
          em,
        );
        pending.push(...created);
        return saved;
      })
      .then((saved) => {
        this.events.emitPendingNotifications(pending);
        return saved;
      });
  }

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
    const s = await this.access.getBySlugOrThrow(submissionSlug);
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
        const path = join(this.files.uploadRoot(), file.storageKey);
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
    this.files.assertAuthorMayAddFile(s, user, attachKind);
    await this.files.replaceSubmissionFilesOfKind(s.id, attachKind);
    const fileName = `${s.slug ?? 'manuscript'}-constructor.docx`;
    const file = await this.files.persistSubmissionFile({
      submissionId: s.id,
      source: { type: 'buffer', buffer },
      originalName: fileName,
      kind: attachKind,
      sizeBytes: buffer.length,
    });
    return { kind: 'attached', file };
  }

  async generateDocxStandalone(content: ConstructorContent): Promise<Buffer> {
    const sanitized = sanitizeConstructorContent(content)!;
    const styleId = this.manuscriptStyles.resolveEffectiveStyleId(sanitized);
    const profile = this.manuscriptStyles.getProfile(styleId);
    return this.docxGeneratorService.generate(
      sanitized,
      () => Promise.resolve(null),
      profile,
    );
  }

  async updateStatus(
    slug: string,
    user: RequestUser,
    next: SubmissionStatus,
    editorFolioLocale?: string,
    messageForAuthorInput?: string,
    options?: UpdateStatusOptions,
  ): Promise<Submission> {
    assertCallerPermission(
      user,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      'Editor role required',
    );
    const s = await this.access.getBySlugOrThrow(slug);
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
      await this.files.assertHasReviewManuscriptPackage(s.id);
    }
    const decisionKind = DECISION_STATUS_TO_KIND[next];
    const trimmedMessage = (messageForAuthorInput ?? '').trim();
    if (!decisionKind && trimmedMessage) {
      throw new BadRequestException({
        message:
          'messageForAuthor is only allowed when setting accepted, rejected, or revisions_requested',
        code: 'VALIDATION_ERROR',
      });
    }
    const revisionSeverity = options?.revisionSeverity;
    const isRevisionDecision = next === SubmissionStatus.REVISIONS_REQUESTED;
    if (isRevisionDecision && !revisionSeverity) {
      throw new BadRequestException({
        message:
          'revisionSeverity (minor or major) is required when requesting revisions',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!isRevisionDecision && revisionSeverity) {
      throw new BadRequestException({
        message:
          'revisionSeverity is only allowed when setting revisions_requested',
        code: 'VALIDATION_ERROR',
      });
    }
    const releaseReviewFileIds = options?.releaseReviewFileIds ?? [];
    if (releaseReviewFileIds.length > 0 && !decisionKind) {
      throw new BadRequestException({
        message:
          'releaseReviewFileIds is only allowed when setting accepted, rejected, or revisions_requested',
        code: 'VALIDATION_ERROR',
      });
    }
    const previousStatus = s.status;
    const submittedCycleAt =
      next === SubmissionStatus.UNDER_REVIEW &&
      previousStatus === SubmissionStatus.SUBMITTED
        ? s.updatedAt
        : null;
    const detailedDecisionKind = decisionKind
      ? resolveDetailedDecisionKind(previousStatus, next)
      : null;

    const pending: Notification[] = [];
    return this.submissionsRepo.manager
      .transaction(async (em) => {
        const submissionRepo = em.getRepository(Submission);
        // Claim the transition before anything observable happens. Two editors
        // deciding at once must not both send the author a decision letter.
        await claimStatusTransition(em, s.id, previousStatus, next);
        s.status = next;
        if (decisionKind) {
          s.messageForAuthor = trimmedMessage || null;
          s.lastDecisionKind = detailedDecisionKind;
          if (isRevisionDecision) {
            s.revisionSeverity = revisionSeverity ?? null;
            s.revisionRound = (s.revisionRound ?? 0) + 1;
          } else {
            // Accept/reject ends the revision cycle; the round is kept as history.
            s.revisionSeverity = null;
          }
        }
        if (next === SubmissionStatus.PUBLISHED) {
          s.publishedAt = new Date();
          // Same single-file rule as the copyedit publish path. Unreachable via
          // EDITOR_TRANSITIONS today, but kept correct so it cannot regress if
          // a direct publish transition is ever added.
          await setPublishedManuscriptFile(em, s.id);
        }
        const saved = await submissionRepo.save(s);
        let releasedReviewFileCount = 0;
        if (releaseReviewFileIds.length > 0) {
          // Ids that do not resolve to a reviewer file on this submission are
          // ignored rather than failing the decision.
          const result = await em.getRepository(SubmissionFile).update(
            {
              id: In(releaseReviewFileIds),
              submissionId: saved.id,
              kind: 'review_response',
            },
            { releasedToAuthorAt: new Date(), releasedById: user.sub },
          );
          releasedReviewFileCount = result.affected ?? 0;
        }
        if (decisionKind) {
          const n = await this.events.enqueueSubmissionDecisionEvent(
            {
              submission: saved,
              decision: decisionKind,
              editorId: user.sub,
              editorFolioLocale,
              messageForAuthor: saved.messageForAuthor,
              isDeskReject: detailedDecisionKind === 'desk_reject',
              revisionSeverity: isRevisionDecision
                ? (revisionSeverity ?? undefined)
                : undefined,
              revisionRound: saved.revisionRound,
              releasedReviewFileCount,
            },
            em,
          );
          if (n) pending.push(n);
        }
        if (submittedCycleAt) {
          const n = await this.events.enqueueSubmissionUnderReviewEvent(
            {
              submission: saved,
              submittedCycleAt,
              trigger: 'editor',
              initiatedByUserId: user.sub,
              editorFolioLocale,
            },
            em,
          );
          if (n) pending.push(n);
        }
        return saved;
      })
      .then((saved) => {
        this.events.emitPendingNotifications(pending);
        return saved;
      });
  }
}
