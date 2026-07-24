import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { open, readFile, rename, unlink, writeFile } from 'fs/promises';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import {
  normalizeSubmissionFileKind,
  type SubmissionFileKind,
} from './submission-file-kinds';
import {
  isExtensionAllowedForKind,
  sniffUploadMime,
} from './submission-file-upload.policy';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { SubmissionAccessService } from './submission-access.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { checkDocxFormat } from './docx-format-checker';
import { LanguageToolService } from './language-tool.service';
import mammoth from 'mammoth';

@Injectable()
export class SubmissionFileService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(SubmissionFile)
    private readonly filesRepo: Repository<SubmissionFile>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    private readonly access: SubmissionAccessService,
    private readonly manuscriptStyles: ManuscriptStyleRegistryService,
    private readonly languageTool: LanguageToolService,
  ) {}

  uploadRoot(): string {
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

  async unlinkUploadTemp(file: Express.Multer.File): Promise<void> {
    if (!file.path) return;
    try {
      await unlink(file.path);
    } catch {
      /* ignore missing temp */
    }
  }

  assertAuthorMayAddFile(
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

  async replaceSubmissionFilesOfKind(
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
    source: { type: 'path'; path: string } | { type: 'buffer'; buffer: Buffer },
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
  async persistSubmissionFile(params: {
    submissionId: string;
    source: { type: 'path'; path: string } | { type: 'buffer'; buffer: Buffer };
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

  async assertHasReviewManuscriptPackage(submissionId: string): Promise<void> {
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

  async readAttachedConstructorDocxBuffer(
    slug: string,
    user: RequestUser,
  ): Promise<Buffer> {
    const s = await this.access.getBySlugOrThrow(slug);
    if (s.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can re-import constructor documents',
        code: 'FORBIDDEN',
      });
    }
    const file = await this.filesRepo.findOne({
      where: {
        submissionId: s.id,
        kind: 'manuscript_constructor' as SubmissionFileKind,
      },
      order: { createdAt: 'DESC' },
    });
    if (!file) {
      throw new BadRequestException({
        message: 'No attached constructor Word file to re-import',
        code: 'VALIDATION_ERROR',
      });
    }
    try {
      return await readFile(join(this.uploadRoot(), file.storageKey));
    } catch {
      throw new BadRequestException({
        message: 'Attached constructor Word file is missing on disk',
        code: 'VALIDATION_ERROR',
      });
    }
  }

  async addFile(
    submissionSlug: string,
    user: RequestUser,
    file: Express.Multer.File,
    kindRaw?: string,
  ): Promise<SubmissionFile> {
    const s = await this.access.getBySlugOrThrow(submissionSlug);
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
      const saved = await this.persistSubmissionFile({
        submissionId: s.id,
        source: { type: 'path', path: tempPath },
        originalName: file.originalname,
        kind,
        sizeBytes: file.size,
      });

      if (
        kind === 'manuscript' &&
        file.originalname.toLowerCase().endsWith('.docx')
      ) {
        const destPath = join(this.uploadRoot(), saved.storageKey);
        await this.runDocxFormatCheck(s, destPath);
        await this.runDocxGrammarCheck(s, destPath);
      }

      return saved;
    } catch (e) {
      await this.unlinkUploadTemp(file);
      throw e;
    }
  }

  private async runDocxFormatCheck(
    submission: Submission,
    filePath: string,
  ): Promise<void> {
    try {
      const buffer = await readFile(filePath);
      const styleId = this.manuscriptStyles.resolveEffectiveStyleId(
        submission.constructorContent ?? null,
      );
      const profile = this.manuscriptStyles.getProfile(styleId);
      const disciplines = submission.disciplines ?? [];
      const isEngineering = disciplines.includes('العلوم الهندسية');
      const isMedical = disciplines.includes('العلوم الطبية');
      const discipline = isMedical
        ? 'medical'
        : isEngineering
          ? 'engineering'
          : disciplines.length > 0
            ? 'other'
            : undefined;
      const violations = await checkDocxFormat(buffer, profile, {
        expectedColumns: isEngineering ? 2 : 1,
        discipline,
      });
      submission.docxManuscriptViolations = violations;
      await this.submissionsRepo.save(submission);
    } catch {
      // Format check is non-fatal — don't block the upload
    }
  }

  private async runDocxGrammarCheck(
    submission: Submission,
    filePath: string,
  ): Promise<void> {
    if (!this.languageTool.isEnabled()) return;
    try {
      const buffer = await readFile(filePath);
      const { value: text } = await mammoth.extractRawText({ buffer });
      const notes = await this.languageTool.check(text);
      submission.docxGrammarNotes = notes.map(
        ({ excerpt, suggestion, rule }) => ({
          excerpt,
          suggestion,
          rule,
        }),
      );
      await this.submissionsRepo.save(submission);
    } catch {
      // Grammar check is non-fatal — don't block the upload
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
    await this.access.assertCanRead(sub, user);
    const isEditor = this.access.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const isAuthor = sub.authorId === user.sub;
    if (!isEditor && !isAuthor) {
      // Review-response files are only visible to the reviewer who uploaded them
      if (file.kind === 'review_response' && file.reviewAssignmentId) {
        const assignment = await this.assignmentsRepo.findOne({
          where: { id: file.reviewAssignmentId },
          select: ['reviewerId'],
        });
        if (!assignment || assignment.reviewerId !== user.sub) {
          throw new ForbiddenException({
            message: 'Access denied',
            code: 'FORBIDDEN',
          });
        }
      } else if (file.fileStage !== SubmissionFileStage.REVIEW) {
        throw new ForbiddenException({
          message: 'Reviewers may only access files in the review package',
          code: 'FORBIDDEN',
        });
      }
    }
    return { file, path: join(this.uploadRoot(), file.storageKey) };
  }

  async listReviewerFiles(
    assignmentSlug: string,
    reviewerId: string,
  ): Promise<SubmissionFile[]> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    return this.filesRepo.find({
      where: { reviewAssignmentId: assignment.id, kind: 'review_response' },
      order: { createdAt: 'ASC' },
    });
  }

  async addReviewerFile(
    assignmentSlug: string,
    reviewerId: string,
    file: Express.Multer.File,
  ): Promise<SubmissionFile> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug, reviewerId },
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    if (assignment.status !== AssignmentStatus.ACCEPTED) {
      throw new BadRequestException({
        message: 'Accept the review invitation before uploading files',
        code: 'VALIDATION_ERROR',
      });
    }
    const kind: SubmissionFileKind = 'review_response';
    if (!isExtensionAllowedForKind(file.originalname, kind)) {
      await this.unlinkUploadTemp(file);
      throw new BadRequestException({
        message:
          'Only PDF and DOCX files are accepted as review response files',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!file.path) {
      throw new BadRequestException({
        message: 'Upload temp file missing',
        code: 'VALIDATION_ERROR',
      });
    }
    try {
      const saved = await this.persistSubmissionFile({
        submissionId: assignment.submissionId,
        source: { type: 'path', path: file.path },
        originalName: file.originalname,
        kind,
        sizeBytes: file.size,
      });
      // Link file to this specific assignment and mark as review stage
      saved.reviewAssignmentId = assignment.id;
      saved.fileStage = SubmissionFileStage.REVIEW;
      return this.filesRepo.save(saved);
    } catch (e) {
      await this.unlinkUploadTemp(file);
      throw e;
    }
  }

  async deleteFile(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
  ): Promise<void> {
    const s = await this.access.getBySlugOrThrow(submissionSlug);
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
}
