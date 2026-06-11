/**

 * Event payloads shared between the Nest backend (publisher) and the

 * email microservice (consumer). Imported via the `@folio/shared` workspace

 * package — edit only under `packages/shared/`.

 *

 * Routing keys live on the topic exchange `folio.events`:

 *   reviewer.invited       -> ReviewerInvitedEvent

 *   reviewer.responded     -> ReviewerRespondedEvent

 *   reminder.due           -> ReminderDueEvent

 *   copyedit.assigned      -> CopyeditAssignedEvent

 *   copyedit.queries_sent  -> CopyeditQueriesSentEvent

 *   copyedit.author_ready  -> CopyeditAuthorReadyEvent
 *   submission.submitted   -> SubmissionSubmittedEvent
 *   submission.decision    -> SubmissionDecisionEvent
 *   submission.under_review -> SubmissionUnderReviewEvent
 *   submission.published   -> SubmissionPublishedEvent
 *   review.submitted       -> ReviewSubmittedEvent
 *   review.invitation_accepted -> ReviewInvitationAcceptedEvent
 *   review.invitation_declined -> ReviewInvitationDeclinedEvent
 *   role.invitation        -> RoleInvitationCreatedEvent
 *   auth.verification_otp     -> AuthVerificationOtpEvent
 *   auth.password_reset       -> AuthPasswordResetEvent
 *   auth.registration_welcome -> AuthRegistrationWelcomeEvent

 *

 * Idempotency keys are produced by the publisher and consumed by the

 * email-service `email_log.idempotencyKey` unique index. See

 * `idempotency.ts` in this package for the canonical builders.

 */

export type ReviewerIdentity = {
  id: string;

  email: string;

  displayName: string;
};

export type EditorIdentity = {
  id: string;

  displayName: string;
};

export type AuthorIdentity = {
  id: string;

  email: string;

  displayName: string;
};

export type CopyeditorIdentity = {
  id: string;

  email: string;

  displayName: string;
};

export type ReviewerInvitedEvent = {
  type: 'ReviewerInvited';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  /** Resolved locale for templates + reminder snapshot (`en` | `ar`). Omitted in legacy payloads → consumer treats as `en`. */

  emailLocale?: 'en' | 'ar';

  reviewer: ReviewerIdentity;

  invitedBy: EditorIdentity;

  acceptUrl: string;

  declineUrl: string;
};

export type ReminderKind = 'review_due_soon' | 'review_overdue';

export type ReminderDueEvent = {
  type: 'ReminderDue';

  occurredAt: string;

  idempotencyKey: string;

  reminderId: string;

  kind: ReminderKind;

  assignmentSlug: string;

  /** Snapshot from reminder row (invitation-time locale). */

  emailLocale?: 'en' | 'ar';

  /** Snapshot from reminder row (manuscript title at invitation). */

  submissionTitle: string;

  reviewer: ReviewerIdentity;

  dueAt: string;
};

export type ReviewerRespondedOutcome = 'declined' | 'completed';

export type ReviewerRespondedEvent = {
  type: 'ReviewerResponded';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  outcome: ReviewerRespondedOutcome;

  reviewer: { id: string; displayName: string };
};

export type CopyeditAssignedEvent = {
  type: 'CopyeditAssigned';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  emailLocale?: 'en' | 'ar';

  copyeditor: CopyeditorIdentity;

  assignedBy: EditorIdentity;

  workbenchUrl: string;
};

export type CopyeditQueriesSentEvent = {
  type: 'CopyeditQueriesSent';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  round: number;

  emailLocale?: 'en' | 'ar';

  author: AuthorIdentity;

  copyeditor: CopyeditorIdentity;

  submissionUrl: string;

  noteExcerpt: string;
};

export type CopyeditAuthorReadyEvent = {
  type: 'CopyeditAuthorReady';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  round: number;

  emailLocale?: 'en' | 'ar';

  copyeditor: CopyeditorIdentity;

  author: AuthorIdentity;

  workbenchUrl: string;
};

export type SubmissionDecisionKind =
  | 'revisions_requested'
  | 'accepted'
  | 'rejected';

export type SubmissionSubmittedEvent = {
  type: 'SubmissionSubmitted';

  occurredAt: string;

  idempotencyKey: string;

  submissionSlug: string;

  submissionTitle: string;

  isResubmission: boolean;

  emailLocale?: 'en' | 'ar';

  author: AuthorIdentity;

  editor: {
    id: string;

    email: string;

    displayName: string;
  };

  editorQueueUrl: string;
};

export type SubmissionDecisionEvent = {
  type: 'SubmissionDecision';

  occurredAt: string;

  idempotencyKey: string;

  submissionSlug: string;

  submissionTitle: string;

  decision: SubmissionDecisionKind;

  emailLocale?: 'en' | 'ar';

  author: AuthorIdentity;

  decidedBy: EditorIdentity;

  submissionUrl: string;

  messageForAuthor?: string;
};

