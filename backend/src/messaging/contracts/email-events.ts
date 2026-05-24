/**

 * Mirror of `packages/shared/contracts/email-events.ts` — keep in sync.

 * Source of truth lives there; this is a build-time mirror because the

 * Nest backend's tsc rootDir does not extend outside `backend/src/`.

 *

 * The matching mirror in the email-service must declare these types

 * identically (they're transferred over RabbitMQ as JSON).

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

  emailLocale?: 'en' | 'ar';

  reviewer: ReviewerIdentity;

  dueAt: string;

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

};



export type FolioEvent =

  | ReviewerInvitedEvent

  | ReminderDueEvent

  | CopyeditAssignedEvent

  | CopyeditQueriesSentEvent

  | CopyeditAuthorReadyEvent

  | SubmissionSubmittedEvent

  | SubmissionDecisionEvent;



export const ROUTING_KEY = {

  reviewerInvited: 'reviewer.invited',

  reminderDue: 'reminder.due',

  copyeditAssigned: 'copyedit.assigned',

  copyeditQueriesSent: 'copyedit.queries_sent',

  copyeditAuthorReady: 'copyedit.author_ready',

  submissionSubmitted: 'submission.submitted',

  submissionDecision: 'submission.decision',

} as const;



export type RoutingKey = (typeof ROUTING_KEY)[keyof typeof ROUTING_KEY];

