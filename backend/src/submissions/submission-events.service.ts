import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, In } from 'typeorm';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPE } from '../notifications/notification-types';
import { Notification } from '../entities/notification.entity';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import type {
  RevisionSeverity,
  CopyeditAssignedEvent,
  CopyeditAuthorReadyEvent,
  CopyeditQueriesSentEvent,
  ReviewerInvitedEvent,
  ReviewerRespondedEvent,
  ReviewerRespondedOutcome,
  SectionEditorAssignedEvent,
  SubmissionDecisionEvent,
  SubmissionDecisionKind,
  SubmissionPublishedEvent,
  SubmissionSubmittedEvent,
  SubmissionUnderReviewEvent,
  SubmissionUnderReviewTrigger,
} from '@folio/shared/contracts/email-events';
import {
  copyeditAssignedKey,
  copyeditAuthorReadyKey,
  copyeditQueriesSentKey,
  reviewerInvitedKey,
  reviewerRespondedKey,
  sectionEditorAssignedKey,
  submissionDecisionKey,
  submissionPublishedKey,
  submissionRetractedKey,
  submissionSubmittedKey,
  submissionUnderReviewKey,
} from '@folio/shared/messaging/idempotency';
import { truncateCopyeditNoteExcerpt } from '../common/copyedit-email-excerpt';
import { resolveEmailLocale } from '../common/email-locale';
import {
  assignmentInvitePageUrl,
  sectionEditorQueueUrl,
} from '../common/folio-frontend-urls';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';

@Injectable()
export class SubmissionEventsService {
  private readonly logger = new Logger(SubmissionEventsService.name);

  constructor(
    private readonly eventPublisher: EventPublisherService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
  }

  emitPendingNotifications(pending: Notification[]): void {
    if (pending.length > 0) {
      this.notifications.emitCreated(pending);
    }
  }

