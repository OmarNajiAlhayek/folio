import {
  JOURNAL_CATALOG,
  JOURNAL_FALLBACK_SLUG,
  JOURNAL_SLUGS,
  journalEntryForSlug,
} from './journal-catalog';
import { journalSlugOrFallback } from './seed-journals';

describe('journal catalog', () => {
  it('keeps public slugs frozen', () => {
    expect(JOURNAL_SLUGS).toEqual([
      'artsj',
      'hisj',
      'basj',
      'econj',
      'eduj',
      'agrj',
      'medj',
      'lawj',
      'engj',
    ]);
    expect(JOURNAL_FALLBACK_SLUG).toBe('basj');
  });

  it('carries the ISSNs Damascus University supplied, and no others', () => {
    const numbers = Object.fromEntries(
      JOURNAL_CATALOG.map((j) => [j.slug, [j.issn ?? null, j.eissn ?? null]]),
    );
    expect(numbers).toEqual({
      artsj: ['1818-5010', '2789-6552'],
      hisj: [null, null],
      basj: ['1726-5487', '2789-6366'],
      econj: [null, '2789-8202'],
      eduj: [null, null],
      agrj: [null, null],
      medj: ['2072-2265', '2789-6889'],
      lawj: [null, '2789-7621'],
      engj: ['1999-7302', '2789-6854'],
    });
  });

  it('looks a journal up by slug', () => {
    expect(journalEntryForSlug('engj')?.titleEn).toBe(
      'Damascus University Journal for Engineering Sciences',
    );
    expect(journalEntryForSlug('nope')).toBeNull();
  });

  it('falls back to basj when a sample has no usable slug', () => {
    expect(journalSlugOrFallback(null)).toBe('basj');
    expect(journalSlugOrFallback('unknown')).toBe('basj');
    expect(journalSlugOrFallback('lawj')).toBe('lawj');
  });
});
