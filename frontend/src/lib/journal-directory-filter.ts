import { matchesTokens, tokenTexts } from '@folio/shared/text/search-normalize';
import type { PortalJournal } from '@/lib/journal-types';

/** A journal plus its folded search tokens, so a keystroke re-folds only the query. */
export type SearchableJournal = {
  journal: PortalJournal;
  tokens: string[];
};

export type JournalDirectoryFilters = {
  q?: string;
  discipline?: string;
};

/**
 * Fields a directory search looks at.
 *
 * Both language variants are included regardless of the active locale: a reader
 * browsing in English may well type an Arabic title, and the directory is small
 * enough that searching everything costs nothing.
 */
function searchableText(journal: PortalJournal): string {
  return [
    journal.titleEn,
    journal.titleAr,
    journal.descriptionEn,
    journal.descriptionAr,
    journal.disciplineLabel,
    journal.slug,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Fold each journal once, up front — the list does not change while typing. */
export function toSearchableJournals(
  journals: readonly PortalJournal[],
): SearchableJournal[] {
  return journals.map((journal) => ({
    journal,
    tokens: tokenTexts(searchableText(journal)),
  }));
}

/**
 * Narrow the directory by free text and discipline.
 *
 * Text matching is Arabic-aware via the shared normalizer, so `هندسه` finds
 * `مجلة الهندسة` and `احمد` finds `أحمد`. Discipline is an exact match: it comes
 * from a picker whose options are built from this same list.
 */
export function filterJournals(
  searchable: readonly SearchableJournal[],
  filters: JournalDirectoryFilters,
): PortalJournal[] {
  const queryTokens = tokenTexts(filters.q ?? '');
  const discipline = filters.discipline?.trim();

  return searchable
    .filter(({ journal }) =>
      discipline ? journal.disciplineLabel === discipline : true,
    )
    .filter(({ tokens }) => matchesTokens(tokens, queryTokens))
    .map(({ journal }) => journal);
}

/** Discipline picker options, derived from the journals actually present. */
export function journalDisciplines(
  journals: readonly PortalJournal[],
  locale: string,
): string[] {
  const labels = [...new Set(journals.map((j) => j.disciplineLabel))].filter(
    Boolean,
  );
  return labels.sort((a, b) => a.localeCompare(b, locale));
}