  async enqueueReviewerInvitedEvent(
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
    const baseUrl = this.appBaseUrl();
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
      acceptUrl: assignmentInvitePageUrl(baseUrl, assignment.slug, emailLocale),
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

  async enqueueSubmissionSubmittedForEditors(
    args: {
      submission: Submission;
      isResubmission: boolean;
      editorIds: string[];
    },
    em: EntityManager,
  ): Promise<Notification[]> {
    const { submission, isResubmission, editorIds } = args;
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
    if (editorIds.length === 0) {
      this.logger.warn(
        `submission.submitted: no editorial recipients to notify for slug=${slug}`,
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
    // Without the round, every resubmission collides with the original submission
    // and editors are never notified.
    const round = submission.revisionRound ?? 0;
    const outboxEvents = editors.map((editor) => {
      const emailLocale = resolveEmailLocale({
        recipientPreferred: editor.preferredLocale,
        siteDefault,
      });
      const payload: SubmissionSubmittedEvent = {
        type: 'SubmissionSubmitted',
        occurredAt,
        idempotencyKey: submissionSubmittedKey(slug, editor.id, round),
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
        idempotencyKey: submissionSubmittedKey(slug, editor.id, round),
      })),
      em,
    );
  }

  async enqueueSubmissionDecisionEvent(
    args: {
      submission: Submission;
      decision: SubmissionDecisionKind;
      editorId: string;
      editorFolioLocale?: string;
      messageForAuthor?: string | null;
      isDeskReject?: boolean;
      revisionSeverity?: RevisionSeverity;
      revisionRound?: number;
      releasedReviewFileCount?: number;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const {
      submission,
      decision,
      editorId,
      editorFolioLocale,
      messageForAuthor,
      isDeskReject,
      revisionSeverity,
      revisionRound,
      releasedReviewFileCount,
    } = args;
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
    const round = revisionRound ?? submission.revisionRound ?? 0;
    const idempotencyKey = submissionDecisionKey(
      submission.slug,
      decision,
      round,
    );
    const payload: SubmissionDecisionEvent = {
      type: 'SubmissionDecision',
      occurredAt: new Date().toISOString(),
      idempotencyKey,
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
      revisionRound: round,
      ...(messageForAuthor ? { messageForAuthor } : {}),
      ...(decision === 'rejected'
        ? { isDeskReject: Boolean(isDeskReject) }
        : {}),
      ...(decision === 'revisions_requested' && revisionSeverity
        ? { revisionSeverity }
        : {}),
      ...(releasedReviewFileCount ? { releasedReviewFileCount } : {}),
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
          ...(revisionSeverity ? { revisionSeverity } : {}),
        },
        href: `/submissions/${submission.slug}`,
        idempotencyKey,
      },
      em,
    );
  }

  async enqueueSubmissionUnderReviewEvent(
    args: {
      submission: Submission;
      submittedCycleAt: Date;
      trigger: SubmissionUnderReviewTrigger;
      initiatedByUserId: string;
      editorFolioLocale?: string;
    },
    em: EntityManager,
  ): Promise<Notification | null> {
    const {
      submission,
      submittedCycleAt,
      trigger,
      initiatedByUserId,
      editorFolioLocale,
    } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue submission under review: missing slug',
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
    const initiator = await em.getRepository(User).findOne({
      where: { id: initiatedByUserId },
      select: ['id', 'displayName'],
    });
    if (!initiator) {
      throw new InternalServerErrorException({
        message: 'Initiator account not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: author.preferredLocale,
      editorHeaderLocale: editorFolioLocale?.trim() || undefined,
      siteDefault,
    });
    const slug = submission.slug;
    const cycleIso = submittedCycleAt.toISOString();
    const idempotencyKey = submissionUnderReviewKey(slug, cycleIso);
    const payload: SubmissionUnderReviewEvent = {
      type: 'SubmissionUnderReview',
      occurredAt: new Date().toISOString(),
      idempotencyKey,
      submissionSlug: slug,
      submissionTitle: submission.title,
      emailLocale,
      author: {
        id: author.id,
        email: author.email,
        displayName: author.displayName,
      },
      submissionUrl: `${this.appBaseUrl()}/submissions/${slug}`,
      submittedCycleAt: cycleIso,
      trigger,
      initiatedByDisplayName: initiator.displayName,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.submissionUnderReview,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: author.id,
        type: NOTIFICATION_TYPE.SUBMISSION_UNDER_REVIEW,
        params: { submissionTitle: submission.title },
        href: `/submissions/${slug}`,
        idempotencyKey,
      },
      em,
    );
  }

  async enqueueReviewerResponded(
    em: EntityManager,
    input: {
      assignmentSlug: string;
      outcome: ReviewerRespondedOutcome;
      reviewer: Pick<User, 'id' | 'displayName'>;
    },
  ): Promise<void> {
    const occurredAt = new Date().toISOString();
    const payload: ReviewerRespondedEvent = {
      type: 'ReviewerResponded',
      occurredAt,
      idempotencyKey: reviewerRespondedKey(input.assignmentSlug, input.outcome),
      assignmentSlug: input.assignmentSlug,
      outcome: input.outcome,
      reviewer: {
        id: input.reviewer.id,
        displayName: input.reviewer.displayName,
      },
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.reviewerResponded,
      payload as unknown as Record<string, unknown>,
      em,
    );
  }

  async notifyAllEditors(
    em: EntityManager,
    input: {
      editorIds: string[];
      type: (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];
      params: Record<string, unknown>;
      href: string;
      idempotencyKeyForEditor: (editorId: string) => string;
      email?: {
        routingKey: string;
        buildPayload: (ctx: {
          editor: Pick<
            User,
            'id' | 'email' | 'displayName' | 'preferredLocale'
          >;
          emailLocale: 'en' | 'ar';
          occurredAt: string;
        }) => Record<string, unknown>;
      };
    },
  ): Promise<Notification[]> {
    const editorIds = input.editorIds;
    if (editorIds.length === 0) {
      if (input.email) {
        this.logger.warn(
          `No editorial recipients for email routingKey=${input.email.routingKey}`,
        );
      }
      return [];
    }

    if (input.email) {
      const editors = await em.getRepository(User).find({
        where: { id: In(editorIds) },
        select: ['id', 'email', 'displayName', 'preferredLocale'],
      });
      const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
      const occurredAt = new Date().toISOString();
      const outboxEvents = editors.map((editor) => {
        const emailLocale = resolveEmailLocale({
          recipientPreferred: editor.preferredLocale,
          siteDefault,
        });
        return {
          routingKey: input.email!.routingKey,
          payload: input.email!.buildPayload({
            editor,
            emailLocale,
            occurredAt,
          }),
        };
      });
      await this.eventPublisher.enqueueMany(outboxEvents, em);
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

  async enqueueCopyeditAssignedEvent(
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

  async enqueueCopyeditQueriesSentEvent(
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

  async enqueueCopyeditAuthorReadyEvent(
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

  async enqueueSubmissionPublishedEvent(
    args: { submission: Submission },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { submission } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue submission published: missing slug',
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
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: author.preferredLocale,
      siteDefault,
    });
    const slug = submission.slug;
    const payload: SubmissionPublishedEvent = {
      type: 'SubmissionPublished',
      occurredAt: new Date().toISOString(),
      idempotencyKey: submissionPublishedKey(slug),
      submissionSlug: slug,
      submissionTitle: submission.title,
      emailLocale,
      author: {
        id: author.id,
        email: author.email,
        displayName: author.displayName,
      },
      publicationUrl: `${this.appBaseUrl()}/publications/${slug}`,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.submissionPublished,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: author.id,
        type: NOTIFICATION_TYPE.SUBMISSION_PUBLISHED,
        params: { submissionTitle: submission.title },
        href: `/publications/${slug}`,
        idempotencyKey: submissionPublishedKey(slug),
      },
      em,
    );
  }

  async enqueueSubmissionRetractedNotification(
    args: { submission: Submission },
    em: EntityManager,
  ): Promise<Notification | null> {
    const { submission } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue submission retracted: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    return this.notifications.createIfAbsent(
      {
        userId: submission.authorId,
        type: NOTIFICATION_TYPE.SUBMISSION_RETRACTED,
        params: { submissionTitle: submission.title },
        href: `/submissions/${submission.slug}`,
        idempotencyKey: submissionRetractedKey(submission.slug),
      },
      em,
    );
  }

  async enqueueSectionEditorAssignedEvent(args: {
    submission: Submission;
    sectionEditor: User;
    assignedByDisplayName: string;
    assignedById: string;
    folioLocale?: string;
  }): Promise<void> {
    const {
      submission,
      sectionEditor,
      assignedByDisplayName,
      assignedById,
      folioLocale,
    } = args;
    if (!submission.slug) {
      throw new InternalServerErrorException({
        message: 'Cannot enqueue section editor assigned: missing slug',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: sectionEditor.preferredLocale,
      editorHeaderLocale: folioLocale?.trim() || undefined,
      siteDefault,
    });
    const baseUrl = this.appBaseUrl();
    const idempotencyKey = sectionEditorAssignedKey(
      submission.slug,
      sectionEditor.id,
    );
    const payload: SectionEditorAssignedEvent = {
      type: 'SectionEditorAssigned',
      occurredAt: new Date().toISOString(),
      idempotencyKey,
      submissionSlug: submission.slug,
      submissionTitle: submission.title,
      emailLocale,
      sectionEditor: {
        id: sectionEditor.id,
        email: sectionEditor.email,
        displayName: sectionEditor.displayName,
      },
      assignedBy: {
        id: assignedById,
        displayName: assignedByDisplayName,
      },
      queueUrl: sectionEditorQueueUrl(baseUrl, emailLocale),
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.sectionEditorAssigned,
      payload as unknown as Record<string, unknown>,
    );
    const notification = await this.notifications.createIfAbsent(
      {
        userId: sectionEditor.id,
        type: NOTIFICATION_TYPE.SECTION_EDITOR_ASSIGNED,
        params: { submissionTitle: submission.title },
        href: `/section-editor`,
        idempotencyKey,
      },
      null,
    );
    if (notification) {
      this.notifications.emitCreated([notification]);
    }
  }
}
