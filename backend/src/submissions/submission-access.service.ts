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
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { submissionToViewerJson } from './submission-response.mapper';
import type { SubmissionViewerRole } from './submission-viewer-role';
import { REVIEW_CONFIGURATION_STATUSES } from './submission-workflow.constants';

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
    if (this.hasPerm(user, PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE)) {
      const seAssigned = await this.seAssignmentsRepo.exists({
        where: {
          submissionId: submission.id,
          sectionEditorId: user.sub,
        },
      });
      if (seAssigned) return;
    }
    throw new ForbiddenException({
      message: 'Cannot access this submission',
      code: 'FORBIDDEN',
    });
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
