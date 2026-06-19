'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { ApiError } from '@/lib/api-response';
import { queryKeys } from '@/lib/query-keys';
import { PERMISSION_SLUGS } from '@/lib/permissions';
import type { MeProfile } from '@/lib/permissions';

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
  files?: Array<{ id: string; kind: string; originalName: string }>;
};

export type SubmissionFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  kind?: string;
  fileStage?: string;
  isPublic?: boolean;
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
};

export type ReviewForEditor = {
  id: string;
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

export type SubmissionDetailPayload = {
  me: { id: string; permissions: string[] };
  sub: SubmissionRecord;
  isEditorView: boolean;
  isOwner: boolean;
  reviewerCandidates: Array<{
    id: string;
    displayName: string;
    email: string;
  }>;
  reviewersLoadError: string | null;
  editorReviews: ReviewForEditor[];
  authorReviews: ReviewForAuthor[];
  reviewsLoadFailed: boolean;
  editorAssignmentRows: AssignmentRow[];
  assignmentReminders: Record<string, ReminderRow[]>;
  /** True when GET …/reminders failed for that assignment slug (not "empty list"). */
  reminderLoadFailedByAssignment: Record<string, boolean>;
};

export async function fetchSubmissionDetail(
  slug: string,
): Promise<SubmissionDetailPayload> {
  const enc = encodeURIComponent(slug);

  // Round 1: identity + submission base (always needed)
  const [m, s] = await Promise.all([
    apiJson<MeProfile>('/auth/me'),
    apiJson<SubmissionRecord>(`/submissions/${enc}`),
  ]);

  const permissions = m.permissions ?? [];
  const isEditorView = permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const isOwner = s.authorId === m.id;
  const canListAssignments =
    isEditorView &&
    permissions.includes(PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS);
  const canAssignReviewer =
    isEditorView &&
    permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER);

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

  // Round 3: reviewer-candidates (needs assignment rows for busy-filter) + all reminders in parallel
  const busyReviewerIds = new Set(
    assignmentRows
      .filter((a) => a.status === 'invited' || a.status === 'accepted')
      .map((a) => a.reviewerId),
  );
  const assignmentsWithSlug = assignmentRows.filter((a) => a.slug);

  const [candidatesResult, ...reminderEntries] = await Promise.all([
    canAssignReviewer
      ? apiJson<SubmissionDetailPayload['reviewerCandidates']>(
          '/users/reviewer-candidates',
        )
          .then((data) => ({ ok: true as const, data }))
          .catch((err: unknown) => ({ ok: false as const, err }))
      : Promise.resolve(null),
    ...assignmentsWithSlug.map((a) => {
      const asg = String(a.slug);
      return apiJson<ReminderRow[]>(
        `/submissions/${enc}/assignments/${encodeURIComponent(asg)}/reminders`,
      )
        .then((rows) => ({ asg, rows, failed: false }))
        .catch(() => ({ asg, rows: [] as ReminderRow[], failed: true }));
    }),
  ]);

  let candidates: SubmissionDetailPayload['reviewerCandidates'] = [];
  let reviewErr: string | null = null;

  if (candidatesResult !== null) {
    if (!candidatesResult.ok) {
      reviewErr =
        candidatesResult.err instanceof ApiError
          ? candidatesResult.err.message
          : 'reviewers_load_failed';
    } else {
      candidates = candidatesResult.data.filter(
        (c) => !busyReviewerIds.has(c.id),
      );
    }
  }

  const reminderMap = Object.fromEntries(
    reminderEntries.map((e) => [e.asg, e.rows]),
  );
  const reminderLoadFailedByAssignment = Object.fromEntries(
    reminderEntries.filter((e) => e.failed).map((e) => [e.asg, true]),
  );

  return {
    me: { id: m.id, permissions },
    sub: s,
    isEditorView,
    isOwner,
    reviewerCandidates: candidates,
    reviewersLoadError: reviewErr,
    editorReviews,
    authorReviews,
    reviewsLoadFailed,
    editorAssignmentRows: assignmentRows,
    assignmentReminders: reminderMap,
    reminderLoadFailedByAssignment,
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
  return useQuery({
    queryKey: queryKeys.submissionDetail(slug),
    queryFn: () => fetchSubmissionDetail(slug),
    enabled: enabled && !!slug,
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
