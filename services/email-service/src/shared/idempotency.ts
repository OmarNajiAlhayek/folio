/**
 * Mirror of `packages/shared/messaging/idempotency.ts` — keep in sync
 * with the backend mirror at
 * `backend/src/messaging/shared/idempotency.ts`.
 */

export function reviewerInvitedKey(assignmentSlug: string): string {
  if (!assignmentSlug) {
    throw new Error('reviewerInvitedKey: assignmentSlug is required');
  }
  return `reviewer_invited:${assignmentSlug}`;
}

export function reminderDueKey(reminderId: string): string {
  if (!reminderId) {
    throw new Error('reminderDueKey: reminderId is required');
  }
  return `reminder_due:${reminderId}`;
}
