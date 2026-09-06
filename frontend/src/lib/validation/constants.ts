/** Align with backend/src/entities/submission-article-type.enum.ts */
export const SUBMISSION_ARTICLE_TYPES = [
  'original_research',
  'review_article',
  'case_report',
  'short_communication',
  'other',
] as const;

export type SubmissionArticleType = (typeof SUBMISSION_ARTICLE_TYPES)[number];

/** Align with backend/src/entities/submission-status.enum.ts */
export const SUBMISSION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revisions_requested',
  'accepted',
  'rejected',
  'copyediting',
  'published',
  'retracted',
] as const;

export type SubmissionStatusValue = (typeof SUBMISSION_STATUSES)[number];

/**
 * Severity of a `revisions_requested` decision. Deliberately separate from the
 * status, so every existing status check keeps working.
 * Align with backend/src/submissions/submission-workflow.constants.ts
 */
export const REVISION_SEVERITIES = ['minor', 'major'] as const;

export type RevisionSeverityValue = (typeof REVISION_SEVERITIES)[number];

/**
 * Align with backend/src/entities/review.entity.ts (`ReviewRecommendation`).
 * `revisions` is legacy: pre-severity rows still carry it, but reviewers now
 * pick `minor_revisions` or `major_revisions` instead.
 */
export const REVIEW_RECOMMENDATIONS = [
  'accept',
  'minor_revisions',
  'major_revisions',
  'revisions',
  'resubmit_for_review',
  'resubmit_elsewhere',
  'reject',
  'see_comments',
] as const;

export type ReviewRecommendationValue = (typeof REVIEW_RECOMMENDATIONS)[number];

/** Values offered in the reviewer form; excludes the legacy `revisions`. */
export const REVIEW_RECOMMENDATION_CHOICES = [
  'accept',
  'minor_revisions',
  'major_revisions',
  'resubmit_for_review',
  'resubmit_elsewhere',
  'reject',
  'see_comments',
] as const;

/** Align with backend/src/submissions/submissions.controller.ts multer limits */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_MB = 25;
