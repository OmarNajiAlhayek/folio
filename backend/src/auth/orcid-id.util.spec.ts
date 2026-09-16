import {
  normalizeOrcidId,
  normalizeValidOrcidId,
  orcidCheckCharacter,
  orcidUriToId,
} from './orcid-id.util';

describe('orcid-id.util', () => {
  it('computes the check character ORCID documents for its test record', () => {
    expect(orcidCheckCharacter('000000021825009')).toBe('7');
    expect(normalizeValidOrcidId('0000-0002-1825-0097')).toBe(
      '0000-0002-1825-0097',
    );
  });

  it('accepts X as a check character', () => {
    expect(normalizeValidOrcidId('0000-0000-0000-001x')).toBe(
      '0000-0000-0000-001X',
    );
  });

  it('rejects a well-shaped iD whose check character is wrong', () => {
    expect(normalizeOrcidId('0000-0002-1825-0098')).toBe('0000-0002-1825-0098');
    expect(normalizeValidOrcidId('0000-0002-1825-0098')).toBeNull();
  });

  it('normalizes valid ORCID iD', () => {
    expect(normalizeOrcidId('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
    expect(normalizeOrcidId('0000-0002-1825-009x')).toBe('0000-0002-1825-009X');
  });

  it('rejects invalid ORCID iD', () => {
    expect(normalizeOrcidId('not-an-orcid')).toBeNull();
  });

  it('extracts ORCID from URI', () => {
    expect(orcidUriToId('https://orcid.org/0000-0001-5109-3700')).toBe(
      '0000-0001-5109-3700',
    );
  });
});
