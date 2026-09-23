import {
  highlightSegments,
  matchRanges,
  matchesQuery,
  matchesTokens,
  mergeRanges,
  normalizeText,
  normalizeToken,
  tokenTexts,
  tokenize,
} from './search-normalize';
import fixture from './search-normalize.fixture.json';

type FixtureCase = {
  name: string;
  input: string;
  normalized: string;
  tokens: { text: string; start: number; end: number }[];
};

const cases = fixture as FixtureCase[];

/**
 * The fixture is generated from `arabic_normalize.py`, which is the reference
 * implementation. A failure here means this port drifted from the Python service,
 * not that the expectation is wrong — fix the port, or regenerate both together.
 */
describe('parity with the Python reference implementation', () => {
  it.each(cases.map((c) => [c.name, c] as const))(
    '%s: normalizeText',
    (_name, c) => {
      expect(normalizeText(c.input)).toBe(c.normalized);
    },
  );

  it.each(cases.map((c) => [c.name, c] as const))(
    '%s: tokenize',
    (_name, c) => {
      expect(tokenize(c.input)).toEqual(c.tokens);
    },
  );

  it('covers every fold the normalizer performs', () => {
    // Guards against someone trimming the fixture until it passes.
    const names = new Set(cases.map((c) => c.name));
    for (const required of [
      'hamza-above',
      'ta-marbuta',
      'alef-maqsura',
      'harakat',
      'tatweel',
      'arabic-indic-digits',
      'farsi-ya-keheh',
    ]) {
      expect(names).toContain(required);
    }
  });
});

describe('normalizeToken', () => {
  it('folds the spellings of a name to one form', () => {
    expect(normalizeToken('أحمد')).toBe(
      normalizeToken('احمد'),
    );
    expect(normalizeToken('إبراهيم')).toBe(
      normalizeToken('ابراهيم'),
    );
  });

  it('folds ta-marbuta to ha, so the two spellings of a word agree', () => {
    expect(normalizeToken('مدرسة')).toBe(
      normalizeToken('مدرسه'),
    );
  });

  it('folds Arabic-Indic digits to ASCII', () => {
    expect(normalizeToken('٢٠٢٤')).toBe('2024');
    expect(normalizeToken('۲۰۲۴')).toBe('2024');
  });

  it('returns empty when nothing matchable survives', () => {
    expect(normalizeToken('')).toBe('');
    expect(normalizeToken('!!!')).toBe('');
    expect(normalizeToken('ً')).toBe('');
    expect(normalizeToken('ء')).toBe('');
  });
});

describe('tokenize offsets', () => {
  it('indexes the original string, not the folded one', () => {
    // الهندسة, fully voweled
    const text = 'الْهَنْدَسَة';
    const [token] = tokenize(text);
    // The folded form is shorter than the source, but the span still covers it.
    expect(token.text.length).toBeLessThan(text.length);
    expect(text.slice(token.start, token.end)).toBe(text);
  });

  it('keeps harakat inside a token rather than splitting on them', () => {
    const text = 'الْهَنْدَسَة';
    expect(tokenize(text)).toHaveLength(1);
  });

  it('lets a caller slice the original text back out', () => {
    const text = 'Journal of الهندسة 2024';
    for (const token of tokenize(text)) {
      expect(normalizeToken(text.slice(token.start, token.end))).toBe(token.text);
    }
  });
});

describe('matchesQuery', () => {
  it('matches across spelling variants', () => {
    const title = 'مجلة الهندسة';
    expect(matchesQuery(title, 'هندسه')).toBe(true);
    expect(matchesQuery(title, 'الهندسه')).toBe(true);
    expect(
      matchesQuery('أحمد الشامي', 'احمد'),
    ).toBe(true);
  });

  it('prefix-matches, because the box is read while it is typed', () => {
    expect(matchesQuery('Journal of Engineering', 'eng')).toBe(true);
    expect(matchesQuery('Journal of Engineering', 'jour eng')).toBe(true);
  });

  it('is order-insensitive but requires every token', () => {
    expect(matchesQuery('Journal of Engineering', 'engineering journal')).toBe(true);
    expect(matchesQuery('Journal of Engineering', 'journal medicine')).toBe(false);
  });

  it('can require whole-token matches', () => {
    expect(matchesQuery('Journal of Engineering', 'eng', { prefix: false })).toBe(false);
    expect(
      matchesQuery('Journal of Engineering', 'engineering', { prefix: false }),
    ).toBe(true);
  });

  it('matches everything on an empty or punctuation-only query', () => {
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('anything', '   ')).toBe(true);
    expect(matchesQuery('anything', '!!!')).toBe(true);
  });

  it('ignores the Arabic definite article on either side', () => {
    const withArticle = 'الهندسة'; // الهندسة
    const withoutArticle = 'هندسة'; // هندسة
    expect(matchesQuery(withArticle, withoutArticle)).toBe(true);
    expect(matchesQuery(withoutArticle, withArticle)).toBe(true);
    expect(matchesQuery(withArticle, withArticle)).toBe(true);
  });

  it('does not strip alef-lam when too little of the word would remain', () => {
    // الم -> stripping would leave a single letter, which matches far too much.
    expect(matchesQuery('طب', 'الم', { prefix: false })).toBe(false);
  });

  it('still requires the rest of the query to match', () => {
    const title = 'مجلة الهندسة'; // مجلة الهندسة
    expect(matchesQuery(title, 'هندسة طب')).toBe(false);
  });

  it('ignores diacritics and tatweel in the query itself', () => {
    const plain = 'الهندسة';
    const voweled = 'الْهَنْدَسَة';
    const stretched = 'هنـــدسة';
    expect(matchesQuery(plain, voweled)).toBe(true);
    expect(matchesQuery(plain, stretched)).toBe(true);
  });
});

