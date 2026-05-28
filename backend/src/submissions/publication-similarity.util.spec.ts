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
    discipline: 'العلوم الطبية',
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
      fullText: expect.stringContaining('ملخص عربي'),
    });
  });

  it('returns null when no abstract text', () => {
    expect(
      publicationSimilarityIndexPayload(
        stubSubmission({ abstract: '', abstractAr: null }),
      ),
    ).toBeNull();
  });
});
