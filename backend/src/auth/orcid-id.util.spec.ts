import { normalizeOrcidId, orcidUriToId } from './orcid-id.util';

describe('orcid-id.util', () => {
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
