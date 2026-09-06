/**
 * Lifecycle of an issue (العدد) as an editorial container.
 *
 * `open` is the only status that accepts new articles; `published` is the one
 * the public portal renders. Kept separate from `SubmissionStatus` — an article
 * can be accepted long before its issue is released.
 */
export enum JournalIssueStatus {
  PLANNED = 'planned',
  OPEN = 'open',
  PUBLISHED = 'published',
  CLOSED = 'closed',
}
