import {
  hasKeywordLanguagePair,
  normalizeKeywordSuggestions,
} from './keyword-list.util';

describe('keyword-list.util', () => {
  it('normalizeKeywordSuggestions dedupes English case-insensitively', () => {
    expect(
      normalizeKeywordSuggestions(['AI', 'ai', 'Science'], 'en'),
    ).toEqual(['AI', 'Science']);
  });

  it('hasKeywordLanguagePair requires both title and abstract', () => {
    expect(hasKeywordLanguagePair('Title', 'Abstract')).toBe(true);
    expect(hasKeywordLanguagePair('Title', '')).toBe(false);
    expect(hasKeywordLanguagePair(null, 'Abstract')).toBe(false);
  });
});
