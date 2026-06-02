import { describe, expect, it } from "vitest";
import {
  apiCodeToFieldErrors,
  collectSubmitReadinessErrors,
  fileFieldKey,
} from "@/lib/submission-field-errors";

describe("apiCodeToFieldErrors", () => {
  it("maps COI code to coi field", () => {
    const errors = apiCodeToFieldErrors("SUBMISSION_INCOMPLETE_COI");
    expect(errors.has("coi")).toBe(true);
  });
});

describe("collectSubmitReadinessErrors", () => {
  it("flags multiple incomplete metadata fields at once", () => {
    const { errors, codes } = collectSubmitReadinessErrors({
      submission: {
        articleType: null,
        titleAr: "",
        abstract: "English abstract with enough words here for testing.",
        abstractAr: "",
        keywords: "a, b",
        keywordsAr: "",
        contributors: [],
        originalityConfirmed: false,
        conflictOfInterestStatement: "",
        ethicalApprovalReference: "",
        aiUsageStatement: "",
      },
      files: [],
      presentation: { presentUploaded: true, presentConstructor: false },
      manuscriptSources: {
        hasUploadedManuscript: false,
        hasConstructorDraft: false,
      },
      codeMessages: {
        SUBMISSION_INCOMPLETE_ARTICLE_TYPE: "Article type required",
        SUBMISSION_INCOMPLETE_COI: "COI required",
      },
    });
    expect(codes.length).toBeGreaterThan(1);
    expect(errors.has("articleType")).toBe(true);
    expect(errors.has("coi")).toBe(true);
    expect(errors.has(fileFieldKey("cover_letter"))).toBe(true);
  });
});
