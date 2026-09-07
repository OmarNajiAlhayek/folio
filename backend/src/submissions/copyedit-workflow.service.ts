import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  CopyeditAssignment,
  CopyeditAssignmentStatus,
} from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
import type { RequestUser } from '../common/types/request-user';
import { assertCallerPermission } from '../common/authorization/permission-checks';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { submissionToViewerJson } from './submission-response.mapper';
import { copyeditAssignmentToEditorJson } from './assignment-response.mapper';
import {
  clearPublicSubmissionFiles,
  setPublishedManuscriptFile,
} from './publish-public-files';
import { claimStatusTransition } from './claim-status-transition';
import { SubmissionAccessService } from './submission-access.service';
import { SubmissionEventsService } from './submission-events.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SearchService } from '../search/search.service';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';

@Injectable()
export class CopyeditWorkflowService {
  private readonly logger = new Logger(CopyeditWorkflowService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(SubmissionFile)
    private readonly filesRepo: Repository<SubmissionFile>,
    @InjectRepository(CopyeditAssignment)
    private readonly copyeditAssignmentsRepo: Repository<CopyeditAssignment>,
    @InjectRepository(CopyeditNote)
    private readonly copyeditNotesRepo: Repository<CopyeditNote>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly rbacService: RbacService,
    private readonly access: SubmissionAccessService,
    private readonly events: SubmissionEventsService,
    private readonly catalog: PublicationCatalogService,
    private readonly manuscriptAnalysis: ManuscriptAnalysisService,
    @Optional() private readonly searchService: SearchService | null = null,
  ) {}

  private async nextCopyeditAssignmentSlug(
    submissionSlug: string,
  ): Promise<string> {
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

  private copyeditNoteCanBeSubmitted(
    status: CopyeditAssignmentStatus,
  ): boolean {
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

  async assignCopyeditor(
    submissionSlug: string,
    copyeditorId: string,
    editor: RequestUser,
  ): Promise<CopyeditAssignment> {
    assertCallerPermission(
      editor,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
      'Editor role required',
    );
    const submission = await this.access.getBySlugOrThrow(submissionSlug);
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
    const copyeditor = await this.usersRepo.findOne({
      where: { id: copyeditorId },
    });
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
        const n = await this.events.enqueueCopyeditAssignedEvent(
          { assignment: saved, submission, copyeditor, editorId: editor.sub },
          em,
        );
        if (n) pending.push(n);
        return saved;
      })
      .then((saved) => {
        this.events.emitPendingNotifications(pending);
        return saved;
      });
  }

  /**
   * Copyeditor roster for one submission. Scoped per submission for the same
   * reason as `listAssignments`, and mapped because `copyeditor` is a `User`.
   */
  async listCopyeditAssignments(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
    const sub = await this.access.getBySlugOrThrow(submissionSlug);
    this.access.assertEditorQueueSubmissionVisible(sub);
    await this.access.assertCanRead(sub, user);
    const rows = await this.copyeditAssignmentsRepo.find({
      where: { submissionId: sub.id },
      relations: ['copyeditor', 'notes'],
      order: { assignedAt: 'ASC' },
    });
    return rows.map(copyeditAssignmentToEditorJson);
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
    const copyeditor = await this.usersRepo.findOne({
      where: { id: copyeditorId },
    });
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
        // Stamp from the database clock, not the API host clock.
        // `submission_files.created_at` is written by Postgres `now()`, and
        // `assertManuscriptRevisionAfterNote` compares the two directly — so a
        // host clock running even slightly ahead makes a genuinely later
        // upload look earlier than the note and rejects the author's revision.
        const [{ now }] = await em.query<[{ now: Date }]>(
          'SELECT now() AS now',
        );
        const note = noteRepo.create({
          assignmentId: assignment.id,
          round,
          noteForAuthor: authorPart,
          noteToEditorOnly: (noteToEditorOnly ?? '').trim(),
          submittedAt: now,
        });
        await noteRepo.save(note);
        assignment.status = CopyeditAssignmentStatus.AWAITING_AUTHOR;
        await assignmentRepo.save(assignment);
        const n = await this.events.enqueueCopyeditQueriesSentEvent(
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
        this.events.emitPendingNotifications(pending);
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
    const notes = [...(assignment.notes ?? [])].sort(
      (a, b) => b.round - a.round,
    );
    const latest = notes[0];
    if (!latest) {
      throw new BadRequestException({
        message: 'No copyedit requests to respond to',
        code: 'VALIDATION_ERROR',
      });
    }
    await this.assertManuscriptRevisionAfterNote(submission.id, latest);

    const author = submission.author;
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
        const n = await this.events.enqueueCopyeditAuthorReadyEvent(
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
        this.events.emitPendingNotifications(pending);
        return saved;
      });
  }

