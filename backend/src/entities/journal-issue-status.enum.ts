/**
 * Lifecycle of an issue (العدد) as an editorial container.
 *
 * `open` is the issue being assembled; `published` is the one the public portal
 * renders, and still accepts articles because a released issue gains rolling
 * additions. `planned` is not accepting yet, `closed` is finalised — see
 * `ISSUE_STATUSES_ACCEPTING_ARTICLES` in `journals/journal-issues.service.ts`.
 * Kept separate from `SubmissionStatus` — an article can be accepted long
 * before its issue is released.
 */
export enum JournalIssueStatus {
  PLANNED = 'planned',
  OPEN = 'open',
  PUBLISHED = 'published',
  CLOSED = 'closed',
}
