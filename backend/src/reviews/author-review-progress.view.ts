import type { AssignmentStatus } from '../entities/review-assignment.entity';

/**
 * Anonymized per-reviewer progress for the submission author.
 *
 * Follows the same redaction contract as `AuthorReviewPublicView`: the author
 * learns *that* review work is happening and how far along it is, never who is
 * doing it nor what any individual reviewer recommended. Synthesising the
 * recommendations into a decision is the editor's job.
 */
export type AuthorReviewerProgressView = {
  /**
   * 1-based display index ("Reviewer 1"). Derived from `(assignedAt, id)` order,
   * not stored: that ordering is stable under insertion, so a later assignment
   * appends rather than renumbering the reviewers the author has already seen.
   */
  index: number;
  status: AssignmentStatus;
  invitedAt: Date;
  /** Null while still `invited`, and for assignments answered before this shipped. */
  respondedAt: Date | null;
  reviewDueAt: Date | null;
  reviewSubmittedAt: Date | null;
};

export type AuthorReviewProgressSummary = {
  invited: number;
  accepted: number;
  declined: number;
  completed: number;
};
