/**
 * Event payloads shared between the Nest backend (publisher) and the
 * email microservice (consumer). Canonical definitions live here; each app
 * also keeps a byte-identical mirror under its `src/` for Nest `tsc`
 * layout — keep mirrors in sync when changing contracts.
 *
 * Routing keys live on the topic exchange `folio.events`:
 *   reviewer.invited  -> ReviewerInvitedEvent
 *   reminder.due      -> ReminderDueEvent
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

export type ReviewerInvitedEvent = {
  type: 'ReviewerInvited';
  occurredAt: string;
  idempotencyKey: string;
  assignmentSlug: string;
  submissionSlug: string;
  submissionTitle: string;
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
  reviewer: ReviewerIdentity;
  dueAt: string;
};

export type FolioEvent = ReviewerInvitedEvent | ReminderDueEvent;

export const ROUTING_KEY = {
  reviewerInvited: 'reviewer.invited',
  reminderDue: 'reminder.due',
} as const;

export type RoutingKey = (typeof ROUTING_KEY)[keyof typeof ROUTING_KEY];
