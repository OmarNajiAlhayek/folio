import { describe, expect, it } from "vitest";
import {
  REVIEW_CONFIGURATION_STATUSES,
  submissionAllowsReviewConfiguration,
} from "@/lib/submission-review-phase";

describe("submissionAllowsReviewConfiguration", () => {
  it("allows submitted and under_review", () => {
    for (const status of REVIEW_CONFIGURATION_STATUSES) {
      expect(submissionAllowsReviewConfiguration(status)).toBe(true);
    }
  });

  it("disallows terminal and post-review statuses", () => {
    for (const status of [
      "draft",
      "revisions_requested",
      "accepted",
      "rejected",
      "copyediting",
      "published",
    ]) {
      expect(submissionAllowsReviewConfiguration(status)).toBe(false);
    }
  });
});
