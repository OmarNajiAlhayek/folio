import type { SubmissionStatusValue } from "@/lib/validation/constants";

/** Align with backend REVIEW_CONFIGURATION_STATUSES in submissions.service.ts */
export const REVIEW_CONFIGURATION_STATUSES: readonly SubmissionStatusValue[] =
  ["submitted", "under_review"];

export function submissionAllowsReviewConfiguration(
  status: string,
): boolean {
  return (REVIEW_CONFIGURATION_STATUSES as readonly string[]).includes(
    status,
  );
}
