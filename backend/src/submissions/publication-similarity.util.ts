import type { Submission } from '../entities/submission.entity';

const SUBMISSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Chroma may retain dev/test ids; only Folio submission UUIDs are queryable in Postgres. */
export function isSimilarityCorpusArticleId(articleId: string): boolean {
  return SUBMISSION_UUID_RE.test(articleId);
}

/** Text bundle for indexing a published article in the similarity service. */
export function publicationSimilarityIndexPayload(s: Submission): {
  abstract: string;
  keywords: string;
  category: string;
  fullText: string;
} | null {
  const abstract = (s.abstractAr?.trim() || s.abstract?.trim() || '').trim();
  if (!abstract) {
    return null;
  }
  const keywords = [s.keywordsAr, s.keywords]
    .map((k) => k?.trim())
    .filter((k): k is string => !!k)
    .join(', ');
  const category = s.discipline?.trim() ?? '';
  const title = (s.titleAr?.trim() || s.title?.trim() || '').trim();
  const fullText = [title, abstract, keywords].filter(Boolean).join('\n\n');
  return { abstract, keywords, category, fullText };
}
