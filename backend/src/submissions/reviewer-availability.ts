import { AssignmentStatus } from '../entities/review-assignment.entity';
import type { Submission } from '../entities/submission.entity';
import type { User } from '../entities/user.entity';

/**
 * Whether a reviewer can be invited, decided in one place.
 *
 * The reviewer directory uses this to grey out a card and the assign path uses
 * it to refuse the request, so the button an editor sees and the answer the
 * server gives cannot drift apart.
 */

/** Assignments that count toward a reviewer's concurrent limit. */
export const ACTIVE_REVIEW_STATUSES = [
  AssignmentStatus.INVITED,
  AssignmentStatus.ACCEPTED,
] as const;

export type ReviewerBlockReason =
  | 'conflict_of_interest'
  | 'already_assigned'
  | 'unavailable'
  | 'at_capacity';

export type ReviewerAvailabilityView = {
  available: boolean;
  /** Only while unavailable: first day available again, `YYYY-MM-DD`. */
  unavailableUntil: string | null;
  /** Only while unavailable. */
  note: string | null;
};

type AvailabilityFields = Pick<
  User,
  'reviewerAvailable' | 'reviewerUnavailableUntil' | 'reviewerUnavailableNote'
>;

/** Today in UTC as `YYYY-MM-DD`, the format `date` columns hydrate to. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A reviewer who set "unavailable until D" is available again from D onward.
 * That is decided here at read time, so nothing has to run on D to flip the
 * stored switch back.
 */
export function isReviewerAvailable(
  user: Pick<User, 'reviewerAvailable' | 'reviewerUnavailableUntil'>,
  today: string,
): boolean {
  if (user.reviewerAvailable) return true;
  return (
    user.reviewerUnavailableUntil != null &&
    user.reviewerUnavailableUntil <= today
  );
}

export function reviewerAvailabilityView(
  user: AvailabilityFields,
  today: string,
): ReviewerAvailabilityView {
  if (isReviewerAvailable(user, today)) {
    return { available: true, unavailableUntil: null, note: null };
  }
  return {
    available: false,
    unavailableUntil: user.reviewerUnavailableUntil,
    note: user.reviewerUnavailableNote,
  };
}

export function isAtReviewCapacity(
  activeLoad: number,
  maxActive: number | null,
): boolean {
  return maxActive != null && activeLoad >= maxActive;
}

/**
 * Most specific reason first: a conflict of interest or an existing assignment
 * is about this manuscript and outlasts any change in the reviewer's status.
 */
export function reviewerBlockReason(input: {
  conflictOfInterest: boolean;
  alreadyAssigned: boolean;
  available: boolean;
  activeLoad: number;
  maxActive: number | null;
}): ReviewerBlockReason | null {
  if (input.conflictOfInterest) return 'conflict_of_interest';
  if (input.alreadyAssigned) return 'already_assigned';
  if (!input.available) return 'unavailable';
  if (isAtReviewCapacity(input.activeLoad, input.maxActive)) {
    return 'at_capacity';
  }
  return null;
}

/**
 * The conflicts of interest the system can actually see: the submitting
 * author, and anyone listed as a contributor on the manuscript.
 *
 * This is deliberately not a full COI policy (shared affiliation, recent
 * co-authorship, supervisor relationships are editorial judgement); it covers
 * the cases where the data is unambiguous.
 */
export function reviewerConflictOfInterest(
  submission: Pick<Submission, 'authorId' | 'contributors'>,
  reviewer: Pick<User, 'id' | 'email'>,
): 'author' | 'contributor' | null {
  if (submission.authorId === reviewer.id) return 'author';
  const reviewerEmail = reviewer.email?.trim().toLowerCase();
  if (!reviewerEmail) return null;
  const isContributor = (submission.contributors ?? []).some(
    (c) => c.email?.trim().toLowerCase() === reviewerEmail,
  );
  return isContributor ? 'contributor' : null;
}
