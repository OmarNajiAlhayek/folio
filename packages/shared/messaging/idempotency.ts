/**
 * Canonical idempotency key builders. Both the publisher (backend) and
 * the consumer (email-service) MUST produce/recognize identical strings,
 * so the rules live in one place.
 *
 * Rules are documented in the plan §7a:
 *   - ReviewerInvited -> "reviewer_invited:" + assignmentSlug
 *   - ReviewerResponded -> "reviewer_responded:" + assignmentSlug + ":" + outcome
 *   - ReminderDue     -> "reminder_due:"     + reminderId
 *   - CopyeditAssigned -> "copyedit_assigned:" + assignmentSlug
 *   - CopyeditQueriesSent -> "copyedit_queries:" + assignmentSlug + ":" + round
 *   - CopyeditAuthorReady -> "copyedit_author_ready:" + assignmentSlug + ":" + round
 *   - SubmissionSubmitted -> "submission_submitted:" + submissionSlug + ":" + editorUserId
 *   - SubmissionDecision   -> "submission_decision:" + submissionSlug + ":" + decision
 *   - SubmissionUnderReview -> "submission_under_review:" + submissionSlug + ":" + submittedCycleAt
 *   - ReviewSubmitted      -> "review_submitted:" + assignmentSlug + ":" + editorUserId
 *   - ReviewInvitationAccepted -> "review_invitation_accepted:" + assignmentSlug + ":" + editorUserId
 *   - ReviewInvitationDeclined -> "review_invitation_declined:" + assignmentSlug + ":" + editorUserId
 *   - SubmissionPublished  -> "submission_published:" + submissionSlug
 *   - RoleInvitationCreated -> "role_invitation:" + invitationId
 */

export function reviewerInvitedKey(assignmentSlug: string): string {
  if (!assignmentSlug) {
    throw new Error('reviewerInvitedKey: assignmentSlug is required');
  }
  return `reviewer_invited:${assignmentSlug}`;
}

export function reviewerRespondedKey(
  assignmentSlug: string,
  outcome: string,
): string {
  if (!assignmentSlug) {
    throw new Error('reviewerRespondedKey: assignmentSlug is required');
  }
  if (!outcome) {
    throw new Error('reviewerRespondedKey: outcome is required');
  }
  return `reviewer_responded:${assignmentSlug}:${outcome}`;
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

export function reviewSubmittedEmailKey(
  assignmentSlug: string,
  editorUserId: string,
): string {
  if (!assignmentSlug) {
    throw new Error('reviewSubmittedEmailKey: assignmentSlug is required');
  }
  if (!editorUserId) {
    throw new Error('reviewSubmittedEmailKey: editorUserId is required');
  }
  return `review_submitted:${assignmentSlug}:${editorUserId}`;
}

export function reviewInvitationAcceptedEmailKey(
  assignmentSlug: string,
  editorUserId: string,
): string {
  if (!assignmentSlug) {
    throw new Error(
      'reviewInvitationAcceptedEmailKey: assignmentSlug is required',
    );
  }
  if (!editorUserId) {
    throw new Error(
      'reviewInvitationAcceptedEmailKey: editorUserId is required',
    );
  }
  return `review_invitation_accepted:${assignmentSlug}:${editorUserId}`;
}

export function reviewInvitationDeclinedEmailKey(
  assignmentSlug: string,
  editorUserId: string,
): string {
  if (!assignmentSlug) {
    throw new Error(
      'reviewInvitationDeclinedEmailKey: assignmentSlug is required',
    );
  }
  if (!editorUserId) {
    throw new Error(
      'reviewInvitationDeclinedEmailKey: editorUserId is required',
    );
  }
  return `review_invitation_declined:${assignmentSlug}:${editorUserId}`;
}

export function submissionUnderReviewKey(
  submissionSlug: string,
  submittedCycleAt: string | Date,
): string {
  if (!submissionSlug) {
    throw new Error('submissionUnderReviewKey: submissionSlug is required');
  }
  const cycle =
    submittedCycleAt instanceof Date
      ? submittedCycleAt.toISOString()
      : String(submittedCycleAt).trim();
  if (!cycle) {
    throw new Error('submissionUnderReviewKey: submittedCycleAt is required');
  }
  return `submission_under_review:${submissionSlug}:${cycle}`;
}

export function submissionPublishedKey(submissionSlug: string): string {
  if (!submissionSlug) {
    throw new Error('submissionPublishedKey: submissionSlug is required');
  }
  return `submission_published:${submissionSlug}`;
}

export function roleInvitationEmailKey(invitationId: string): string {
  if (!invitationId) {
    throw new Error('roleInvitationEmailKey: invitationId is required');
  }
  return `role_invitation:${invitationId}`;
}

export function authVerificationOtpKey(challengeId: string): string {
  if (!challengeId) {
    throw new Error('authVerificationOtpKey: challengeId is required');
  }
  return `auth_verification_otp:${challengeId}`;
}

export function authPasswordResetKey(challengeId: string): string {
  if (!challengeId) {
    throw new Error('authPasswordResetKey: challengeId is required');
  }
  return `auth_password_reset:${challengeId}`;
}

export function authRegistrationWelcomeKey(userId: string): string {
  if (!userId) {
    throw new Error('authRegistrationWelcomeKey: userId is required');
  }
  return `auth_registration_welcome:${userId}`;
}

/** One active similarity-index job per published submission. */
export function similarityIndexKey(submissionId: string): string {
  if (!submissionId) {
    throw new Error('similarityIndexKey: submissionId is required');
  }
  return `similarity_index:${submissionId}`;
}

/** Corpus similarity report job (unique per request). */
export function corpusSimilarityKey(jobId: string): string {
  if (!jobId) {
    throw new Error('corpusSimilarityKey: jobId is required');
  }
  return `corpus_similarity:${jobId}`;
}

export function sectionEditorAssignedKey(
  submissionSlug: string,
  sectionEditorId: string,
): string {
  if (!submissionSlug) {
    throw new Error('sectionEditorAssignedKey: submissionSlug is required');
  }
  if (!sectionEditorId) {
    throw new Error('sectionEditorAssignedKey: sectionEditorId is required');
  }
  return `section_editor_assigned:${submissionSlug}:${sectionEditorId}`;
}
