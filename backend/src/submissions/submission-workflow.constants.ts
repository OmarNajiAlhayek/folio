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

/** Statuses where editors may invite reviewers or reconfigure the review package. */
export const REVIEW_CONFIGURATION_STATUSES: readonly SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
];
