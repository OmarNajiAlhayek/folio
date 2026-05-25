export function reviewInvitationAcceptedKey(assignmentSlug: string): string {
  if (!assignmentSlug) {
    throw new Error('reviewInvitationAcceptedKey: assignmentSlug is required');
  }
  return `review_invitation_accepted:${assignmentSlug}`;
}

export function reviewInvitationDeclinedKey(assignmentSlug: string): string {
  if (!assignmentSlug) {
    throw new Error('reviewInvitationDeclinedKey: assignmentSlug is required');
  }
  return `review_invitation_declined:${assignmentSlug}`;
}

export function reviewSubmittedKey(assignmentSlug: string): string {
  if (!assignmentSlug) {
    throw new Error('reviewSubmittedKey: assignmentSlug is required');
  }
  return `review_submitted:${assignmentSlug}`;
}

export function roleInvitationCreatedKey(invitationId: string): string {
  if (!invitationId) {
    throw new Error('roleInvitationCreatedKey: invitationId is required');
  }
  return `role_invitation_created:${invitationId}`;
}
