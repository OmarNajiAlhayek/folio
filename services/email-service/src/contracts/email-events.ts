/**
 * Mirror of `packages/shared/contracts/email-events.ts` and the matching
 * mirror in `backend/src/messaging/contracts/email-events.ts`.
 * Keep all three in sync — they describe identical JSON on the wire.
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
