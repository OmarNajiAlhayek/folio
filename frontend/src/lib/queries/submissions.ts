'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  canManageAssignmentReminders,
  PERMISSION_SLUGS,
} from '@/lib/permissions';
import type { MeProfile } from '@/lib/permissions';
import type { PreSubmitAnalysis } from '@/lib/pre-submit-validation';
import { useMe } from '@/lib/queries/auth';

export type SubmissionListItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

import type { SubmissionArticleType } from '@/lib/validation/constants';
export type { SubmissionArticleType };

export type SubmissionSummary = {
  id: string;
  slug: string;
  status: string;
  authorId: string;
  constructorContent?: unknown | null;
  title?: string;
  articleType?: SubmissionArticleType | null;
  /** The journal decides the citation style (APA / Vancouver) in the constructor. */
  journalId?: string | null;
  files?: Array<{ id: string; kind: string; originalName: string }>;
};

export type SubmissionFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  kind?: string;
  fileStage?: string;
  isPublic?: boolean;
  /**
   * Set for reviewer `review_response` files once an editor releases them.
   * Null means editor-only; the backend hides those from the author entirely.
   */
  releasedToAuthorAt?: string | null;
  /**
   * Anonymized filename the author sees for a released reviewer file
   * (`Reviewer 2 — review file.docx`). Editors get `originalName` instead.
   * Align with backend/src/submissions/submission-response.mapper.ts
   */
  displayName?: string;
  /** Editors and section editors only — used to group reviewer files by reviewer. */
  reviewAssignmentId?: string | null;
};

/** Align with backend/src/submissions/submission-workflow.constants.ts */
export type RevisionSeverity = 'minor' | 'major';

/**
 * Anonymized per-reviewer progress shown to the author.
 * Align with backend/src/reviews/author-review-progress.view.ts —
 * it deliberately carries no identity and no per-reviewer recommendation.
 */
export type AuthorReviewerProgress = {
  index: number;
  status: 'invited' | 'accepted' | 'declined' | 'completed';
  invitedAt: string;
  respondedAt: string | null;
  reviewDueAt: string | null;
  reviewSubmittedAt: string | null;
};

export type AuthorReviewProgressSummary = {
  invited: number;
  accepted: number;
  declined: number;
  completed: number;
};

export type SubmissionRecord = {
  id: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  status: string;
  authorId: string;
  updatedAt: string;
  reviewMethod?: string;
  /** The journal this manuscript belongs to; NOT NULL on the server. */
  journalId?: string | null;
  articleType?: string | null;
  keywords?: string | null;
  keywordsAr?: string | null;
  contributors?: Array<{
    fullName: string;
    email?: string;
    affiliation: string;
    sortOrder: number;
    isCorresponding: boolean;
  }> | null;
  fundingStatement?: string | null;
  conflictOfInterestStatement?: string | null;
  ethicalApprovalReference?: string | null;
  originalityConfirmed?: boolean;
  aiUsageStatement?: string | null;
  messageForAuthor?: string | null;
  lastDecisionKind?:
    | 'desk_reject'
    | 'post_review_reject'
    | 'accepted'
    | 'revisions_requested'
    | null;
  revisionSeverity?: RevisionSeverity | null;
  /** 0 until the first revisions_requested decision. */
  revisionRound?: number;
  /** Author viewer only. */
  reviewProgress?: AuthorReviewerProgress[];
  reviewProgressSummary?: AuthorReviewProgressSummary;
  authorResponseToReviewers?: string | null;
  files?: SubmissionFileRow[];
  constructorContent?: unknown | null;
  reviewManuscriptPresentation?: {
    presentUploaded: boolean;
    presentConstructor: boolean;
  } | null;
  disciplines?: string[];
  disciplineSource?: string | null;
  disciplineSuggestedLabels?: string[];
  disciplineSuggestedConfidence?: number | null;
  disciplineScopeInJournal?: boolean | null;
  disciplineScopeWarning?: string | null;
  preSubmitAnalysis?: PreSubmitAnalysis | null;
  docxManuscriptViolations?: Array<{
    code: string;
    message: string;
    messageAr: string;
    found: string;
    expected: string;
    /** `error` blocks submission; absent on rows stored before severities existed. */
    severity?: 'error' | 'warning';
  }> | null;
  docxGrammarNotes?: Array<{
    excerpt: string;
    suggestion: string;
    rule: string;
  }> | null;
  sectionEditorAssignment?: {
    id: string;
    sectionEditorId: string;
    assignedById: string;
    assignedAt: string;
    sectionEditor?: { id: string; displayName: string; email: string };
  } | null;
};

export type ReviewForEditor = {
  id: string;
  assignmentId: string;
  commentsForAuthor: string;
  commentsToEditorOnly: string;
  recommendation: string;
  submittedAt: string;
  assignment?: {
    reviewer?: { displayName?: string; email?: string };
  };
};

export type ReviewForAuthor = {
  id: string;
  commentsForAuthor: string;
  submittedAt: string;
};

export type ReminderRow = {
  id: string;
  kind: string;
  sendAt: string;
  status: string;
};

export type AssignmentRow = {
  id: string;
  slug?: string | null;
  reviewerId: string;
  status: string;
  reviewer?: { displayName?: string; email?: string };
};

export type SectionEditorCandidate = {
  id: string;
  displayName: string;
  email: string;
  /** Journal slugs this section editor serves (`engj`). */
  journals: string[];
};