  async markCopyeditCopyeditorApproved(
    assignmentSlug: string,
    copyeditorId: string,
  ): Promise<CopyeditAssignment> {
    const assignment = await this.copyeditAssignmentsRepo.findOne({
      where: { slug: assignmentSlug, copyeditorId },
      relations: ['submission'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    const submission = assignment.submission;
    if (!submission || submission.status !== SubmissionStatus.COPYEDITING) {
      throw new BadRequestException({
        message: 'Submission is not in copyediting',
        code: 'VALIDATION_ERROR',
      });
    }
    if (assignment.status !== CopyeditAssignmentStatus.ACTIVE) {
      throw new BadRequestException({
        message:
          'Only active assignments can be approved without an author round',
        code: 'VALIDATION_ERROR',
      });
    }
    assignment.status = CopyeditAssignmentStatus.READY_FOR_REVIEW;
    return this.copyeditAssignmentsRepo.save(assignment);
  }

  async listCopyeditNotes(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
    const submission = await this.submissionsRepo.findOne({
      where: { slug: submissionSlug },
    });
    if (!submission) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
    await this.access.assertCanRead(submission, user);
    const assignments = await this.copyeditAssignmentsRepo.find({
      where: { submissionId: submission.id },
      relations: ['copyeditor', 'notes'],
    });
    if (assignments.length === 0) return [];

    const isEditor = this.access.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
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
    assertCallerPermission(
      user,
      PERMISSION_SLUGS.COPYEDIT_PUBLISH,
      'Copyeditor or editor role required',
    );
    const s = await this.access.getBySlugOrThrow(slug);
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
    const editorOverride = this.access.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    if (!mine && !editorOverride) {
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
    const pending: Notification[] = [];
    const saved = await this.submissionsRepo.manager.transaction(async (em) => {
      const submissionRepo = em.getRepository(Submission);
      // One publish only: a second concurrent call must not re-stamp
      // publishedAt or re-announce the article.
      await claimStatusTransition(
        em,
        s.id,
        SubmissionStatus.COPYEDITING,
        SubmissionStatus.PUBLISHED,
      );
      s.status = SubmissionStatus.PUBLISHED;
      s.publishedAt = new Date();
      // Only the final manuscript becomes public — never the whole revision
      // history. See publish-public-files.ts.
      await setPublishedManuscriptFile(em, s.id);
      const row = await submissionRepo.save(s);
      const n = await this.events.enqueueSubmissionPublishedEvent(
        { submission: row },
        em,
      );
      if (n) pending.push(n);
      return row;
    });
    this.events.emitPendingNotifications(pending);
    void this.catalog
      .enqueuePublishedSubmissionForSimilarity(saved.id)
      .catch((err) => {
        this.logger.warn(
          'Failed to enqueue publication similarity index: %s',
          err instanceof Error ? err.message : String(err),
        );
      });
    if (this.searchService?.isEnabled()) {
      const author = await this.usersRepo.findOne({
        where: { id: saved.authorId },
        select: ['id', 'displayName'],
      });
      void this.searchService
        .upsertDocument(saved, author?.displayName ?? '')
        .catch((err) => {
          this.logger.warn(
            `Failed to index published submission in Typesense: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
    return saved;
  }

  /**
   * Removes a published article from the public catalog. Chief editors and
   * journal managers (VIEW_EDITOR_QUEUE) can do this; copyeditors cannot.
   * Files are demoted so the unauthenticated download route stops serving them.
   * Terminal: there is no transition out of `retracted`.
   */
  async retractSubmission(
    slug: string,
    user: RequestUser,
  ): Promise<Submission> {
    assertCallerPermission(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      'Editor role required',
    );
    const s = await this.access.getBySlugOrThrow(slug);
    this.access.assertEditorQueueSubmissionVisible(s);
    if (s.status !== SubmissionStatus.PUBLISHED) {
      throw new BadRequestException({
        message: 'Only a published article can be retracted',
        code: 'VALIDATION_ERROR',
      });
    }
    const pending: Notification[] = [];
    const saved = await this.submissionsRepo.manager.transaction(async (em) => {
      await claimStatusTransition(
        em,
        s.id,
        SubmissionStatus.PUBLISHED,
        SubmissionStatus.RETRACTED,
      );
      s.status = SubmissionStatus.RETRACTED;
      await clearPublicSubmissionFiles(em, s.id);
      const row = await em.getRepository(Submission).save(s);
      const n = await this.events.enqueueSubmissionRetractedNotification(
        { submission: row },
        em,
      );
      if (n) pending.push(n);
      return row;
    });
    this.events.emitPendingNotifications(pending);
    if (this.searchService?.isEnabled()) {
      void this.searchService.deleteDocument(saved.id).catch((err) => {
        this.logger.warn(
          `Failed to drop retracted submission from Typesense: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    return saved;
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
    const assignment = await this.copyeditAssignmentsRepo.findOne({
      where: { slug: assignmentSlug },
      relations: ['submission'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    const isCopyeditor = assignment.copyeditorId === user.sub;
    const isEditor = this.access.hasPerm(
      user,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    if (!isCopyeditor && !isEditor) {
      throw new ForbiddenException({
        message: 'Access denied',
        code: 'FORBIDDEN',
      });
    }

    return this.manuscriptAnalysis.analyzeSubmission(assignment.submissionId);
  }
}
