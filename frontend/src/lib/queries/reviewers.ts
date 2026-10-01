'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Reviewer directory for one manuscript.
 * Align with backend/src/submissions/reviewer-directory.service.ts
 */

/** Align with backend/src/submissions/reviewer-availability.ts */
export type ReviewerBlockReason =
  | 'conflict_of_interest'
  | 'already_assigned'
  | 'unavailable'
  | 'at_capacity';

export type ReviewerAvailability = {
  available: boolean;
  /** Only while unavailable: first day available again, `YYYY-MM-DD`. */
  unavailableUntil: string | null;
  note: string | null;
};

export type ReviewerStatsSummary = {
  invitations: number;
  accepted: number;
  declined: number;
  completed: number;
  acceptanceRate: number | null;
  avgDaysToRespond: number | null;
  avgDaysToComplete: number | null;
  onTimeRate: number | null;
  lastCompletedAt: string | null;
};

export type ReviewerDirectoryEntry = {
  id: string;
  displayName: string;
  email: string;
  affiliation: string | null;
  orcid: string | null;
  reviewKeywords: string | null;
  availability: ReviewerAvailability;
  /** `max` null is no limit. */
  capacity: { active: number; max: number | null };
  stats: ReviewerStatsSummary;
  thisSubmissionStatus: string | null;
  conflictOfInterest: boolean;
  blockReason: ReviewerBlockReason | null;
};

export type ReviewerRecentAssignment = {
  assignmentId: string;
  status: string;
  assignedAt: string;
  respondedAt: string | null;
  reviewDueAt: string | null;
  submittedAt: string | null;
  recommendation: string | null;
  journal: { slug: string; titleEn: string; titleAr: string } | null;
  /** Null when the manuscript is in a journal the caller does not edit. */
  submission: { slug: string | null; title: string } | null;
};

export type ReviewerDetail = ReviewerDirectoryEntry & {
  recommendations: Record<string, number>;
  recent: ReviewerRecentAssignment[];
};

export function useReviewerDirectory(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviewerDirectory(slug),
    queryFn: () =>
      apiJson<ReviewerDirectoryEntry[]>(
        `/submissions/${encodeURIComponent(slug)}/reviewer-directory`,
      ),
    enabled: enabled && !!slug,
    retry: false,
    staleTime: 30_000,
  });
}

export function useReviewerDetail(slug: string, reviewerId: string | null) {
  return useQuery({
    queryKey: queryKeys.reviewerDetail(slug, reviewerId ?? ''),
    queryFn: () =>
      apiJson<ReviewerDetail>(
        `/submissions/${encodeURIComponent(slug)}/reviewer-directory/${encodeURIComponent(reviewerId!)}`,
      ),
    enabled: !!slug && !!reviewerId,
    retry: false,
    staleTime: 30_000,
  });
}

/** After an invitation: the invitee's load and this manuscript's flags changed. */
export function useInvalidateReviewerDirectory() {
  const queryClient = useQueryClient();
  return (slug: string) =>
    queryClient.invalidateQueries({ queryKey: ['reviewerDirectory', slug] });
}
