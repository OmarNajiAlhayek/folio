import type { SubmissionDecisionKind } from '@folio/shared/contracts/email-events';
import { SubmissionStatus } from '../entities/submission-status.enum';

export const EDITOR_TRANSITIONS: Partial<
  Record<SubmissionStatus, SubmissionStatus[]>
> = {
  [SubmissionStatus.SUBMITTED]: [
    SubmissionStatus.UNDER_REVIEW,
    SubmissionStatus.REVISIONS_REQUESTED,
    SubmissionStatus.REJECTED,
    SubmissionStatus.ACCEPTED,
  ],
  [SubmissionStatus.UNDER_REVIEW]: [
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.REJECTED,
    SubmissionStatus.REVISIONS_REQUESTED,
  ],
};

export const DECISION_STATUS_TO_KIND: Partial<
  Record<SubmissionStatus, SubmissionDecisionKind>
> = {
  [SubmissionStatus.REVISIONS_REQUESTED]: 'revisions_requested',
  [SubmissionStatus.ACCEPTED]: 'accepted',
  [SubmissionStatus.REJECTED]: 'rejected',
};

export type DetailedDecisionKind =
  | 'desk_reject'
  | 'post_review_reject'
  | 'accepted'
  | 'revisions_requested';

/**
 * A rejection is a "desk reject" iff it happens straight out of `submitted`
 * (before any review round starts) rather than out of `under_review`.
 * Accept/revisions-requested pass through unchanged; other transitions
 * (e.g. no decision made) resolve to null.
 */
export function resolveDetailedDecisionKind(
  previousStatus: SubmissionStatus,
  next: SubmissionStatus,
): DetailedDecisionKind | null {
  if (next === SubmissionStatus.REJECTED) {
    return previousStatus === SubmissionStatus.SUBMITTED
      ? 'desk_reject'
      : 'post_review_reject';
  }
  const kind = DECISION_STATUS_TO_KIND[next];
  return kind === 'accepted' || kind === 'revisions_requested' ? kind : null;
}

/**
 * Severity of a `revisions_requested` decision. Deliberately a separate axis from
 * `SubmissionStatus`: the status stays `revisions_requested`, so every existing
 * status guard (author edit, resubmit, file upload/delete) keeps working unchanged.
 */
export const REVISION_SEVERITIES = ['minor', 'major'] as const;

export type RevisionSeverity = (typeof REVISION_SEVERITIES)[number];

/** Statuses where editors may invite reviewers or reconfigure the review package. */
export const REVIEW_CONFIGURATION_STATUSES: readonly SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
];
