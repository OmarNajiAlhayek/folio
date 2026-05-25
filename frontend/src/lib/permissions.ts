/** Keep aligned with backend `permission-slugs.ts` */
export const PERMISSION_SLUGS = {
  SUBMISSION_MANAGE_OWN: "submission.manage_own",
  SUBMISSION_VIEW_EDITOR_QUEUE: "submission.view_editor_queue",
  SUBMISSION_CHANGE_STATUS: "submission.change_status",
  SUBMISSION_ASSIGN_REVIEWER: "submission.assign_reviewer",
  SUBMISSION_LIST_ASSIGNMENTS: "submission.list_assignments",
  SUBMISSION_ASSIGN_COPYEDITOR: "submission.assign_copyeditor",
  COPYEDIT_VIEW_QUEUE: "copyedit.view_queue",
  COPYEDIT_SUBMIT_NOTE: "copyedit.submit_note",
  COPYEDIT_PUBLISH: "copyedit.publish",
  ASSIGNMENT_VIEW_OWN: "assignment.view_own",
  REVIEW_SUBMIT: "review.submit",
  USERS_MANAGE_ROLES: "users.manage_roles",
  EMAIL_MANAGE_REMINDERS: "email.manage_reminders",
  EMAIL_MANAGE_ASSIGNMENT_REMINDERS: "email.manage_assignment_reminders",
} as const;

export const ROLE_SLUGS = {
  AUTHOR: "author",
  EDITOR: "editor",
  JOURNAL_MANAGER: "journal_manager",
  REVIEWER: "reviewer",
  COPYEDITOR: "copyeditor",
} as const;

/** Global email admin or per-assignment reminder controls on a submission. */
export function canManageAssignmentReminders(
  permissions: Iterable<string>,
): boolean {
  const set = new Set(permissions);
  return (
    set.has(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS) ||
    set.has(PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS)
  );
}

export function canManageOwnSubmissions(permissions: Iterable<string>): boolean {
  return [...permissions].includes(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN);
}

/** Author manuscript list or editor queue (not copyeditor-only staff). */
export function canBrowseSubmissionsNav(permissions: Iterable<string>): boolean {
  const set = new Set(permissions);
  return (
    set.has(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN) ||
    set.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  );
}

export type MeProfile = {
  id: string;
  email: string;
  displayName: string;
  affiliation: string | null;
  orcid: string | null;
  reviewKeywords: string | null;
  willingToReview: boolean;
  preferredLocale: string | null;
  roles: string[];
  permissions: string[];
};
