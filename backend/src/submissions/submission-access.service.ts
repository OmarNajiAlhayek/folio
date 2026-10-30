import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { hasPermission } from '../common/authorization/permission-checks';
import type { RequestUser } from '../common/types/request-user';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { submissionToViewerJson } from './submission-response.mapper';
import type { SubmissionViewerRole } from './submission-viewer-role';
import { REVIEW_CONFIGURATION_STATUSES } from './submission-workflow.constants';

const JOURNAL_OUT_OF_SCOPE = 'JOURNAL_OUT_OF_SCOPE';

function isJournalOutOfScope(err: unknown): err is ForbiddenException {
  if (!(err instanceof ForbiddenException)) return false;
  const body = err.getResponse();
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    (body as { code?: unknown }).code === JOURNAL_OUT_OF_SCOPE
  );
}

@Injectable()
export class SubmissionAccessService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    @InjectRepository(CopyeditAssignment)
    private readonly copyeditAssignmentsRepo: Repository<CopyeditAssignment>,
    @InjectRepository(SectionEditorAssignment)
    private readonly seAssignmentsRepo: Repository<SectionEditorAssignment>,
    private readonly journalMemberships: JournalMembershipService,
  ) {}

  /** Sync caller slug check — same source as {@link PermissionsGuard}. */
  hasPerm(user: RequestUser, slug: string): boolean {
    return hasPermission(user, slug);
  }

  viewerRole(submission: Submission, user: RequestUser): SubmissionViewerRole {
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
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE)) {
      return 'section_editor';
    }
    return 'reviewer';
  }

  /** Drafts are author-only until submit; editor queue must not read them by slug. */
  assertEditorQueueSubmissionVisible(submission: Submission): void {
    if (submission.status === SubmissionStatus.DRAFT) {
      throw new NotFoundException({
        message: 'Submission not found',
        code: 'NOT_FOUND',
      });
    }
  }

  /**
   * Staff may act on a submission only inside the scope the queue already
   * applies. `journal_manager` is press-wide. An editor needs an `editor`
   * membership for this journal; none means no journals. A section editor
   * needs an assignment to this submission. Holding both roles passes if
   * either rule matches.
   *
   * Author, reviewer, and copyeditor checks stay in {@link assertCanRead}.
   * This helper does not grant those roles a journal.
   */
  async assertStaffSubmissionScope(
    submission: Submission,
    user: RequestUser,
  ): Promise<void> {
    if (await this.staffSubmissionInScope(submission, user)) return;
    throw new ForbiddenException({
      message: 'This submission is outside your journal scope',
      code: JOURNAL_OUT_OF_SCOPE,
    });
  }

  async assertCanRead(
    submission: Submission,
    user: RequestUser,
  ): Promise<void> {
    // Out-of-scope editors still fall through, so an editor who is also the
    // author, the assigned reviewer, or the assigned copyeditor keeps that path.
    let editorOutOfScope: ForbiddenException | null = null;
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)) {
      this.assertEditorQueueSubmissionVisible(submission);
      try {
        await this.assertStaffSubmissionScope(submission, user);
        return;
      } catch (err) {
        if (!isJournalOutOfScope(err)) throw err;
        editorOutOfScope = err;
      }
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
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE)) {
      const seAssigned = await this.seAssignmentsRepo.exists({
        where: {
          submissionId: submission.id,
          sectionEditorId: user.sub,
        },
      });
      if (seAssigned) return;
    }
    if (editorOutOfScope) throw editorOutOfScope;
    throw new ForbiddenException({
      message: 'Cannot access this submission',
      code: 'FORBIDDEN',
    });
  }

  /**
   * Same split as `editorQueueJournalIds`: the journal manager is every
   * journal, and everyone else is the journals they actually hold.
   */
  private async staffSubmissionInScope(
    submission: Submission,
    user: RequestUser,
  ): Promise<boolean> {
    if (user.roleSlugs.includes(ROLE_SLUGS.JOURNAL_MANAGER)) return true;
    if (user.roleSlugs.includes(ROLE_SLUGS.EDITOR)) {
      const journalIds = await this.journalMemberships.listJournalIdsForUser(
        user.sub,
        ROLE_SLUGS.EDITOR,
      );
      if (submission.journalId && journalIds.includes(submission.journalId)) {
        return true;
      }
    }
    if (
      user.roleSlugs.includes(ROLE_SLUGS.SECTION_EDITOR) ||
      this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE)
    ) {
      return this.seAssignmentsRepo.exists({
        where: {
          submissionId: submission.id,
          sectionEditorId: user.sub,
        },
      });
    }
    return false;
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

  async getBySlugForAuthor(
    slug: string,
    authorId: string,
  ): Promise<Submission | null> {
    const s = await this.submissionsRepo.findOne({ where: { slug } });
    if (!s || s.authorId !== authorId) return null;
    return s;
  }

  assertSubmissionAllowsReviewConfiguration(submission: Submission): void {
    if (!REVIEW_CONFIGURATION_STATUSES.includes(submission.status)) {
      throw new BadRequestException({
        message:
          'Peer review can only be configured while the submission is submitted or under review',
        code: 'VALIDATION_ERROR',
      });
    }
  }

  async findOneForUser(
    slug: string,
    user: RequestUser,
  ): Promise<Record<string, unknown>> {
    const s = await this.submissionsRepo.findOne({
      where: { slug },
      relations: [
        'files',
        'author',
        'reviewAssignments',
        'reviewAssignments.reviewer',
        // Needed for the author's anonymized review-progress timeline.
        'reviewAssignments.review',
        'copyeditAssignments',
        'sectionEditorAssignment',
        'sectionEditorAssignment.sectionEditor',
      ],
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
}
