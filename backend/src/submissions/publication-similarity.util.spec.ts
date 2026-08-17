import {
  aggregateWebSimilarityMatches,
  attachPublicationMetadata,
  aggregateCorpusSimilarityMatches,
  buildExactMatchStage,
  collectExactMatchSubmissionIds,
} from './corpus-similarity-report.util';
import type { ExactMatchReport } from '../ai/ai-client.types';
import {
  isSimilarityCorpusArticleId,
  publicationSimilarityIndexPayload,
} from './publication-similarity.util';
import type { Submission } from '../entities/submission.entity';

function stubSubmission(overrides: Partial<Submission>): Submission {
  return {
    id: 'sub-1',
    title: 'Title',
    abstract: 'English abstract',
    abstractAr: null,
    keywords: 'kw',
    keywordsAr: null,
    disciplines: ['العلوم الطبية'],
    constructorContent: null,
    ...overrides,
  } as Submission;
}

describe('isSimilarityCorpusArticleId', () => {
  it('accepts submission UUIDs and rejects dev Chroma ids', () => {
    expect(
      isSimilarityCorpusArticleId('b7fe5822-c5ec-46c3-bf21-933eaae6dbc0'),
    ).toBe(true);
    expect(isSimilarityCorpusArticleId('pipe-2')).toBe(false);
  });
});

describe('publicationSimilarityIndexPayload', () => {
  it('prefers Arabic abstract when present', () => {
    const payload = publicationSimilarityIndexPayload(
      stubSubmission({ abstractAr: 'ملخص عربي' }),
    );
    expect(payload).toMatchObject({
      abstract: 'ملخص عربي',
      keywords: 'kw',
      category: 'العلوم الطبية',
    });
    expect(payload?.fullText).toContain('ملخص عربي');
  });

  it('includes constructor body in fullText', () => {
    const payload = publicationSimilarityIndexPayload(
      stubSubmission({
        abstractAr: 'ملخص',
        constructorContent: {
          sections: [
            {
              kind: 'paragraph',
              html: '<p>' + 'نص المقال '.repeat(20) + '</p>',
            },
          ],
        },
      }),
    );
    expect(payload?.fullText).toContain('نص المقال');
  });

  it('returns null when no abstract text', () => {
    expect(
      publicationSimilarityIndexPayload(
        stubSubmission({ abstract: '', abstractAr: null }),
      ),
    ).toBeNull();
  });
});

describe('aggregateWebSimilarityMatches', () => {
  it('groups by URL and keeps top snippets', () => {
    const aggregated = aggregateWebSimilarityMatches([
      {
        querySnippet: 'q1',
        sourceUrl: 'https://a.test',
        matchedSnippet: 'm1',
        similarity: 80,
      },
      {
        querySnippet: 'q2',
        sourceUrl: 'https://a.test',
        matchedSnippet: 'm2',
        similarity: 90,
      },
    ]);
    expect(aggregated.sources).toHaveLength(1);
    expect(aggregated.sources[0].maxSimilarity).toBe(90);
    expect(aggregated.sources[0].snippets).toHaveLength(2);
  });
});

describe('aggregateCorpusSimilarityMatches', () => {
  it('excludes self matches', () => {
    const submission = stubSubmission({ id: 'sub-1' });
    const aggregated = aggregateCorpusSimilarityMatches(submission, [
      {
        submissionChunkIndex: 0,
        submissionSnippet: 'x',
        sourceArticleId: 'sub-1',
        sourceChunkIndex: 0,
        matchedSnippet: 'x',
        similarity: 0.99,
      },
    ]);
    expect(aggregated.sources).toHaveLength(0);
  });
});

const PUBLISHED_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UNPUBLISHED_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

function corpusMatch(sourceArticleId: string, similarity = 0.9) {
  return {
    submissionChunkIndex: 0,
    submissionSnippet: 'x',
    sourceArticleId,
    sourceChunkIndex: 0,
    matchedSnippet: 'confidential manuscript text',
    similarity,
  };
}

describe('aggregateCorpusSimilarityMatches confidentiality gate', () => {
  it('drops matches against submissions that are no longer published', () => {
    const aggregated = aggregateCorpusSimilarityMatches(
      stubSubmission({ id: 'sub-1' }),
      [corpusMatch(UNPUBLISHED_ID)],
      new Map([
        [
          UNPUBLISHED_ID,
          { isPublished: false, slug: 'x', title: 'T', titleAr: null },
        ],
      ]),
    );
    expect(aggregated.sources).toHaveLength(0);
    expect(aggregated.matchCount).toBe(0);
    expect(aggregated.suppressedCount).toBe(1);
  });

  it('keeps corpus ids that are not Folio submissions at all', () => {
    const aggregated = aggregateCorpusSimilarityMatches(
      stubSubmission({ id: 'sub-1' }),
      [corpusMatch(PUBLISHED_ID)],
      new Map(),
    );
    expect(aggregated.sources).toHaveLength(1);
    expect(aggregated.suppressedCount).toBe(0);
  });
});