export type ReviewSubmittedEvent = {
  type: 'ReviewSubmitted';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  emailLocale?: 'en' | 'ar';

  reviewer: { id: string; displayName: string };

  editor: {
    id: string;

    email: string;

    displayName: string;
  };

  submissionUrl: string;
};

export type ReviewInvitationAcceptedEvent = {
  type: 'ReviewInvitationAccepted';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  emailLocale?: 'en' | 'ar';

  reviewer: { id: string; displayName: string };

  editor: {
    id: string;

    email: string;

    displayName: string;
  };

  submissionUrl: string;
};

export type ReviewInvitationDeclinedEvent = {
  type: 'ReviewInvitationDeclined';

  occurredAt: string;

  idempotencyKey: string;

  assignmentSlug: string;

  submissionSlug: string;

  submissionTitle: string;

  emailLocale?: 'en' | 'ar';

  reviewer: { id: string; displayName: string };

  editor: {
    id: string;

    email: string;

    displayName: string;
  };

  submissionUrl: string;
};

export type SubmissionUnderReviewTrigger = 'editor' | 'reviewer_accept';

export type SubmissionUnderReviewEvent = {
  type: 'SubmissionUnderReview';

  occurredAt: string;

  idempotencyKey: string;

  submissionSlug: string;

  submissionTitle: string;

  emailLocale?: 'en' | 'ar';

  author: AuthorIdentity;

  submissionUrl: string;

  /** ISO timestamp of submission.updatedAt while still submitted (idempotency cycle). */

  submittedCycleAt: string;

  trigger: SubmissionUnderReviewTrigger;

  initiatedByDisplayName: string;
};

export type SubmissionPublishedEvent = {
  type: 'SubmissionPublished';

  occurredAt: string;

  idempotencyKey: string;

  submissionSlug: string;

  submissionTitle: string;

  emailLocale?: 'en' | 'ar';

  author: AuthorIdentity;

  publicationUrl: string;
};

export type RoleInvitationCreatedEvent = {
  type: 'RoleInvitationCreated';

  occurredAt: string;

  idempotencyKey: string;

  invitationId: string;

  roleSlug: string;

  emailLocale?: 'en' | 'ar';

  invitee: AuthorIdentity;

  invitedBy: EditorIdentity;

  dashboardUrl: string;
};

export type AuthVerificationOtpEvent = {
  type: 'AuthVerificationOtp';

  occurredAt: string;

  idempotencyKey: string;

  challengeId: string;

  emailLocale?: 'en' | 'ar';

  user: AuthorIdentity;

  otpCode: string;

  verifyUrl: string;
};

export type AuthPasswordResetEvent = {
  type: 'AuthPasswordReset';

  occurredAt: string;

  idempotencyKey: string;

  challengeId: string;

  emailLocale?: 'en' | 'ar';

  user: AuthorIdentity;

  resetUrl: string;
};

export type AuthRegistrationWelcomeEvent = {
  type: 'AuthRegistrationWelcome';

  occurredAt: string;

  idempotencyKey: string;

  userId: string;

  emailLocale?: 'en' | 'ar';

  user: AuthorIdentity;

  dashboardUrl: string;

  newSubmissionUrl: string;

  willingToReview: boolean;
};

export type FolioEvent =
  | ReviewerInvitedEvent
  | ReviewerRespondedEvent
  | ReminderDueEvent
  | CopyeditAssignedEvent
  | CopyeditQueriesSentEvent
  | CopyeditAuthorReadyEvent
  | SubmissionSubmittedEvent
  | SubmissionDecisionEvent
  | SubmissionUnderReviewEvent
  | ReviewSubmittedEvent
  | ReviewInvitationAcceptedEvent
  | ReviewInvitationDeclinedEvent
  | SubmissionPublishedEvent
  | RoleInvitationCreatedEvent
  | AuthVerificationOtpEvent
  | AuthPasswordResetEvent
  | AuthRegistrationWelcomeEvent;

export const ROUTING_KEY = {
  reviewerInvited: 'reviewer.invited',

  reviewerResponded: 'reviewer.responded',

  reminderDue: 'reminder.due',

  copyeditAssigned: 'copyedit.assigned',

  copyeditQueriesSent: 'copyedit.queries_sent',

  copyeditAuthorReady: 'copyedit.author_ready',

  submissionSubmitted: 'submission.submitted',

  submissionDecision: 'submission.decision',

  submissionUnderReview: 'submission.under_review',

  submissionPublished: 'submission.published',

  reviewSubmitted: 'review.submitted',

  reviewInvitationAccepted: 'review.invitation_accepted',

  reviewInvitationDeclined: 'review.invitation_declined',

  roleInvitation: 'role.invitation',

  authVerificationOtp: 'auth.verification_otp',

  authPasswordReset: 'auth.password_reset',

  authRegistrationWelcome: 'auth.registration_welcome',
} as const;

export type RoutingKey = (typeof ROUTING_KEY)[keyof typeof ROUTING_KEY];
