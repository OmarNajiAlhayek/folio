import type { CorpusSimilarityMatch } from '../ai/ai-client.types';
import type { Submission } from '../entities/submission.entity';
import { isSimilarityCorpusArticleId } from './publication-similarity.util';

export type CorpusSimilaritySnippet = {
  submissionSnippet: string;
  matchedSnippet: string;
  similarity: number;
};

export type CorpusSimilaritySource = {
  articleId: string;
  maxSimilarity: number;
  snippets: CorpusSimilaritySnippet[];
  publication?: { slug: string; title: string; titleAr: string | null };
  indexedOnly?: boolean;
};

export type CorpusSimilarityReport =
  | { status: 'unavailable' }
  | { status: 'no_text' }
  | {
      status: 'ok';
      threshold: number;
      matchCount: number;
      sources: CorpusSimilaritySource[];
    };

const MAX_SOURCES = 10;
const MAX_SNIPPETS_PER_SOURCE = 3;

type SourceAccumulator = {
  articleId: string;
  maxSimilarity: number;
  snippets: CorpusSimilaritySnippet[];
};

function upsertSnippet(acc: SourceAccumulator, m: CorpusSimilarityMatch): void {
  acc.snippets.push({
    submissionSnippet: m.submissionSnippet,
    matchedSnippet: m.matchedSnippet,
    similarity: m.similarity,
  });
  acc.snippets.sort((a, b) => b.similarity - a.similarity);
  if (acc.snippets.length > MAX_SNIPPETS_PER_SOURCE) {
    acc.snippets.length = MAX_SNIPPETS_PER_SOURCE;
  }
  if (m.similarity > acc.maxSimilarity) {
    acc.maxSimilarity = m.similarity;
  }
}

export function aggregateCorpusSimilarityMatches(
  submission: Submission,
  matches: CorpusSimilarityMatch[],
): Omit<Extract<CorpusSimilarityReport, { status: 'ok' }>, 'threshold'> {
  const byArticle = new Map<string, SourceAccumulator>();

  for (const m of matches) {
    if (m.sourceArticleId === submission.id) continue;
    if (!isSimilarityCorpusArticleId(m.sourceArticleId)) continue;

    let acc = byArticle.get(m.sourceArticleId);
    if (!acc) {
      acc = {
        articleId: m.sourceArticleId,
        maxSimilarity: m.similarity,
        snippets: [
          {
            submissionSnippet: m.submissionSnippet,
            matchedSnippet: m.matchedSnippet,
            similarity: m.similarity,
          },
        ],
      };
      byArticle.set(m.sourceArticleId, acc);
      continue;
    }
    upsertSnippet(acc, m);
  }

  const sources: CorpusSimilaritySource[] = [...byArticle.values()]
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity)
    .slice(0, MAX_SOURCES)
    .map((acc) => ({
      articleId: acc.articleId,
      maxSimilarity: acc.maxSimilarity,
      snippets: acc.snippets,
    }));

  return {
    status: 'ok',
    matchCount: matches.length,
    sources,
  };
}

export function attachPublicationMetadata(
  sources: CorpusSimilaritySource[],
  publishedById: Map<
    string,
    { slug: string; title: string; titleAr: string | null }
  >,
): CorpusSimilaritySource[] {
  return sources.map((src) => {
    const pub = publishedById.get(src.articleId);
    if (pub) {
      return { ...src, publication: pub };
    }
    return { ...src, indexedOnly: true };
  });
}
