/**
 * Mirror of `packages/shared/messaging/idempotency.ts`. The email-service
 * has the matching mirror; both apps MUST produce identical strings.
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

export function copyeditAssignedKey(assignmentSlug: string): string {
  if (!assignmentSlug) {
    throw new Error('copyeditAssignedKey: assignmentSlug is required');
  }
  return `copyedit_assigned:${assignmentSlug}`;
}

export function copyeditQueriesSentKey(
  assignmentSlug: string,
  round: number,
): string {
  if (!assignmentSlug) {
    throw new Error('copyeditQueriesSentKey: assignmentSlug is required');
  }
  return `copyedit_queries:${assignmentSlug}:${round}`;
}

export function copyeditAuthorReadyKey(
  assignmentSlug: string,
  round: number,
): string {
  if (!assignmentSlug) {
    throw new Error('copyeditAuthorReadyKey: assignmentSlug is required');
  }
  return `copyedit_author_ready:${assignmentSlug}:${round}`;
}

export function submissionSubmittedKey(
  submissionSlug: string,
  editorUserId: string,
): string {
  if (!submissionSlug) {
    throw new Error('submissionSubmittedKey: submissionSlug is required');
  }
  if (!editorUserId) {
    throw new Error('submissionSubmittedKey: editorUserId is required');
  }
  return `submission_submitted:${submissionSlug}:${editorUserId}`;
}

export function submissionDecisionKey(
  submissionSlug: string,
  decision: string,
): string {
  if (!submissionSlug) {
    throw new Error('submissionDecisionKey: submissionSlug is required');
  }
  if (!decision) {
    throw new Error('submissionDecisionKey: decision is required');
  }
  return `submission_decision:${submissionSlug}:${decision}`;
}