describe('matchesTokens', () => {
  it('agrees with matchesQuery when given pre-tokenized input', () => {
    const docTokens = tokenTexts('مجلة الهندسة');
    expect(matchesTokens(docTokens, tokenTexts('هندسه'))).toBe(true);
    expect(matchesTokens(docTokens, tokenTexts('طب'))).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesTokens(['a'], [])).toBe(true);
  });
});

describe('mergeRanges', () => {
  it('sorts and merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        { start: 5, end: 8 },
        { start: 0, end: 3 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 8 },
    ]);
    expect(
      mergeRanges([
        { start: 0, end: 4 },
        { start: 2, end: 9 },
      ]),
    ).toEqual([{ start: 0, end: 9 }]);
    expect(
      mergeRanges([
        { start: 0, end: 4 },
        { start: 4, end: 9 },
      ]),
    ).toEqual([{ start: 0, end: 9 }]);
  });

  it('does not shrink a range contained in the previous one', () => {
    expect(
      mergeRanges([
        { start: 0, end: 10 },
        { start: 2, end: 5 },
      ]),
    ).toEqual([{ start: 0, end: 10 }]);
  });

  it('returns nothing for no ranges', () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

describe('matchRanges', () => {
  it('returns spans of the original text, diacritics included', () => {
    const text = 'مجلة الهندسة';
    const [range] = matchRanges(text, 'هندسه');
    expect(text.slice(range.start, range.end)).toBe(
      'الهندسة',
    );
  });

  it('highlights a word whose source carries harakat the query lacks', () => {
    const text = 'الْهَنْدَسَة';
    const [range] = matchRanges(text, 'هندسة');
    expect(text.slice(range.start, range.end)).toBe(text);
  });

  it('highlights the articled form when the query omits the article', () => {
    const text = 'مجلة الهندسة';
    const [range] = matchRanges(text, 'هندسة');
    // The article is part of the displayed word, so the whole word lights up.
    expect(text.slice(range.start, range.end)).toBe('الهندسة');
  });

  it('returns every matching token', () => {
    const text = 'Journal of Engineering Journal';
    expect(matchRanges(text, 'journal')).toEqual([
      { start: 0, end: 7 },
      { start: 23, end: 30 },
    ]);
  });

  it('returns nothing for an empty query or empty text', () => {
    expect(matchRanges('some text', '')).toEqual([]);
    expect(matchRanges('', 'query')).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('covers the whole string, in order', () => {
    const text = 'Journal of Engineering';
    const segments = highlightSegments(text, 'engineering');
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments).toEqual([
      { text: 'Journal of ', match: false },
      { text: 'Engineering', match: true },
    ]);
  });

  it('marks a leading match without emitting an empty segment', () => {
    expect(highlightSegments('Journal of Engineering', 'journal')).toEqual([
      { text: 'Journal', match: true },
      { text: ' of Engineering', match: false },
    ]);
  });

  it('round-trips the original text for Arabic with diacritics', () => {
    const text =
      'مجلة الْهَنْدَسَة التطبيقية';
    const segments = highlightSegments(text, 'هندسه');
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.match)).toHaveLength(1);
  });

  it('returns one unmatched segment when nothing matches', () => {
    expect(highlightSegments('Journal', 'medicine')).toEqual([
      { text: 'Journal', match: false },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(highlightSegments('', 'q')).toEqual([]);
  });
});
