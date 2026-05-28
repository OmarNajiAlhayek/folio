import type { Submission } from '../entities/submission.entity';

/** Minimum query length before calling reviewer matching. */
export const MIN_REVIEWER_MATCH_QUERY_CHARS = 20;

/** Build abstract+keywords text for reviewer similarity (EN and AR when present). */
export function buildReviewerMatchQueryText(s: Submission): string {
  const parts: string[] = [];
  const push = (value: string | null | undefined) => {
    const t = value?.trim();
    if (t) parts.push(t);
  };

  push(s.abstract);
  push(s.abstractAr);
  push(s.keywords);
  push(s.keywordsAr);

  return parts.join('\n\n').trim();
}

export function isReviewerMatchQuerySufficient(query: string): boolean {
  return query.trim().length >= MIN_REVIEWER_MATCH_QUERY_CHARS;
}
