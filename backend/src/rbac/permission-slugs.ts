/** Stable slugs — keep in sync with seed and frontend */
export const PERMISSION_SLUGS = {
  /** Create drafts, edit metadata/files, and submit manuscripts (author role only). */
  SUBMISSION_MANAGE_OWN: 'submission.manage_own',
  SUBMISSION_VIEW_EDITOR_QUEUE: 'submission.view_editor_queue',
  SUBMISSION_CHANGE_STATUS: 'submission.change_status',
  SUBMISSION_ASSIGN_REVIEWER: 'submission.assign_reviewer',
  SUBMISSION_LIST_ASSIGNMENTS: 'submission.list_assignments',
  SUBMISSION_ASSIGN_COPYEDITOR: 'submission.assign_copyeditor',
  ASSIGNMENT_VIEW_OWN: 'assignment.view_own',
  REVIEW_SUBMIT: 'review.submit',
  USERS_MANAGE_ROLES: 'users.manage_roles',
  /** Global email templates, reminder policy, pipeline admin. */
  EMAIL_MANAGE_REMINDERS: 'email.manage_reminders',
  /** Reschedule/cancel per-assignment review reminders (handling editors). */
  EMAIL_MANAGE_ASSIGNMENT_REMINDERS: 'email.manage_assignment_reminders',
  COPYEDIT_VIEW_QUEUE: 'copyedit.view_queue',
  COPYEDIT_SUBMIT_NOTE: 'copyedit.submit_note',
  COPYEDIT_PUBLISH: 'copyedit.publish',
} as const;

export type PermissionSlug =
  (typeof PERMISSION_SLUGS)[keyof typeof PERMISSION_SLUGS];

/** OR list for submission detail reads — mirrors `assertCanRead` entry paths. */
export const SUBMISSION_READ_PERMISSIONS = [
  PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  PERMISSION_SLUGS.REVIEW_SUBMIT,
  PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE,
] as const;

/** OR list for `GET /submissions` — mirrors `findAllForUser` entry paths. */
export const SUBMISSION_LIST_PERMISSIONS = [
  PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
] as const;

export const ROLE_SLUGS = {
  AUTHOR: 'author',
  /** Handling editor — peer review and editorial decisions (OJS section editor). */
  EDITOR: 'editor',
  /** Journal administration — users, email platform, queue oversight. */
  JOURNAL_MANAGER: 'journal_manager',
  REVIEWER: 'reviewer',
  COPYEDITOR: 'copyeditor',
} as const;
