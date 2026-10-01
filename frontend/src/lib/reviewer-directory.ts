import { matchesTokens, tokenTexts } from '@folio/shared/text/search-normalize';
import type { ReviewerDirectoryEntry } from '@/lib/queries/reviewers';

/** A reviewer plus their folded search tokens, so a keystroke re-folds only the query. */
export type SearchableReviewer = {
  reviewer: ReviewerDirectoryEntry;
  tokens: string[];
};

export const REVIEWER_FILTERS = [
  'invitable',
  'all',
  'available',
  'unavailable',
] as const;
export type ReviewerFilter = (typeof REVIEWER_FILTERS)[number];

export const REVIEWER_SORTS = [
  'name',
  'load',
  'completed',
  'turnaround',
  'acceptance',
] as const;
export type ReviewerSort = (typeof REVIEWER_SORTS)[number];

/** Name, email, affiliation and interests — what an editor remembers someone by. */
export function toSearchableReviewers(
  reviewers: readonly ReviewerDirectoryEntry[],
): SearchableReviewer[] {
  return reviewers.map((reviewer) => ({
    reviewer,
    tokens: tokenTexts(
      [
        reviewer.displayName,
        reviewer.email,
        reviewer.affiliation,
        reviewer.reviewKeywords,
      ]
        .filter(Boolean)
        .join(' '),
    ),
  }));
}

function matchesFilter(
  reviewer: ReviewerDirectoryEntry,
  filter: ReviewerFilter,
): boolean {
  switch (filter) {
    case 'invitable':
      return reviewer.blockReason === null;
    case 'available':
      return reviewer.availability.available;
    case 'unavailable':
      return !reviewer.availability.available;
    default:
      return true;
  }
}

/**
 * Lower is better for load and turnaround, higher for the rest. A reviewer
 * with no data for the sort key goes last rather than first: "no reviews yet"
 * is not the fastest turnaround.
 */
function compareBy(
  sort: ReviewerSort,
  locale: string,
): (a: ReviewerDirectoryEntry, b: ReviewerDirectoryEntry) => number {
  const byName = (a: ReviewerDirectoryEntry, b: ReviewerDirectoryEntry) =>
    a.displayName.localeCompare(b.displayName, locale);
  const nullsLast =
    (
      pick: (r: ReviewerDirectoryEntry) => number | null,
      direction: 'asc' | 'desc',
    ) =>
    (a: ReviewerDirectoryEntry, b: ReviewerDirectoryEntry) => {
      const x = pick(a);
      const y = pick(b);
      if (x === y) return byName(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      return direction === 'asc' ? x - y : y - x;
    };
  switch (sort) {
    case 'load':
      return nullsLast((r) => r.capacity.active, 'asc');
    case 'completed':
      return nullsLast((r) => r.stats.completed, 'desc');
    case 'turnaround':
      return nullsLast((r) => r.stats.avgDaysToComplete, 'asc');
    case 'acceptance':
      return nullsLast((r) => r.stats.acceptanceRate, 'desc');
    default:
      return byName;
  }
}

export function filterAndSortReviewers(
  searchable: readonly SearchableReviewer[],
  opts: {
    query: string;
    filter: ReviewerFilter;
    sort: ReviewerSort;
    locale: string;
  },
): ReviewerDirectoryEntry[] {
  const queryTokens = tokenTexts(opts.query);
  return searchable
    .filter(({ tokens }) => matchesTokens(tokens, queryTokens))
    .map(({ reviewer }) => reviewer)
    .filter((r) => matchesFilter(r, opts.filter))
    .sort(compareBy(opts.sort, opts.locale));
}

/** First three interests, from the free-text comma list reviewers type. */
export function reviewerKeywordList(
  keywords: string | null,
  limit = 3,
): string[] {
  if (!keywords) return [];
  return keywords
    .split(/[,،;\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function reviewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * How full the reviewer is, for the meter's severity: `ok` below two thirds
 * of the limit, `high` from there, `full` at the limit. Null when there is no
 * limit — an unlimited reviewer has nothing to fill.
 */
export function reviewerLoadLevel(capacity: {
  active: number;
  max: number | null;
}): 'ok' | 'high' | 'full' | null {
  if (capacity.max == null) return null;
  if (capacity.active >= capacity.max) return 'full';
  if (capacity.active / capacity.max >= 2 / 3) return 'high';
  return 'ok';
}

export function formatPercent(n: number | null): string | null {
  return n == null ? null : `${Math.round(n * 100)}%`;
}
