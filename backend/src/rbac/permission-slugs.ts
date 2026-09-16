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
  AUDIT_LOG_VIEW: 'audit_log.view',
  /** View submissions assigned to this section editor (section_editor role). */
  SUBMISSION_VIEW_SECTION_QUEUE: 'submission.view_section_queue',
  /** Assign a section editor to a submission (chief editor only). */
  SUBMISSION_ASSIGN_SECTION_EDITOR: 'submission.assign_section_editor',
  /**
   * Edit a journal's ISSNs and aims and scope. Journal-scoped: an editor edits
   * only journals they hold an `editor` membership in; the journal manager
   * edits all of them. Enforced in `JournalMetadataService`.
   */
  JOURNAL_EDIT_METADATA: 'journal.edit_metadata',
  /**
   * Edit a journal's registered Arabic and English titles — journal manager
   * only (Damascus University, 2026-09-14). Scholar and DOAJ match on the
   * title, so it must not change with each year's editor-in-chief.
   */
  JOURNAL_EDIT_TITLES: 'journal.edit_titles',
} as const;

export type PermissionSlug =
  (typeof PERMISSION_SLUGS)[keyof typeof PERMISSION_SLUGS];

/** OR list for submission detail reads — mirrors `assertCanRead` entry paths. */
export const SUBMISSION_READ_PERMISSIONS = [
  PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
  PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  PERMISSION_SLUGS.REVIEW_SUBMIT,
  PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE,
] as const;

/** OR list for `GET /submissions` — mirrors `findAllForUser` entry paths. */
export const SUBMISSION_LIST_PERMISSIONS = [
  PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
] as const;

/** OR list for peer-review configuration routes (review method, file stage). */
export const EDITOR_REVIEW_CONFIG_PERMISSIONS = [
  PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
  PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
] as const;

/** OR list for assignment reminder admin — mirrors `AssignmentRemindersController`. */
export const ASSIGNMENT_REMINDER_PERMISSIONS = [
  PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
  PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS,
] as const;

/**
 * AND list for reviewer matching — guard checks assign only; service enforces both.
 * See docs/authorization.md.
 */
export const SUGGESTED_REVIEWERS_CALLER_PERMISSIONS = [
  PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
  PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
] as const;

export const ROLE_SLUGS = {
  AUTHOR: 'author',
  /** Chief editor — queue oversight, assigns section editors, editorial decisions. */
  EDITOR: 'editor',
  /** Discipline-scoped editor — manages peer review for assigned submissions. */
  SECTION_EDITOR: 'section_editor',
  /** Journal administration — users, email platform, queue oversight. */
  JOURNAL_MANAGER: 'journal_manager',
  REVIEWER: 'reviewer',
  COPYEDITOR: 'copyeditor',
} as const;
