import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { Review, ReviewRecommendation } from '../entities/review.entity';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
import type { AuthorReviewPublicView } from '../reviews/author-review-public.view';
import type { RequestUser } from '../common/types/request-user';
import { assertCallerPermission } from '../common/authorization/permission-checks';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import type {
  ReviewInvitationAcceptedEvent,
  ReviewInvitationDeclinedEvent,
  ReviewSubmittedEvent,
} from '@folio/shared/contracts/email-events';
import {
  reviewInvitationAcceptedEmailKey,
  reviewInvitationDeclinedEmailKey,
  reviewSubmittedEmailKey,
} from '@folio/shared/messaging/idempotency';
import {
  reviewInvitationAcceptedKey,
  reviewInvitationDeclinedKey,
  reviewSubmittedKey,
} from '../notifications/notification-idempotency';
import { NOTIFICATION_TYPE } from '../notifications/notification-types';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import { submissionToViewerJson } from './submission-response.mapper';
import { SubmissionAccessService } from './submission-access.service';
import { SubmissionEventsService } from './submission-events.service';
import { SubmissionFileService } from './submission-file.service';

@Injectable()
export class ReviewWorkflowService {
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
    private readonly access: SubmissionAccessService,
    private readonly events: SubmissionEventsService,
    private readonly files: SubmissionFileService,
    private readonly config: ConfigService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
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

  private async allocateAssignmentSlug(
    submissionSlug: string,
    preferred?: string,
  ): Promise<string> {
    const trimmed = preferred?.trim();
    if (trimmed) {
      const taken = await this.assignmentsRepo.exist({
        where: { slug: trimmed },
      });
      if (taken) {
        throw new BadRequestException({
          message: 'Assignment slug already in use',
          code: 'VALIDATION_ERROR',
        });
      }
      return trimmed;
    }
    return this.nextAssignmentSlug(submissionSlug);
  }

  async updateReviewMethod(
    slug: string,
    user: RequestUser,
    method: SubmissionReviewMethod,
  ): Promise<Submission> {
    const s = await this.access.getBySlugOrThrow(slug);
    this.access.assertSubmissionAllowsReviewConfiguration(s);
    s.reviewMethod = method;
    return this.submissionsRepo.save(s);
  }

