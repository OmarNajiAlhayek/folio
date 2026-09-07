import { Submission } from '../entities/submission.entity';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import {
  AssignmentStatus,
  ReviewAssignment,
} from '../entities/review-assignment.entity';
import { sanitizeConstructorContent } from './sanitize-constructor-html';
import { reviewAssignmentToEditorJson } from './assignment-response.mapper';
import type { SubmissionViewerRole } from './submission-viewer-role';
import type {
  AuthorReviewerProgressView,
  AuthorReviewProgressSummary,
} from '../reviews/author-review-progress.view';

/** Files a reviewer uploads with their review. Never part of the author's own files. */
const REVIEW_RESPONSE_KIND = 'review_response';

function fileToJson(
  f: {
    id: string;
    originalName: string;
    mimeType: string;
    kind: string;
    fileStage: SubmissionFileStage;
    isPublic: boolean;
    releasedToAuthorAt?: Date | null;
    reviewAssignmentId?: string | null;
  },
  opts?: { displayName?: string; includeAssignmentId?: boolean },
) {
  return {
    id: f.id,
    // When an anonymized name is supplied it *replaces* the real filename
    // rather than sitting beside it — otherwise the reviewer's name still ships
    // in `originalName` and only the UI hides it.
    originalName: opts?.displayName ?? f.originalName,
    mimeType: f.mimeType,
    kind: f.kind,
    fileStage: f.fileStage,
    isPublic: f.isPublic,
    releasedToAuthorAt: f.releasedToAuthorAt ?? null,
    ...(opts?.displayName ? { displayName: opts.displayName } : {}),
    // Editors group reviewer files by reviewer; the author gets the anonymized
    // index through `displayName` instead.
    ...(opts?.includeAssignmentId
      ? { reviewAssignmentId: f.reviewAssignmentId ?? null }
      : {}),
  };
}

/**
 * Reviewers in display order. `(assignedAt, id)` is stable under insertion, so
 * "Reviewer 2" stays "Reviewer 2" when a third reviewer is invited later.
 */
function orderedAssignments(s: Submission): ReviewAssignment[] {
  return [...(s.reviewAssignments ?? [])].sort((a, b) => {
    const at = new Date(a.assignedAt ?? 0).getTime();
    const bt = new Date(b.assignedAt ?? 0).getTime();
    return at === bt ? a.id.localeCompare(b.id) : at - bt;
  });
}

/** Assignment id -> 1-based anonymized reviewer index. */
function reviewerIndexByAssignment(s: Submission): Map<string, number> {
  const map = new Map<string, number>();
  orderedAssignments(s).forEach((a, i) => map.set(a.id, i + 1));
  return map;
}

/**
 * Filename shown to the author for a released reviewer file. `originalName`
 * routinely carries the reviewer's own name, which would break anonymity.
 */
function anonymizedReviewFileName(
  file: SubmissionFile,
  reviewerIndex: number | undefined,
): string {
  const dot = file.originalName.lastIndexOf('.');
  const ext = dot > 0 ? file.originalName.slice(dot) : '';
  const who = reviewerIndex ? `Reviewer ${reviewerIndex}` : 'Reviewer';
  return `${who} — review file${ext}`;
}

function toReviewProgress(s: Submission): AuthorReviewerProgressView[] {
  return orderedAssignments(s).map((a, i) => ({
    index: i + 1,
    status: a.status,
    invitedAt: a.assignedAt,
    respondedAt: a.respondedAt ?? null,
    reviewDueAt: a.reviewDueAt ?? null,
    reviewSubmittedAt: a.review?.submittedAt ?? null,
  }));
}

function toReviewProgressSummary(
  rows: AuthorReviewerProgressView[],
): AuthorReviewProgressSummary {
  const count = (status: AssignmentStatus) =>
    rows.filter((r) => r.status === status).length;
  return {
    invited: count(AssignmentStatus.INVITED),
    accepted: count(AssignmentStatus.ACCEPTED),
    declined: count(AssignmentStatus.DECLINED),
    completed: count(AssignmentStatus.COMPLETED),
  };
}

/**
 * JSON-safe submission for a given viewer. Reviewers never receive
 * constructorContent or reviewAssignments; file list is review-stage only.
 *
 * Reviewer-uploaded `review_response` files are editor-only until an editor
 * releases them: the author sees them only once `releasedToAuthorAt` is set, and
 * then under an anonymized filename. Reviewers never see them here at all —
 * `addReviewerFile` marks them review-stage, so without this filter every
 * reviewer would see every other reviewer's filename.
 */
