import type { SubmissionStatusValue } from "@/lib/validation/constants";

/** Align with backend/src/submissions/submissions.service.ts EDITOR_TRANSITIONS */
export const EDITOR_STATUS_TRANSITIONS: Partial<
  Record<SubmissionStatusValue, SubmissionStatusValue[]>
> = {
  submitted: [
    "under_review",
    "revisions_requested",
    "rejected",
    "accepted",
  ],
  under_review: ["accepted", "rejected", "revisions_requested"],
};

/** Status values editors may pick (current + allowed next states). */
export function editorStatusOptions(
  current: string,
): SubmissionStatusValue[] {
  const cur = current as SubmissionStatusValue;
  const next = EDITOR_STATUS_TRANSITIONS[cur];
  if (!next?.length) {
    return cur ? [cur] : [];
  }
  return [cur, ...next.filter((s) => s !== cur)];
}