  async updateSubmissionFileStage(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
    stage: SubmissionFileStage,
  ): Promise<SubmissionFile> {
    const s = await this.access.getBySlugOrThrow(submissionSlug);
    this.access.assertSubmissionAllowsReviewConfiguration(s);
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
    options?: { assignmentSlug?: string; emitReviewerInvited?: boolean },
  ): Promise<ReviewAssignment> {
    assertCallerPermission(
      editor,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
      'Editor role required',
    );
    const submission = await this.access.getBySlugOrThrow(submissionSlug);
    this.access.assertSubmissionAllowsReviewConfiguration(submission);
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
    const assignmentSlug = await this.allocateAssignmentSlug(
      submission.slug,
      options?.assignmentSlug,
    );

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
        const emitInvite = options?.emitReviewerInvited !== false;
        if (emitInvite) {
          const n = await this.events.enqueueReviewerInvitedEvent(
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
        }
        return saved;
      })
      .then((saved) => {
        this.events.emitPendingNotifications(pending);
        return saved;
      });
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
    const editorIds =
      submissionRow?.slug && assignment.slug && reviewer
        ? await this.rbacService.listWorkflowNotificationRecipientIds()
        : [];
    const pending: Notification[] = [];
    const saved = await this.assignmentsRepo.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(ReviewAssignment);
      assignment.status = AssignmentStatus.ACCEPTED;
      const row = await assignmentRepo.save(assignment);
      let underReviewNotification: Notification | null = null;
      if (submissionRow?.status === SubmissionStatus.SUBMITTED) {
        await this.files.assertHasReviewManuscriptPackage(submissionRow.id);
        const submittedCycleAt = submissionRow.updatedAt;
        submissionRow.status = SubmissionStatus.UNDER_REVIEW;
        const savedSubmission = await em
          .getRepository(Submission)
          .save(submissionRow);
        underReviewNotification =
          await this.events.enqueueSubmissionUnderReviewEvent(
            {
              submission: savedSubmission,
              submittedCycleAt,
              trigger: 'reviewer_accept',
              initiatedByUserId: reviewerId,
            },
            em,
          );
      }
      if (underReviewNotification) {
        pending.push(underReviewNotification);
      }
      if (submissionRow?.slug && assignment.slug && reviewer) {
        const submissionSlug = submissionRow.slug;
        const slug = assignment.slug;
        const created = await this.events.notifyAllEditors(em, {
          editorIds,
          type: NOTIFICATION_TYPE.REVIEW_INVITATION_ACCEPTED,
          params: {
            submissionTitle: submissionRow.title,
            reviewerDisplayName: reviewer.displayName,
          },
          href: `/submissions/${submissionSlug}`,
          idempotencyKeyForEditor: (editorId) =>
            `${reviewInvitationAcceptedKey(slug)}:${editorId}`,
          email: {
            routingKey: ROUTING_KEY.reviewInvitationAccepted,
            buildPayload: ({ editor, emailLocale, occurredAt }) => {
              const payload: ReviewInvitationAcceptedEvent = {
                type: 'ReviewInvitationAccepted',
                occurredAt,
                idempotencyKey: reviewInvitationAcceptedEmailKey(
                  slug,
                  editor.id,
                ),
                assignmentSlug: slug,
                submissionSlug,
                submissionTitle: submissionRow.title,
                emailLocale,
                reviewer: {
                  id: reviewer.id,
                  displayName: reviewer.displayName,
                },
                editor: {
                  id: editor.id,
                  email: editor.email,
                  displayName: editor.displayName,
                },
                submissionUrl: `${this.appBaseUrl()}/submissions/${submissionSlug}`,
              };
              return payload as unknown as Record<string, unknown>;
            },
          },
        });
        pending.push(...created);
      }
      return row;
    });
    this.events.emitPendingNotifications(pending);
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
    const editorIds =
      submissionRow?.slug && assignment.slug && reviewer
        ? await this.rbacService.listWorkflowNotificationRecipientIds()
        : [];
    const pending: Notification[] = [];
    const saved = await this.assignmentsRepo.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(ReviewAssignment);
      assignment.status = AssignmentStatus.DECLINED;
      const row = await assignmentRepo.save(assignment);
      if (assignment.slug && reviewer) {
        await this.events.enqueueReviewerResponded(em, {
          assignmentSlug: assignment.slug,
          outcome: 'declined',
          reviewer,
        });
      }
      if (submissionRow?.slug && assignment.slug && reviewer) {
        const submissionSlug = submissionRow.slug;
        const slug = assignment.slug;
        const created = await this.events.notifyAllEditors(em, {
          editorIds,
          type: NOTIFICATION_TYPE.REVIEW_INVITATION_DECLINED,
          params: {
            submissionTitle: submissionRow.title,
            reviewerDisplayName: reviewer.displayName,
          },
          href: `/submissions/${submissionSlug}`,
          idempotencyKeyForEditor: (editorId) =>
            `${reviewInvitationDeclinedKey(slug)}:${editorId}`,
          email: {
            routingKey: ROUTING_KEY.reviewInvitationDeclined,
            buildPayload: ({ editor, emailLocale, occurredAt }) => {
              const payload: ReviewInvitationDeclinedEvent = {
                type: 'ReviewInvitationDeclined',
                occurredAt,
                idempotencyKey: reviewInvitationDeclinedEmailKey(
                  slug,
                  editor.id,
                ),
                assignmentSlug: slug,
                submissionSlug,
                submissionTitle: submissionRow.title,
                emailLocale,
                reviewer: {
                  id: reviewer.id,
                  displayName: reviewer.displayName,
                },
                editor: {
                  id: editor.id,
                  email: editor.email,
                  displayName: editor.displayName,
                },
                submissionUrl: `${this.appBaseUrl()}/submissions/${submissionSlug}`,
              };
              return payload as unknown as Record<string, unknown>;
            },
          },
        });
        pending.push(...created);
      }
      return row;
    });
    this.events.emitPendingNotifications(pending);
    return saved;
  }

  async listAssignments(
    submissionSlug: string,
    user: RequestUser,
  ): Promise<ReviewAssignment[]> {
    void user;
    const sub = await this.access.getBySlugOrThrow(submissionSlug);
    this.access.assertEditorQueueSubmissionVisible(sub);
    return this.assignmentsRepo.find({
      where: { submissionId: sub.id },
      relations: ['reviewer'],
    });
  }

  private assignmentToReviewerListJson(
    a: ReviewAssignment,
  ): Record<string, unknown> {
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
  }

  async listMyAssignments(
    reviewerId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.assignmentsRepo.find({
      where: { reviewerId },
      relations: ['submission', 'submission.files', 'submission.author'],
      order: { assignedAt: 'DESC' },
    });
    return rows.map((a) => this.assignmentToReviewerListJson(a));
  }

  async getMyAssignmentBySlug(
    assignmentSlug: string,
    reviewerId: string,
  ): Promise<Record<string, unknown>> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug },
      relations: ['submission', 'submission.files', 'submission.author'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    if (assignment.reviewerId !== reviewerId) {
      throw new ForbiddenException({
        message: 'This invitation belongs to another reviewer account',
        code: 'FORBIDDEN',
      });
    }
    return this.assignmentToReviewerListJson(assignment);
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
    await this.access.assertCanRead(submission, user);
    const submissionId = submission.id;
    const assignments = await this.assignmentsRepo.find({
      where: { submissionId },
      select: ['id', 'reviewerId'],
    });
    const ids = assignments.map((a) => a.id);
    if (ids.length === 0) {
      return [];
    }
    const editor = this.access.hasPerm(
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
    if (
      recommendation !== ReviewRecommendation.ACCEPT &&
      !authorPart &&
      !editorPart
    ) {
      throw new BadRequestException({
        message:
          'For reject or revisions, provide comments for the author and/or confidential comments for the editor',
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
    const submission = assignment.submission;
    const editorIds =
      submission?.slug && assignment.slug
        ? await this.rbacService.listWorkflowNotificationRecipientIds()
        : [];
    const pending: Notification[] = [];
    const review = await this.assignmentsRepo.manager.transaction(
      async (em) => {
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
        const reviewer = await em.getRepository(User).findOne({
          where: { id: reviewerId },
          select: ['id', 'displayName'],
        });
        if (assignment.slug && reviewer) {
          await this.events.enqueueReviewerResponded(em, {
            assignmentSlug: assignment.slug,
            outcome: 'completed',
            reviewer,
          });
        }
        if (submission?.slug && assignment.slug && reviewer) {
          const submissionSlug = submission.slug;
          const slug = assignment.slug;
          const created = await this.events.notifyAllEditors(em, {
            editorIds,
            type: NOTIFICATION_TYPE.REVIEW_SUBMITTED,
            params: {
              submissionTitle: submission.title,
              reviewerDisplayName: reviewer.displayName,
            },
            href: `/submissions/${submissionSlug}`,
            idempotencyKeyForEditor: (editorId) =>
              `${reviewSubmittedKey(slug)}:${editorId}`,
            email: {
              routingKey: ROUTING_KEY.reviewSubmitted,
              buildPayload: ({ editor, emailLocale, occurredAt }) => {
                const payload: ReviewSubmittedEvent = {
                  type: 'ReviewSubmitted',
                  occurredAt,
                  idempotencyKey: reviewSubmittedEmailKey(slug, editor.id),
                  assignmentSlug: slug,
                  submissionSlug,
                  submissionTitle: submission.title,
                  emailLocale,
                  reviewer: {
                    id: reviewer.id,
                    displayName: reviewer.displayName,
                  },
                  editor: {
                    id: editor.id,
                    email: editor.email,
                    displayName: editor.displayName,
                  },
                  submissionUrl: `${this.appBaseUrl()}/submissions/${submissionSlug}`,
                };
                return payload as unknown as Record<string, unknown>;
              },
            },
          });
          pending.push(...created);
        }
        return row;
      },
    );
    this.events.emitPendingNotifications(pending);
    return this.reviewsRepo.findOneOrFail({
      where: { assignmentId: review.assignmentId },
      relations: ['assignment'],
    });
  }

  /** Used by seed backfill for legacy assignment rows without slugs. */
  async allocateAssignmentSlugForSeed(submissionSlug: string): Promise<string> {
    return this.nextAssignmentSlug(submissionSlug);
  }
}
