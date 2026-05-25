import { Submission } from '../entities/submission.entity';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { sanitizeConstructorContent } from './sanitize-constructor-html';
import type { SubmissionViewerRole } from './submission-viewer-role';

function fileToJson(f: {
  id: string;
  originalName: string;
  mimeType: string;
  kind: string;
  fileStage: SubmissionFileStage;
  isPublic: boolean;
}) {
  return {
    id: f.id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    kind: f.kind,
    fileStage: f.fileStage,
    isPublic: f.isPublic,
  };
}

/**
 * JSON-safe submission for a given viewer. Reviewers never receive
 * constructorContent or reviewAssignments; file list is review-stage only.
 */
export function submissionToViewerJson(
  s: Submission,
  viewer: SubmissionViewerRole,
): Record<string, unknown> {
  const files = s.files ?? [];
  const visibleFiles =
    viewer === 'reviewer'
      ? files.filter((f) => f.fileStage === SubmissionFileStage.REVIEW)
      : files;


  const base: Record<string, unknown> = {
    id: s.id,
    slug: s.slug,
    title: s.title,
    titleAr: s.titleAr,
    abstract: s.abstract,
    abstractAr: s.abstractAr,
    articleType: s.articleType,
    keywords: s.keywords,
    keywordsAr: s.keywordsAr,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    publishedAt: s.publishedAt,
    reviewMethod: s.reviewMethod,
    files: visibleFiles.map(fileToJson),
  };

  if (viewer === 'reviewer') {
    if (s.reviewMethod === SubmissionReviewMethod.DOUBLE_ANONYMOUS) {
      base.authorId = undefined;
    } else {
      base.authorId = s.authorId;
      if (s.author) {
        base.author = {
          id: s.author.id,
          displayName: s.author.displayName,
          email: s.author.email,
        };
      }
    }
    return base;
  }

  base.authorId = s.authorId;
  if (s.author) {
    base.author = {
      id: s.author.id,
      displayName: s.author.displayName,
      email: s.author.email,
    };
  }
  base.contributors = s.contributors;
  base.fundingStatement = s.fundingStatement;
  base.conflictOfInterestStatement = s.conflictOfInterestStatement;
  base.ethicalApprovalReference = s.ethicalApprovalReference;
  base.originalityConfirmed = s.originalityConfirmed;
  base.aiUsageStatement = s.aiUsageStatement;

  if (viewer !== 'copyeditor') {
    base.constructorContent = sanitizeConstructorContent(s.constructorContent);
  }

  if (viewer === 'author' || viewer === 'editor') {
    base.reviewManuscriptPresentation = s.reviewManuscriptPresentation;
  }

  if (viewer === 'editor' && s.reviewAssignments?.length) {
    base.reviewAssignments = s.reviewAssignments;
  }

  return base;
}
