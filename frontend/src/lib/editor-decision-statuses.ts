import type { SubmissionStatusValue } from '@/lib/validation/constants';

/** Statuses where editors may attach an optional messageForAuthor (backend DECISION_STATUS_TO_KIND). */
export const EDITOR_DECISION_STATUSES: readonly SubmissionStatusValue[] = [
  'accepted',
  'rejected',
  'revisions_requested',
];

export function isEditorDecisionStatus(
  status: string,
): status is SubmissionStatusValue {
  return (EDITOR_DECISION_STATUSES as readonly string[]).includes(status);
}
