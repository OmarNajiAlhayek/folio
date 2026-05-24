/** Stable slugs — keep in sync with seed and frontend */
export const PERMISSION_SLUGS = {
  SUBMISSION_VIEW_EDITOR_QUEUE: 'submission.view_editor_queue',
  SUBMISSION_CHANGE_STATUS: 'submission.change_status',
  SUBMISSION_ASSIGN_REVIEWER: 'submission.assign_reviewer',
  SUBMISSION_LIST_ASSIGNMENTS: 'submission.list_assignments',
  SUBMISSION_ASSIGN_COPYEDITOR: 'submission.assign_copyeditor',
  ASSIGNMENT_VIEW_OWN: 'assignment.view_own',
  REVIEW_SUBMIT: 'review.submit',
  USERS_MANAGE_ROLES: 'users.manage_roles',
  EMAIL_MANAGE_REMINDERS: 'email.manage_reminders',
  COPYEDIT_VIEW_QUEUE: 'copyedit.view_queue',
  COPYEDIT_SUBMIT_NOTE: 'copyedit.submit_note',
  COPYEDIT_PUBLISH: 'copyedit.publish',
} as const;

export type PermissionSlug =
  (typeof PERMISSION_SLUGS)[keyof typeof PERMISSION_SLUGS];

export const ROLE_SLUGS = {
  AUTHOR: 'author',
  EDITOR: 'editor',
  REVIEWER: 'reviewer',
  COPYEDITOR: 'copyeditor',
} as const;
