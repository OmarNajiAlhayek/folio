import type { ManuscriptStyleProfile } from './manuscript-style.types';

/**
 * In-text citation and reference-list convention.
 *
 * - `apa` — author–year citations `(Author, 2020)`; the list is sorted
 *   alphabetically (per the profile, Arabic entries first).
 * - `vancouver` — numbered citations `[1]`; the list is numbered in order of
 *   first citation, so the author's entry order is the order that must be kept.
 */
export type CitationStyle = 'apa' | 'vancouver';

/** Which style a journal requires, keyed by the journal's `disciplineLabel`. */
export interface CitationStyleRule {
  default: CitationStyle;
  byDisciplineLabel?: Readonly<Record<string, CitationStyle>>;
}

/**
 * Style for a manuscript whose journal has `journalDisciplineLabel`. Unknown or
 * absent journal (e.g. the standalone constructor) → the profile default, and
 * a profile without a rule → APA.
 */
export function resolveCitationStyle(
  profile: Pick<ManuscriptStyleProfile, 'references'>,
  journalDisciplineLabel: string | null | undefined,
): CitationStyle {
  const rule = profile.references.citationStyles;
  if (!rule) return 'apa';
  const label = journalDisciplineLabel?.trim();
  return (label && rule.byDisciplineLabel?.[label]) || rule.default;
}
