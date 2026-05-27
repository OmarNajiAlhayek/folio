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
