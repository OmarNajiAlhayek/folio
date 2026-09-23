import { describe, expect, it } from 'vitest';
import type { PortalJournal } from '@/lib/journal-types';
import {
  filterJournals,
  journalDisciplines,
  toSearchableJournals,
} from './journal-directory-filter';

function journal(over: Partial<PortalJournal>): PortalJournal {
  return {
    slug: 'engj',
    titleAr: 'مجلة الهندسة', // مجلة الهندسة
    titleEn: 'Journal of Engineering Sciences',
    disciplineLabel: 'العلوم الهندسية', // العلوم الهندسية
    issn: null,
    eissn: null,
    descriptionAr: null,
    descriptionEn: null,
    articleCount: 0,
    latestIssue: null,
    ...over,
  };
}

const JOURNALS: PortalJournal[] = [
  journal({}),
  journal({
    slug: 'medj',
    titleAr: 'مجلة الطب', // مجلة الطب
    titleEn: 'Journal of Medical Sciences',
    disciplineLabel: 'العلوم الطبية', // العلوم الطبية
    descriptionEn: 'Clinical research and public health.',
  }),
  journal({
    slug: 'lawj',
    titleAr: 'مجلة الحقوق', // مجلة الحقوق
    titleEn: 'Journal of Law',
    disciplineLabel: 'العلوم القانونية', // العلوم القانونية
  }),
];

const searchable = toSearchableJournals(JOURNALS);
const slugs = (rows: PortalJournal[]) => rows.map((r) => r.slug);

describe('filterJournals', () => {
  it('returns everything when no filter is set', () => {
    expect(filterJournals(searchable, {})).toHaveLength(3);
    expect(filterJournals(searchable, { q: '   ' })).toHaveLength(3);
  });

  it('matches an English title', () => {
    expect(slugs(filterJournals(searchable, { q: 'medical' }))).toEqual(['medj']);
  });

  it('matches while the word is still being typed', () => {
    expect(slugs(filterJournals(searchable, { q: 'engin' }))).toEqual(['engj']);
  });

  it('matches an Arabic title spelled without the definite article', () => {
    // هندسة finds مجلة الهندسة
    expect(
      slugs(filterJournals(searchable, { q: 'هندسة' })),
    ).toEqual(['engj']);
  });

  it('matches an Arabic title spelled with ha instead of ta-marbuta', () => {
    // هندسه — the spelling people actually type
    expect(
      slugs(filterJournals(searchable, { q: 'هندسه' })),
    ).toEqual(['engj']);
  });

  it('ignores harakat in the query', () => {
    // الطِّب
    expect(
      slugs(filterJournals(searchable, { q: 'الطِّب' })),
    ).toEqual(['medj']);
  });

  it('ignores tatweel in the query', () => {
    // طــــب
    expect(
      slugs(filterJournals(searchable, { q: 'طــــب' })),
    ).toEqual(['medj']);
  });

  it('searches the other language too, whatever the reader is browsing in', () => {
    expect(slugs(filterJournals(searchable, { q: 'law' }))).toEqual(['lawj']);
    expect(
      slugs(filterJournals(searchable, { q: 'الحقوق' })),
    ).toEqual(['lawj']);
  });

  it('searches the description and the slug', () => {
    expect(slugs(filterJournals(searchable, { q: 'clinical' }))).toEqual(['medj']);
    expect(slugs(filterJournals(searchable, { q: 'lawj' }))).toEqual(['lawj']);
  });

  it('requires every word of a multi-word query', () => {
    expect(slugs(filterJournals(searchable, { q: 'journal medical' }))).toEqual([
      'medj',
    ]);
    expect(filterJournals(searchable, { q: 'journal chemistry' })).toEqual([]);
  });

  it('filters by discipline exactly', () => {
    const medicine = 'العلوم الطبية';
    expect(slugs(filterJournals(searchable, { discipline: medicine }))).toEqual([
      'medj',
    ]);
  });

  it('combines text and discipline', () => {
    const medicine = 'العلوم الطبية';
    expect(
      slugs(filterJournals(searchable, { q: 'journal', discipline: medicine })),
    ).toEqual(['medj']);
    expect(
      filterJournals(searchable, { q: 'engineering', discipline: medicine }),
    ).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterJournals(searchable, { q: 'astrophysics' })).toEqual([]);
  });

  it('preserves the order the server sent', () => {
    expect(slugs(filterJournals(searchable, { q: 'journal' }))).toEqual([
      'engj',
      'medj',
      'lawj',
    ]);
  });
});

describe('journalDisciplines', () => {
  it('lists each discipline once', () => {
    expect(journalDisciplines(JOURNALS, 'ar')).toHaveLength(3);
    expect(journalDisciplines([...JOURNALS, JOURNALS[0]], 'ar')).toHaveLength(3);
  });

  it('returns nothing for an empty directory', () => {
    expect(journalDisciplines([], 'en')).toEqual([]);
  });
});
