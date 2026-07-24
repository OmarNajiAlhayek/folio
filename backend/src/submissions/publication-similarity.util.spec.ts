import {
  aggregateWebSimilarityMatches,
  attachPublicationMetadata,
  aggregateCorpusSimilarityMatches,
} from './corpus-similarity-report.util';
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

describe('attachPublicationMetadata', () => {
  it('adds publication when known', () => {
    const sources = aggregateCorpusSimilarityMatches(
      stubSubmission({ id: 'sub-1' }),
      [
        {
          submissionChunkIndex: 0,
          submissionSnippet: 'x',
          sourceArticleId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          sourceChunkIndex: 0,
          matchedSnippet: 'y',
          similarity: 0.9,
        },
      ],
    ).sources;
    const out = attachPublicationMetadata(
      sources,
      new Map([
        [
          'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          { slug: 'pub-1', title: 'T', titleAr: null },
        ],
      ]),
    );
    expect(out[0].publication?.slug).toBe('pub-1');
  });
});