describe('attachPublicationMetadata', () => {
  it('adds publication when known', () => {
    const sources = aggregateCorpusSimilarityMatches(
      stubSubmission({ id: 'sub-1' }),
      [corpusMatch(PUBLISHED_ID)],
    ).sources;
    const out = attachPublicationMetadata(
      sources,
      new Map([
        [
          PUBLISHED_ID,
          { isPublished: true, slug: 'pub-1', title: 'T', titleAr: null },
        ],
      ]),
    );
    expect(out[0].publication?.slug).toBe('pub-1');
  });

  it('marks unknown ids as indexed-only external corpus sources', () => {
    const sources = aggregateCorpusSimilarityMatches(
      stubSubmission({ id: 'sub-1' }),
      [corpusMatch(PUBLISHED_ID)],
    ).sources;
    const out = attachPublicationMetadata(sources, new Map());
    expect(out[0].indexedOnly).toBe(true);
    expect(out[0].publication).toBeUndefined();
  });

  it('strips unpublished sources even if the aggregator missed them', () => {
    const sources = aggregateCorpusSimilarityMatches(
      stubSubmission({ id: 'sub-1' }),
      [corpusMatch(UNPUBLISHED_ID)],
    ).sources;
    expect(sources).toHaveLength(1);

    const out = attachPublicationMetadata(
      sources,
      new Map([
        [
          UNPUBLISHED_ID,
          { isPublished: false, slug: 'x', title: 'T', titleAr: null },
        ],
      ]),
    );
    expect(out).toHaveLength(0);
  });
});

function exactSource(overrides: Record<string, unknown> = {}) {
  return {
    docId: 'doc-1',
    sourceKind: 'external_oa',
    sourceRef: 'oai:x',
    title: 'Harvested article',
    sourceUrl: 'https://journal.example/article/1',
    matchedTokens: 300,
    overlapRatio: 0.3,
    spans: [
      {
        submissionStartToken: 10,
        submissionEndToken: 40,
        submissionSnippet: 'نص',
        matchedSnippet: 'نص',
        tokenLength: 30,
        quoted: false,
      },
    ],
    ...overrides,
  };
}

function exactReport(
  sources: ReturnType<typeof exactSource>[],
): ExactMatchReport {
  return {
    totalTokens: 1000,
    matchedTokens: sources.reduce((n, s) => n + s.matchedTokens, 0),
    overallRatio: sources.reduce((n, s) => n + s.matchedTokens, 0) / 1000,
    quotedTokens: 0,
    referenceTokensSkipped: 120,
    sources,
  } as ExactMatchReport;
}

describe('buildExactMatchStage', () => {
  it('reports percentages from distinct manuscript tokens', () => {
    const stage = buildExactMatchStage(exactReport([exactSource()]));
    expect(stage.overallPercent).toBe(30);
    expect(stage.sources[0].overlapPercent).toBe(30);
    expect(stage.referenceTokensSkipped).toBe(120);
    expect(stage.suppressedCount).toBe(0);
  });

  it('keeps non-Folio corpus sources, which carry no submissionId', () => {
    const stage = buildExactMatchStage(exactReport([exactSource()]), new Map());
    expect(stage.sources).toHaveLength(1);
    expect(stage.sources[0].publication).toBeUndefined();
  });

  it('drops sources whose submission is no longer published', () => {
    const stage = buildExactMatchStage(
      exactReport([exactSource({ submissionId: UNPUBLISHED_ID })]),
      new Map([
        [
          UNPUBLISHED_ID,
          { isPublished: false, slug: 'x', title: 'T', titleAr: null },
        ],
      ]),
    );
    expect(stage.sources).toHaveLength(0);
    expect(stage.suppressedCount).toBe(1);
    // The headline must not keep counting tokens from a suppressed source.
    expect(stage.matchedTokens).toBe(0);
    expect(stage.overallPercent).toBe(0);
  });

  it('links published Folio sources to their publication', () => {
    const stage = buildExactMatchStage(
      exactReport([exactSource({ submissionId: PUBLISHED_ID })]),
      new Map([
        [
          PUBLISHED_ID,
          { isPublished: true, slug: 'pub-1', title: 'T', titleAr: null },
        ],
      ]),
    );
    expect(stage.sources[0].publication?.slug).toBe('pub-1');
  });

  it('passes through a stage error', () => {
    const stage = buildExactMatchStage(exactReport([]), new Map(), 'boom');
    expect(stage.error).toBe('boom');
  });
});

describe('collectExactMatchSubmissionIds', () => {
  it('returns only valid submission uuids, deduplicated', () => {
    const ids = collectExactMatchSubmissionIds(
      exactReport([
        exactSource({ submissionId: PUBLISHED_ID }),
        exactSource({ docId: 'doc-2', submissionId: PUBLISHED_ID }),
        exactSource({ docId: 'doc-3', submissionId: 'not-a-uuid' }),
        exactSource({ docId: 'doc-4' }),
      ]),
    );
    expect(ids).toEqual([PUBLISHED_ID]);
  });
});
