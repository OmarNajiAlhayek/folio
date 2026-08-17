import type {
  CorpusSimilarityMatch,
  ExactMatchReport,
  ExactMatchSpan,
} from '../ai/ai-client.types';
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

/**
 * What the submissions table says about a corpus article id.
 *
 * `isPublished` is a confidentiality gate, not a display detail: a match against
 * a manuscript that is not published must never reach a report, because the
 * matched snippet is that manuscript's unpublished text. Index rows can outlive
 * a retraction or an unpublish, so the status is re-checked at query time rather
 * than trusted from the index.
 */
export type CorpusArticleLookup = {
  isPublished: boolean;
  slug: string | null;
  title: string;
  titleAr: string | null;
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

/** Exact-overlap stage as persisted in the job result and rendered to editors. */
export type ExactMatchStageReport = {
  enabled: true;
  totalTokens: number;
  matchedTokens: number;
  /** 0-100, de-duplicated across sources. */
  overallPercent: number;
  quotedTokens: number;
  referenceTokensSkipped: number;
  sources: ExactMatchReportSource[];
  suppressedCount: number;
  error?: string;
};

export type ExactMatchReportSource = {
  docId: string;
  sourceKind: string;
  title: string;
  sourceUrl: string;
  matchedTokens: number;
  overlapPercent: number;
  spans: ExactMatchSpan[];
  publication?: { slug: string; title: string; titleAr: string | null };
};

export type CorpusSimilarityReport =
  | { status: 'unavailable' }
  | { status: 'no_text' }
  | {
      status: 'ok';
      local: CorpusSimilarityStageReport<CorpusSimilaritySource> | null;
      web: CorpusSimilarityStageReport<WebSimilaritySource> | null;
      exact?: ExactMatchStageReport | null;
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

/** Distinct corpus article ids worth looking up in the submissions table. */
export function collectCorpusArticleIds(
  submission: Submission,
  matches: CorpusSimilarityMatch[],
): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.sourceArticleId === submission.id) continue;
    if (!isSimilarityCorpusArticleId(m.sourceArticleId)) continue;
    ids.add(m.sourceArticleId);
  }
  return [...ids];
}

export function aggregateCorpusSimilarityMatches(
  submission: Submission,
  matches: CorpusSimilarityMatch[],
  articlesById: Map<string, CorpusArticleLookup> = new Map(),
): Omit<
  CorpusSimilarityStageReport<CorpusSimilaritySource>,
  'enabled' | 'threshold'
> & { suppressedCount: number } {
  const byArticle = new Map<string, SourceAccumulator>();
  let filteredCount = 0;
  let suppressedCount = 0;

  for (const m of matches) {
    if (m.sourceArticleId === submission.id) continue;
    if (!isSimilarityCorpusArticleId(m.sourceArticleId)) continue;

    // A known submission that is not published is confidential — drop the match
    // entirely rather than reporting it without metadata. An id absent from the
    // map is not a Folio submission at all (back catalogue, open access, web),
    // which is a legitimate corpus source and stays.
    const known = articlesById.get(m.sourceArticleId);
    if (known && !known.isPublished) {
      suppressedCount++;
      continue;
    }
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
    suppressedCount,
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

/**
 * Attach publication details, and drop anything that resolves to an unpublished
 * submission.
 *
 * The drop duplicates the filter in `aggregateCorpusSimilarityMatches` on
 * purpose — this is the last step before a report is persisted, and a snippet of
 * someone's unpublished manuscript must not survive a future refactor that
 * forgets to pass the lookup map into the aggregator.
 */
/** Submission ids referenced by exact-match sources, for the published re-check. */
export function collectExactMatchSubmissionIds(
  report: ExactMatchReport,
): string[] {
  const ids = new Set<string>();
  for (const source of report.sources) {
    if (
      source.submissionId &&
      isSimilarityCorpusArticleId(source.submissionId)
    ) {
      ids.add(source.submissionId);
    }
  }
  return [...ids];
}

/**
 * Shape the exact-match stage for the report, dropping unpublished Folio sources.
 *
 * Same confidentiality rule as the semantic stage: a corpus entry that points at
 * a submission which is no longer published is another author's unpublished text,
 * so the whole source is dropped rather than shown without a link. Corpus entries
 * that are not Folio submissions at all (back catalogue, open access, web) carry
 * no `submissionId` and are always safe to show.
 */
export function buildExactMatchStage(
  report: ExactMatchReport,
  articlesById: Map<string, CorpusArticleLookup> = new Map(),
  error?: string,
): ExactMatchStageReport {
  const sources: ExactMatchReportSource[] = [];
  let suppressedCount = 0;
  let suppressedTokens = 0;

  for (const source of report.sources) {
    const known = source.submissionId
      ? articlesById.get(source.submissionId)
      : undefined;
    if (known && !known.isPublished) {
      suppressedCount++;
      suppressedTokens += source.matchedTokens;
      continue;
    }
    sources.push({
      docId: source.docId,
      sourceKind: source.sourceKind,
      title: source.title,
      sourceUrl: source.sourceUrl,
      matchedTokens: source.matchedTokens,
      overlapPercent: round2(source.overlapRatio * 100),
      spans: source.spans.slice(0, MAX_SNIPPETS_PER_SOURCE),
      ...(known?.slug
        ? {
            publication: {
              slug: known.slug,
              title: known.title,
              titleAr: known.titleAr,
            },
          }
        : {}),
    });
  }

  // The headline percentage counts distinct manuscript tokens, so it cannot be
  // recomputed by summing sources. Suppressed sources are subtracted at worst
  // case rather than left inflating the total.
  const matchedTokens = Math.max(0, report.matchedTokens - suppressedTokens);
  const totalTokens = report.totalTokens;

  return {
    enabled: true,
    totalTokens,
    matchedTokens,
    overallPercent:
      totalTokens > 0 ? round2((matchedTokens / totalTokens) * 100) : 0,
    quotedTokens: report.quotedTokens,
    referenceTokensSkipped: report.referenceTokensSkipped,
    sources: sources.slice(0, MAX_SOURCES),
    suppressedCount,
    ...(error ? { error } : {}),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function attachPublicationMetadata(
  sources: CorpusSimilaritySource[],
  articlesById: Map<string, CorpusArticleLookup>,
): CorpusSimilaritySource[] {
  const out: CorpusSimilaritySource[] = [];
  for (const src of sources) {
    const known = articlesById.get(src.articleId);
    if (known && !known.isPublished) continue;
    if (known?.slug) {
      out.push({
        ...src,
        publication: {
          slug: known.slug,
          title: known.title,
          titleAr: known.titleAr,
        },
      });
      continue;
    }
    out.push({ ...src, indexedOnly: true });
  }
  return out;
}
