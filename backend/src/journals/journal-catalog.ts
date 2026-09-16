import {
  ARABIC_DISCIPLINE_LABELS,
  DISCIPLINE_UNSPECIFIED_LABEL,
  type ArabicDisciplineLabel,
} from '../ai/discipline-labels';

/**
 * Canonical Damascus University journals — one row per AraBERT classifier
 * label, so a classification result maps to exactly one journal and no second
 * taxonomy exists. `غير محدد` is not a journal: the classifier may still emit
 * it, but the author must pick a real journal before submit.
 *
 * Slugs mirror the DU OJS path style and are part of the public URL contract
 * (`/journals/engj/issues/2026/3`) — treat them as frozen.
 *
 * Consumed by the `MultiJournalIssues` migration (which inserts these rows so
 * the FK is satisfiable on any database) and by `seed.ts` (which looks them up
 * by slug rather than re-creating them).
 */
export type JournalCatalogEntry = {
  slug: string;
  disciplineLabel: ArabicDisciplineLabel;
  titleAr: string;
  titleEn: string;
  sortOrder: number;
  /**
   * ISSN of the **print** edition and `eissn` of the **electronic** one — two
   * different numbers for the same title, which is why both columns exist.
   * Omitted where Damascus University has not supplied one; omitted is the
   * only honest state, and every consumer already renders nothing for null
   * (`citation_issn`, `dc:source`, the journal page, the JSON-LD Periodical).
   *
   * Source: the university's official ISSN table, supplied 2026-09-12.
   *
   * **Initial values only**, like the titles above. Since 2026-09-14 the
   * journal manager edits titles, and the journal manager or each journal's
   * editor-in-chief edits ISSNs and aims and scope, in the app
   * (`JournalMetadataService`). The database is the source of truth, so a
   * number added here never reaches a deployed database — enter it in the app.
   */
  issn?: string;
  eissn?: string;
};

export const JOURNAL_CATALOG: readonly JournalCatalogEntry[] = [
  {
    slug: 'artsj',
    disciplineLabel: 'الآداب والعلوم الإنسانية',
    titleAr: 'مجلة جامعة دمشق للآداب والعلوم الإنسانية',
    titleEn: 'Damascus University Journal for Arts and Humanities',
    issn: '1818-5010',
    eissn: '2789-6552',
    sortOrder: 1,
  },
  {
    slug: 'hisj',
    disciplineLabel: 'الدراسات التاريخية',
    titleAr: 'مجلة جامعة دمشق للدراسات التاريخية',
    titleEn: 'Damascus University Journal for Historical Studies',
    sortOrder: 2,
  },
  {
    slug: 'basj',
    disciplineLabel: 'العلوم الأساسية',
    titleAr: 'مجلة جامعة دمشق للعلوم الأساسية',
    titleEn: 'Damascus University Journal for Basic Sciences',
    issn: '1726-5487',
    eissn: '2789-6366',
    sortOrder: 3,
  },
  {
    slug: 'econj',
    disciplineLabel: 'العلوم الاقتصادية والسياسية',
    titleAr: 'مجلة جامعة دمشق للعلوم الاقتصادية والسياسية',
    titleEn: 'Damascus University Journal for Economic and Political Sciences',
    eissn: '2789-8202',
    sortOrder: 4,
  },
  {
    slug: 'eduj',
    disciplineLabel: 'العلوم التربوية والنفسية',
    titleAr: 'مجلة جامعة دمشق للعلوم التربوية والنفسية',
    titleEn:
      'Damascus University Journal for Educational and Psychological Sciences',
    sortOrder: 5,
  },
  {
    slug: 'agrj',
    disciplineLabel: 'العلوم الزراعية',
    titleAr: 'مجلة جامعة دمشق للعلوم الزراعية',
    titleEn: 'Damascus University Journal for Agricultural Sciences',
    sortOrder: 6,
  },
  {
    slug: 'medj',
    disciplineLabel: 'العلوم الطبية',
    titleAr: 'مجلة جامعة دمشق للعلوم الطبية',
    titleEn: 'Damascus University Journal for Medical Sciences',
    issn: '2072-2265',
    eissn: '2789-6889',
    sortOrder: 7,
  },
  {
    slug: 'lawj',
    disciplineLabel: 'العلوم القانونية',
    titleAr: 'مجلة جامعة دمشق للعلوم القانونية',
    titleEn: 'Damascus University Journal for Legal Sciences',
    eissn: '2789-7621',
    sortOrder: 8,
  },
  {
    slug: 'engj',
    disciplineLabel: 'العلوم الهندسية',
    titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
    titleEn: 'Damascus University Journal for Engineering Sciences',
    issn: '1999-7302',
    eissn: '2789-6854',
    sortOrder: 9,
  },
] as const;

/**
 * Journal used when a submission has no usable classifier label — the widest
 * catch-all rather than a synthetic "unspecified" journal, which would
 * reintroduce `غير محدد` as a publishable home.
 */
export const JOURNAL_FALLBACK_SLUG = 'basj';

export const JOURNAL_SLUGS = JOURNAL_CATALOG.map((j) => j.slug);

export function journalEntryForDisciplineLabel(
  label: string | null | undefined,
): JournalCatalogEntry | null {
  if (!label || label === DISCIPLINE_UNSPECIFIED_LABEL) {
    return null;
  }
  return JOURNAL_CATALOG.find((j) => j.disciplineLabel === label) ?? null;
}

export function journalEntryForSlug(slug: string): JournalCatalogEntry | null {
  return JOURNAL_CATALOG.find((j) => j.slug === slug) ?? null;
}

/**
 * Guard against the catalog and the classifier drifting apart: every label
 * except `غير محدد` must have exactly one journal.
 */
export function assertJournalCatalogMatchesDisciplines(): void {
  const expected: string[] = ARABIC_DISCIPLINE_LABELS.filter(
    (l) => l !== DISCIPLINE_UNSPECIFIED_LABEL,
  );
  const actual: string[] = JOURNAL_CATALOG.map((j) => j.disciplineLabel);
  const missing = expected.filter((l) => !actual.includes(l));
  const extra = actual.filter((l) => !expected.includes(l));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Journal catalog is out of sync with classifier labels (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`,
    );
  }
}
