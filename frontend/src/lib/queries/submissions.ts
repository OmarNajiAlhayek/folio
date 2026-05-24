"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiJson, getStoredToken } from "@/lib/api";
import { ApiError } from "@/lib/api-response";
import { queryKeys } from "@/lib/query-keys";
import { PERMISSION_SLUGS } from "@/lib/permissions";
import type { MeProfile } from "@/lib/permissions";

export type SubmissionListItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type SubmissionSummary = {
  id: string;
  slug: string;
  status: string;
  authorId: string;
  constructorContent?: unknown | null;
  title?: string;
};

export type SubmissionDetailPayload = {
  me: { id: string; permissions: string[] };
  sub: Record<string, unknown>;
  isEditorView: boolean;
  isOwner: boolean;
  reviewerCandidates: Array<{
    id: string;
    displayName: string;
    email: string;
  }>;
  reviewersLoadError: string | null;
  editorReviews: unknown[];
  authorReviews: unknown[];
  reviewsLoadFailed: boolean;
  editorAssignmentRows: Array<{
    id: string;
    slug?: string | null;
    reviewerId: string;
    status: string;
    reviewer?: { displayName?: string; email?: string };
  }>;
  assignmentReminders: Record<
    string,
    Array<{
      id: string;
      kind: string;
      sendAt: string;
      status: string;
    }>
  >;
};

export async function fetchSubmissionDetail(
  slug: string,
): Promise<SubmissionDetailPayload> {
  const enc = encodeURIComponent(slug);
  const [m, s] = await Promise.all([
    apiJson<MeProfile>("/auth/me"),
    apiJson<Record<string, unknown>>(`/submissions/${enc}`),
  ]);
  const permissions = m.permissions ?? [];
  const isEditorView = permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const isOwner = s.authorId === m.id;

  let candidates: SubmissionDetailPayload["reviewerCandidates"] = [];
  let reviewErr: string | null = null;
  let assignmentRows: SubmissionDetailPayload["editorAssignmentRows"] = [];

  if (
    isEditorView &&
    permissions.includes(PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS)
  ) {
    try {
      assignmentRows = await apiJson(
        `/submissions/${enc}/assignments`,
      );
    } catch {
      assignmentRows = [];
    }
  }

  if (
    isEditorView &&
    permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
  ) {
    try {
      const allCandidates = await apiJson<
        SubmissionDetailPayload["reviewerCandidates"]
      >("/users/reviewer-candidates");
      const busyReviewerIds = new Set(
        assignmentRows
          .filter(
            (a) => a.status === "invited" || a.status === "accepted",
          )
          .map((a) => a.reviewerId),
      );
      candidates = allCandidates.filter((c) => !busyReviewerIds.has(c.id));
    } catch (err) {
      reviewErr =
        err instanceof ApiError ? err.message : "reviewers_load_failed";
    }
  }

  let editorReviews: unknown[] = [];
  let authorReviews: unknown[] = [];
  let reviewsLoadFailed = false;

  if (isEditorView || isOwner) {
    try {
      const revs = await apiJson<unknown[]>(`/submissions/${enc}/reviews`);
      if (isEditorView) {
        editorReviews = revs;
      } else {
        authorReviews = revs;
      }
    } catch {
      reviewsLoadFailed = true;
    }
  }

  let reminderMap: SubmissionDetailPayload["assignmentReminders"] = {};
  if (
    isEditorView &&
    permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS) &&
    assignmentRows.length > 0
  ) {
    const entries = await Promise.all(
      assignmentRows
        .filter((a) => a.slug)
        .map(async (a) => {
          const asg = String(a.slug);
          try {
            const rows = await apiJson<
              SubmissionDetailPayload["assignmentReminders"][string]
            >(
              `/submissions/${enc}/assignments/${encodeURIComponent(asg)}/reminders`,
            );
            return [asg, rows] as const;
          } catch {
            return [asg, []] as const;
          }
        }),
    );
    reminderMap = Object.fromEntries(entries);
  }

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
  };
}

export function useSubmissionsList() {
  return useQuery({
    queryKey: queryKeys.submissions(),
    queryFn: () => apiJson<SubmissionListItem[]>("/submissions"),
    enabled: !!getStoredToken(),
  });
}

export function useSubmission(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.submission(slug),
    queryFn: () =>
      apiJson<SubmissionSummary>(
        `/submissions/${encodeURIComponent(slug)}`,
      ),
    enabled: enabled && !!getStoredToken() && !!slug,
  });
}

export function useSubmissionDetail(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.submissionDetail(slug),
    queryFn: () => fetchSubmissionDetail(slug),
    enabled: enabled && !!getStoredToken() && !!slug,
  });
}

export function useInvalidateSubmissionDetail() {
  const queryClient = useQueryClient();
  return (slug: string) =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.submissionDetail(slug),
    });
}

export function usePatchSubmission(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson(`/submissions/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      if ("constructorContent" in variables) {
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
