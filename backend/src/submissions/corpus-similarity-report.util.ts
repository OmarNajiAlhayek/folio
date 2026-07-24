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

export type WebSimilaritySnippet = {
  querySnippet: string;
  matchedSnippet: string;
  similarity: number;
};

export type WebSimilaritySource = {
  sourceUrl: string;
  maxSimilarity: number;
  snippets: WebSimilaritySnippet[];
};

export type CorpusSimilarityStageReport<TSource> = {
  enabled: boolean;
  threshold: number;
  matchCount: number;
  sources: TSource[];
  error?: string;
};

export type CorpusSimilarityReport =
  | { status: 'unavailable' }
  | { status: 'no_text' }
  | {
      status: 'ok';
      local: CorpusSimilarityStageReport<CorpusSimilaritySource> | null;
      web: CorpusSimilarityStageReport<WebSimilaritySource> | null;
    };

const MAX_SOURCES = 10;
const MAX_SNIPPETS_PER_SOURCE = 3;

type SourceAccumulator = {
  articleId: string;
  maxSimilarity: number;
  snippets: CorpusSimilaritySnippet[];
};

type WebSourceAccumulator = {
  sourceUrl: string;
  maxSimilarity: number;
  snippets: WebSimilaritySnippet[];
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
): Omit<
  CorpusSimilarityStageReport<CorpusSimilaritySource>,
  'enabled' | 'threshold'
> {
  const byArticle = new Map<string, SourceAccumulator>();
  let filteredCount = 0;

  for (const m of matches) {
    if (m.sourceArticleId === submission.id) continue;
    if (!isSimilarityCorpusArticleId(m.sourceArticleId)) continue;
    filteredCount++;

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
    matchCount: filteredCount,
    sources,
  };
}

export function aggregateWebSimilarityMatches(
  matches: Array<{
    querySnippet: string;
    sourceUrl: string;
    matchedSnippet: string;
    similarity: number;
  }>,
): Omit<
  CorpusSimilarityStageReport<WebSimilaritySource>,
  'enabled' | 'threshold'
> {
  const byUrl = new Map<string, WebSourceAccumulator>();

  for (const m of matches) {
    let acc = byUrl.get(m.sourceUrl);
    if (!acc) {
      acc = {
        sourceUrl: m.sourceUrl,
        maxSimilarity: m.similarity,
        snippets: [
          {
            querySnippet: m.querySnippet,
            matchedSnippet: m.matchedSnippet,
            similarity: m.similarity,
          },
        ],
      };
      byUrl.set(m.sourceUrl, acc);
      continue;
    }
    acc.snippets.push({
      querySnippet: m.querySnippet,
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

  const sources: WebSimilaritySource[] = [...byUrl.values()]
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity)
    .slice(0, MAX_SOURCES)
    .map((acc) => ({
      sourceUrl: acc.sourceUrl,
      maxSimilarity: acc.maxSimilarity,
      snippets: acc.snippets,
    }));

  return {
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