export type SubmissionDetailPayload = {
  me: { id: string; permissions: string[] };
  sub: SubmissionRecord;
  isEditorView: boolean;
  isOwner: boolean;
  editorReviews: ReviewForEditor[];
  authorReviews: ReviewForAuthor[];
  reviewsLoadFailed: boolean;
  editorAssignmentRows: AssignmentRow[];
  assignmentReminders: Record<string, ReminderRow[]>;
  /** True when GET …/reminders failed for that assignment slug (not "empty list"). */
  reminderLoadFailedByAssignment: Record<string, boolean>;
  sectionEditorCandidates: SectionEditorCandidate[];
};

export async function fetchSubmissionDetail(
  slug: string,
  me: MeProfile,
): Promise<SubmissionDetailPayload> {
  const enc = encodeURIComponent(slug);

  // Identity comes from the shared `useMe()` cache — this page already
  // mounted AuthGate / Nav, so a second GET /auth/me is wasted.
  const s = await apiJson<SubmissionRecord>(`/submissions/${enc}`);

  const permissions = me.permissions ?? [];
  const isEditorView = permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const isOwner = s.authorId === me.id;
  const canListAssignments =
    isEditorView &&
    permissions.includes(PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS);

  // Round 2: assignments + reviews in parallel (neither depends on the other)
  const [assignmentRows, reviewsResult] = await Promise.all([
    canListAssignments
      ? apiJson<AssignmentRow[]>(`/submissions/${enc}/assignments`).catch(
          () => [] as AssignmentRow[],
        )
      : Promise.resolve([] as AssignmentRow[]),
    isEditorView || isOwner
      ? apiJson<ReviewForEditor[] | ReviewForAuthor[]>(
          `/submissions/${enc}/reviews`,
        )
          .then((rows) => ({ ok: true as const, rows }))
          .catch(() => ({ ok: false as const }))
      : Promise.resolve(null),
  ]);

  let editorReviews: ReviewForEditor[] = [];
  let authorReviews: ReviewForAuthor[] = [];
  let reviewsLoadFailed = false;

  if (reviewsResult !== null) {
    if (!reviewsResult.ok) {
      reviewsLoadFailed = true;
    } else if (isEditorView) {
      editorReviews = reviewsResult.rows as ReviewForEditor[];
    } else {
      authorReviews = reviewsResult.rows as ReviewForAuthor[];
    }
  }

  // Round 3: section-editor candidates + all reminders in parallel. The
  // reviewer pool is not loaded here: the reviewer browser fetches its own
  // directory, which already marks who is on this manuscript.
  const assignmentsWithSlug = assignmentRows.filter((a) => a.slug);

  const canAssignSectionEditor = permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
  );
  const canLoadReminders =
    canManageAssignmentReminders(permissions) && assignmentsWithSlug.length > 0;

  const [seCandidatesResult, remindersResult] = await Promise.all([
    canAssignSectionEditor
      ? apiJson<SectionEditorCandidate[]>('/users/section-editor-candidates')
          .then((data) => ({ ok: true as const, data }))
          .catch(() => ({
            ok: false as const,
            data: [] as SectionEditorCandidate[],
          }))
      : Promise.resolve(null),
    canLoadReminders
      ? apiJson<Record<string, ReminderRow[]>>(
          `/submissions/${enc}/assignment-reminders`,
        )
          .then((data) => ({ ok: true as const, data }))
          .catch(() => ({ ok: false as const }))
      : Promise.resolve(null),
  ]);

  const reminderMap: Record<string, ReminderRow[]> =
    remindersResult?.ok === true ? remindersResult.data : {};
  const reminderLoadFailedByAssignment = Object.fromEntries(
    remindersResult?.ok === false
      ? assignmentsWithSlug.map((a) => [String(a.slug), true])
      : [],
  );

  const sectionEditorCandidates: SectionEditorCandidate[] =
    seCandidatesResult?.ok ? seCandidatesResult.data : [];

  return {
    me: { id: me.id, permissions },
    sub: s,
    isEditorView,
    isOwner,
    editorReviews,
    authorReviews,
    reviewsLoadFailed,
    editorAssignmentRows: assignmentRows,
    assignmentReminders: reminderMap,
    reminderLoadFailedByAssignment,
    sectionEditorCandidates,
  };
}

export function useSubmissionsList() {
  return useQuery({
    queryKey: queryKeys.submissions(),
    queryFn: () => apiJson<SubmissionListItem[]>('/submissions'),
    retry: false,
  });
}

export function useSubmission(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.submission(slug),
    queryFn: () =>
      apiJson<SubmissionSummary>(`/submissions/${encodeURIComponent(slug)}`),
    enabled: enabled && !!slug,
    retry: false,
  });
}

export function useSubmissionDetail(slug: string, enabled = true) {
  const meQuery = useMe();
  return useQuery({
    queryKey: queryKeys.submissionDetail(slug),
    queryFn: () => fetchSubmissionDetail(slug, meQuery.data!),
    enabled: enabled && !!slug && !!meQuery.data,
    retry: false,
  });
}

export function useInvalidateSubmissionDetail() {
  const queryClient = useQueryClient();
  return (slug: string) =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.submissionDetail(slug),
    });
}

/** Summary row used by compose / lightweight submission views. */
export function useInvalidateSubmission() {
  const queryClient = useQueryClient();
  return (slug: string) =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.submission(slug),
    });
}

export function usePatchSubmission(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson(`/submissions/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      if ('constructorContent' in variables) {
        queryClient.setQueryData(
          queryKeys.submission(slug),
          (old: SubmissionSummary | undefined) =>
            old
              ? {
                  ...old,
                  constructorContent: variables.constructorContent,
                }
              : old,
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.submissionDetail(slug),
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.submissionDetail(slug),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.submission(slug),
      });
    },
  });
}
