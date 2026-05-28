import type { ReviewerSuggestionHit } from '../ai/ai-client.types';

export type SuggestedReviewerRow = {
  reviewerId: string;
  displayName: string;
  email: string;
  finalScore: number;
  bioScore: number;
  historyScore: number;
  ceBioScore?: number;
  ceHistoryScore?: number;
  usedCrossEncoder: boolean;
};

export type SuggestedReviewersReport =
  | { status: 'unavailable' }
  | { status: 'no_text' }
  | { status: 'no_candidates' }
  | { status: 'ok'; suggestions: SuggestedReviewerRow[] };

export function enrichReviewerSuggestions(
  hits: ReviewerSuggestionHit[],
  profilesById: Map<
    string,
    { displayName: string; email: string }
  >,
): SuggestedReviewerRow[] {
  const rows: SuggestedReviewerRow[] = [];
  for (const hit of hits) {
    const profile = profilesById.get(hit.reviewer_id);
    if (!profile) continue;
    rows.push({
      reviewerId: hit.reviewer_id,
      displayName: profile.displayName,
      email: profile.email,
      finalScore: hit.final_score,
      bioScore: hit.bio_score,
      historyScore: hit.history_score,
      ceBioScore: hit.ce_bio_score,
      ceHistoryScore: hit.ce_history_score,
      usedCrossEncoder: hit.used_cross_encoder,
    });
  }
  return rows;
}