export function submissionToViewerJson(
  s: Submission,
  viewer: SubmissionViewerRole,
): Record<string, unknown> {
  const files = s.files ?? [];
  const reviewerIndex = reviewerIndexByAssignment(s);
  let visibleFiles: SubmissionFile[];
  if (viewer === 'reviewer') {
    visibleFiles = files.filter(
      (f) =>
        f.fileStage === SubmissionFileStage.REVIEW &&
        f.kind !== REVIEW_RESPONSE_KIND,
    );
  } else if (viewer === 'author') {
    visibleFiles = files.filter(
      (f) => f.kind !== REVIEW_RESPONSE_KIND || f.releasedToAuthorAt != null,
    );
  } else {
    visibleFiles = files;
  }

  const base: Record<string, unknown> = {
    id: s.id,
    slug: s.slug,
    title: s.title,
    titleAr: s.titleAr,
    abstract: s.abstract,
    abstractAr: s.abstractAr,
    articleType: s.articleType,
    // The editorial home. Every viewer may know it — the portal publishes the
    // journal anyway — and the author's metadata form needs it to round-trip.
    journalId: s.journalId,
    keywords: s.keywords,
    keywordsAr: s.keywordsAr,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    publishedAt: s.publishedAt,
    reviewMethod: s.reviewMethod,
    files: visibleFiles.map((f) =>
      fileToJson(f, {
        displayName:
          viewer === 'author' && f.kind === REVIEW_RESPONSE_KIND
            ? anonymizedReviewFileName(
                f,
                f.reviewAssignmentId
                  ? reviewerIndex.get(f.reviewAssignmentId)
                  : undefined,
              )
            : undefined,
        includeAssignmentId: viewer === 'editor' || viewer === 'section_editor',
      }),
    ),
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

  if (
    viewer === 'author' ||
    viewer === 'editor' ||
    viewer === 'section_editor'
  ) {
    base.messageForAuthor = s.messageForAuthor;
    base.lastDecisionKind = s.lastDecisionKind;
    base.revisionSeverity = s.revisionSeverity ?? null;
    base.revisionRound = s.revisionRound ?? 0;
    base.authorResponseToReviewers = s.authorResponseToReviewers;
    base.reviewManuscriptPresentation = s.reviewManuscriptPresentation;
    base.disciplines = s.disciplines;
    base.disciplineSource = s.disciplineSource;
    base.disciplineSuggestedLabels = s.disciplineSuggestedLabels;
    base.disciplineSuggestedConfidence =
      s.disciplineSuggestedConfidence != null
        ? Number(s.disciplineSuggestedConfidence)
        : null;
    base.disciplineClassification = s.disciplineClassification;
    base.disciplineScopeInJournal =
      s.disciplineClassification?.scopeInJournal ?? null;
    base.disciplineScopeWarning =
      s.disciplineClassification?.scopeWarning ?? null;
  }

  if (viewer === 'author') {
    // Anonymized: index + state + dates only. Never identity, never the
    // per-reviewer recommendation.
    const progress = toReviewProgress(s);
    base.reviewProgress = progress;
    base.reviewProgressSummary = toReviewProgressSummary(progress);
    base.preSubmitAnalysis = s.preSubmitAnalysis;
    base.docxManuscriptViolations = s.docxManuscriptViolations ?? null;
    base.docxGrammarNotes = s.docxGrammarNotes ?? null;
  }

  if (
    (viewer === 'editor' || viewer === 'section_editor') &&
    s.reviewAssignments?.length
  ) {
    // Mapped, never raw: `reviewAssignments.reviewer` is a full `User` row and
    // would otherwise ship `passwordHash` to every editor and section editor.
    base.reviewAssignments = s.reviewAssignments.map(
      reviewAssignmentToEditorJson,
    );
  }

  if (viewer === 'editor' && s.sectionEditorAssignment) {
    base.sectionEditorAssignment = {
      id: s.sectionEditorAssignment.id,
      sectionEditorId: s.sectionEditorAssignment.sectionEditorId,
      assignedAt: s.sectionEditorAssignment.assignedAt,
      sectionEditor: s.sectionEditorAssignment.sectionEditor
        ? {
            id: s.sectionEditorAssignment.sectionEditor.id,
            displayName: s.sectionEditorAssignment.sectionEditor.displayName,
            email: s.sectionEditorAssignment.sectionEditor.email,
          }
        : undefined,
    };
  }

  return base;
}
