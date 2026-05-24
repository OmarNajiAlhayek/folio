/** Align with backend/src/entities/submission-article-type.enum.ts */
export const SUBMISSION_ARTICLE_TYPES = [
  "original_research",
  "review_article",
  "case_report",
  "short_communication",
  "other",
] as const;

export type SubmissionArticleType = (typeof SUBMISSION_ARTICLE_TYPES)[number];

/** Align with backend/src/entities/submission-status.enum.ts */
export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "revisions_requested",
  "accepted",
  "rejected",
  "copyediting",
  "published",
] as const;

export type SubmissionStatusValue = (typeof SUBMISSION_STATUSES)[number];

/** Align with backend/src/submissions/submissions.controller.ts multer limits */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_MB = 25;
