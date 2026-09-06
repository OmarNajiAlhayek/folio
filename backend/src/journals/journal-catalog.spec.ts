import { ARABIC_DISCIPLINE_LABELS } from '../ai/discipline-labels';
import {
  JOURNAL_CATALOG,
  JOURNAL_FALLBACK_SLUG,
  JOURNAL_SLUGS,
  assertJournalCatalogMatchesDisciplines,
  journalEntryForDisciplineLabel,
  journalEntryForSlug,
} from './journal-catalog';
import { journalSlugForSampleLabel } from './seed-journals';

describe('journal catalog', () => {
  it('stays 1:1 with every classifier label except غير محدد', () => {
    expect(() => assertJournalCatalogMatchesDisciplines()).not.toThrow();
    expect(JOURNAL_CATALOG).toHaveLength(ARABIC_DISCIPLINE_LABELS.length - 1);
  });

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

  it('maps a classifier label to exactly one journal', () => {
    const entry = journalEntryForDisciplineLabel('العلوم الهندسية');
    expect(entry?.slug).toBe('engj');
    expect(journalEntryForSlug('engj')?.disciplineLabel).toBe(
      'العلوم الهندسية',
    );
  });

  it('does not treat غير محدد as a journal', () => {
    expect(journalEntryForDisciplineLabel('غير محدد')).toBeNull();
    expect(journalEntryForDisciplineLabel(null)).toBeNull();
  });

  it('falls back to basj when a sample has no usable label', () => {
    expect(journalSlugForSampleLabel(null)).toBe('basj');
    expect(journalSlugForSampleLabel('غير محدد')).toBe('basj');
    expect(journalSlugForSampleLabel('العلوم القانونية')).toBe('lawj');
  });
});
