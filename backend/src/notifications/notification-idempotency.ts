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

export function roleRemovedNotifKey(
  removalId: string,
  roleSlug: string,
): string {
  if (!removalId || !roleSlug) {
    throw new Error('roleRemovedNotifKey: removalId and roleSlug are required');
  }
  return `role_removed:${removalId}:${roleSlug}`;
}

export function sectionEditorAssignedNotifKey(submissionSlug: string): string {
  if (!submissionSlug) {
    throw new Error(
      'sectionEditorAssignedNotifKey: submissionSlug is required',
    );
  }
  return `section_editor_assigned:${submissionSlug}`;
}

export function copyeditUnassignedNotifKey(assignmentId: string): string {
  if (!assignmentId) {
    throw new Error('copyeditUnassignedNotifKey: assignmentId is required');
  }
  return `copyedit_unassigned:${assignmentId}`;
}
