export type ClassifyArticleResponse = {
  top_label: string;
  top_confidence: number;
  probabilities: Record<string, number>;
};

export type DisciplineClassificationJson = {
  probabilities: Record<string, number>;
  classifiedAt: string;
  scopeInJournal: boolean;
  scopeWarning: string | null;
};

export type SimilarArticleHit = {
  article_id: string;
  abstract: string;
  keywords: string;
  category: string;
  similarity: number;
};

export type SemanticSearchHit = {
  article_id: string;
  snippet: string;
  score: number;
};

export type SuggestKeywordsInput = {
  title?: string;
  abstract?: string;
  titleAr?: string;
  abstractAr?: string;
};

export type SuggestKeywordsResponse = {
  keywords_en: string[];
  keywords_ar: string[];
};

export type SuggestKeywordsOutcome =
  | { status: 'ok'; data: SuggestKeywordsResponse }
  | { status: 'unavailable' }
  | { status: 'failed' };

export type CorpusSimilarityMatch = {
  submissionChunkIndex: number;
  submissionSnippet: string;
  sourceArticleId: string;
  sourceChunkIndex: number;
  matchedSnippet: string;
  similarity: number;
};

export type ReviewerProfileIndexInput = {
  reviewerId: string;
  affiliation?: string;
  reviewKeywords?: string;
  displayName?: string;
};

export type ReviewHistoryIndexInput = {
  reviewerId: string;
  submissionId: string;
  abstract: string;
  keywords: string;
};

export type ReviewerSuggestionHit = {
  reviewer_id: string;
  final_score: number;
  bio_score: number;
  history_score: number;
  ce_bio_score?: number;
  ce_history_score?: number;
  used_cross_encoder: boolean;
};

export type SuggestReviewersInput = {
  queryText: string;
  limit?: number;
  candidateIds?: string[];
  excludeReviewerIds?: string[];
  indexProfiles?: ReviewerProfileIndexInput[];
  indexHistory?: ReviewHistoryIndexInput[];
  useCrossEncoder?: boolean;
};

export type SuggestReviewersOutcome =
  | { status: 'ok'; hits: ReviewerSuggestionHit[] }
  | { status: 'unavailable' }
  | { status: 'failed' };
