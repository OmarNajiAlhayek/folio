/**
 * Canonical idempotency key builders. Both the publisher (backend) and
 * the consumer (email-service) MUST produce/recognize identical strings,
 * so the rules live in one place.
 *
 * Rules are documented in the plan §7a:
 *   - ReviewerInvited -> "reviewer_invited:" + assignmentSlug
 *   - ReminderDue     -> "reminder_due:"     + reminderId
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
