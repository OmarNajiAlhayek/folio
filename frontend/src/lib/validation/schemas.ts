import { z } from "zod";
import {
  MAX_UPLOAD_BYTES,
  SUBMISSION_ARTICLE_TYPES,
  SUBMISSION_STATUSES,
} from "./constants";

/** backend/src/auth/dto/login.dto.ts */
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/** backend/src/auth/dto/register.dto.ts */
export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(200),
  affiliation: z
    .string()
    .max(500)
    .optional()
    .transform((s) => {
      if (s === undefined) return undefined;
      const t = s.trim();
      return t === "" ? undefined : t;
    }),
  orcid: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined) return undefined;
      const t = s.trim();
      if (t === "") return undefined;
      return t.toUpperCase();
    })
    .refine((v) => v === undefined || /^(\d{4}-){3}\d{3}[\dX]$/.test(v), {
      message: "orcidFormat",
    }),
  reviewKeywords: z
    .string()
    .max(2000)
    .optional()
    .transform((s) => {
      if (s === undefined) return undefined;
      const t = s.trim();
      return t === "" ? undefined : t;
    }),
  willingToReview: z.boolean().optional(),
});

const optionalTrimmedMax = (max: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }, z.string().max(max).optional());

const optionalTrimmedMinMax = (min: number, max: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }, z.string().min(min).max(max).optional());

function optionalEmailField() {
  return z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }, z.string().email().optional());
}

/** backend/src/submissions/dto/contributor.dto.ts */
export const contributorRowSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: optionalEmailField(),
  affiliation: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().min(0).max(99),
  isCorresponding: z.boolean(),
});

const articleTypeFromForm = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  return v;
}, z.enum(SUBMISSION_ARTICLE_TYPES).optional());

/** Journal guideline (Damascus / docs/styles): each abstract at most 300 words. */
export const ABSTRACT_MAX_WORDS = 300;

export function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function refineAbstractWordLimits(
  data: { abstract: string; abstractAr?: string },
  ctx: z.RefinementCtx,
): void {
  if (countWords(data.abstract) > ABSTRACT_MAX_WORDS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "abstractMaxWordsEn",
      path: ["abstract"],
    });
  }
  const ar = data.abstractAr ?? "";
  if (ar && countWords(ar) > ABSTRACT_MAX_WORDS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "abstractMaxWordsAr",
      path: ["abstractAr"],
    });
  }
}

/** backend/src/submissions/dto/create-submission.dto.ts */
export const createSubmissionSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    titleAr: optionalTrimmedMinMax(1, 500),
    abstract: z.string().trim().min(1).max(20000),
    abstractAr: optionalTrimmedMinMax(1, 20000),
    articleType: articleTypeFromForm,
    keywords: optionalTrimmedMax(800),
    keywordsAr: optionalTrimmedMax(800),
    fundingStatement: optionalTrimmedMax(8000),
    conflictOfInterestStatement: optionalTrimmedMax(8000),
    ethicalApprovalReference: optionalTrimmedMax(2000),
    originalityConfirmed: z.boolean().optional(),
    aiUsageStatement: optionalTrimmedMax(4000),
    contributors: z.preprocess((val) => {
      if (!Array.isArray(val)) return undefined;
      const filtered = val.filter((c) =>
        String((c as { fullName?: string })?.fullName ?? "").trim(),
      );
      return filtered.length > 0 ? filtered : undefined;
    }, z.array(contributorRowSchema).optional()),
  })
  .superRefine(refineAbstractWordLimits);

/**
 * PATCH body from SubmissionMetadataForm — mirrors backend UpdateSubmissionDto
 * (backend/src/submissions/dto/update-submission.dto.ts).
 */
export const submissionMetadataPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    titleAr: z.string().trim().min(1).max(500),
    abstract: z.string().trim().min(1).max(20000),
    abstractAr: z.string().trim().min(1).max(20000),
    articleType: articleTypeFromForm,
    keywords: optionalTrimmedMax(800),
    keywordsAr: optionalTrimmedMax(800),
    fundingStatement: optionalTrimmedMax(8000),
    conflictOfInterestStatement: optionalTrimmedMax(8000),
    ethicalApprovalReference: optionalTrimmedMax(2000),
    originalityConfirmed: z.boolean(),
    aiUsageStatement: optionalTrimmedMax(4000),
    contributors: z.array(contributorRowSchema).min(1),
  })
  .superRefine((data, ctx) => {
    refineAbstractWordLimits(
      { abstract: data.abstract, abstractAr: data.abstractAr },
      ctx,
    );
  });

const reviewCommentTrim = z.preprocess(
  (v) => (v === undefined || v === null ? "" : String(v).trim()),
  z.string().max(50000),
);

/** backend/src/reviews/dto/create-review.dto.ts */
export const createReviewSchema = z
  .object({
    commentsForAuthor: reviewCommentTrim,
    commentsToEditorOnly: reviewCommentTrim,
    recommendation: z.enum(["accept", "reject", "revisions"]),
  })
  .refine(
    (d) =>
      d.commentsForAuthor.length > 0 || d.commentsToEditorOnly.length > 0,
    { message: "reviewCommentsRequired", path: ["commentsForAuthor"] },
  );

/** backend/src/submissions/dto/assign-reviewer.dto.ts */
export const assignReviewerSchema = z.object({
  reviewerId: z.string().uuid(),
});

/** backend/src/submissions/dto/update-status.dto.ts */
export const updateSubmissionStatusSchema = z.object({
  status: z.enum(SUBMISSION_STATUSES),
});

export function fileExceedsUploadLimit(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}
