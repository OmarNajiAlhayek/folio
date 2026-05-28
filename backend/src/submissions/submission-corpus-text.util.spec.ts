import { buildSubmissionCorpusPlainText, isCorpusPlainTextSufficient } from './submission-corpus-text.util';
import type { Submission } from '../entities/submission.entity';

describe('submission-corpus-text.util', () => {
  it('falls back to title abstract keywords', () => {
    const plain = buildSubmissionCorpusPlainText({
      title: 'English title',
      abstract: 'English abstract with enough words for corpus check.',
      keywords: 'science, research',
      constructorContent: null,
    } as Submission);
    expect(plain).toContain('English title');
    expect(isCorpusPlainTextSufficient(plain)).toBe(true);
  });

  it('skips references sections in constructor', () => {
    const plain = buildSubmissionCorpusPlainText({
      title: '',
      abstract: '',
      constructorContent: {
        sections: [
          {
            id: 'r1',
            kind: 'references',
            items: [{ id: 'x', text: 'Very long shared bibliography entry.' }],
          },
          {
            id: 'p1',
            kind: 'paragraph',
            html: '<p>Unique manuscript body paragraph.</p>',
          },
        ],
      },
    } as Submission);
    expect(plain).toContain('Unique manuscript');
    expect(plain).not.toContain('bibliography');
  });
});
