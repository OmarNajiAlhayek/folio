import { issnCheckCharacter, normalizeIssn } from './issn.util';
import { JOURNAL_CATALOG } from './journal-catalog';

describe('issn.util', () => {
  it('accepts every number Damascus University supplied', () => {
    const numbers = JOURNAL_CATALOG.flatMap((j) => [j.issn, j.eissn]).filter(
      (n): n is string => Boolean(n),
    );
    expect(numbers).toHaveLength(10);
    for (const n of numbers) {
      expect(normalizeIssn(n)).toBe(n);
    }
  });

  it('writes a check value of 10 as X', () => {
    expect(issnCheckCharacter('0000006')).toBe('X');
    expect(normalizeIssn('0000-006x')).toBe('0000-006X');
  });

  it('restores a missing hyphen', () => {
    expect(normalizeIssn(' 18185010 ')).toBe('1818-5010');
  });

  it('rejects a wrong check digit', () => {
    expect(normalizeIssn('1818-5011')).toBeNull();
  });

  it('rejects transposed digits that still match the shape', () => {
    expect(normalizeIssn('8118-5010')).toBeNull();
  });

  it('rejects anything that is not just the number', () => {
    expect(normalizeIssn('ISSN 1818-5010')).toBeNull();
    expect(normalizeIssn('')).toBeNull();
  });
});
