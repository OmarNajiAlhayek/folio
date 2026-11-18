/**
 * Canonical Damascus University journals. The author picks a real journal
 * before submit.
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
    titleAr: 'مجلة جامعة دمشق للآداب والعلوم الإنسانية',
    titleEn: 'Damascus University Journal for Arts and Humanities',
    issn: '1818-5010',
    eissn: '2789-6552',
    sortOrder: 1,
  },
  {
    slug: 'hisj',
    titleAr: 'مجلة جامعة دمشق للدراسات التاريخية',
    titleEn: 'Damascus University Journal for Historical Studies',
    sortOrder: 2,
  },
  {
    slug: 'basj',
    titleAr: 'مجلة جامعة دمشق للعلوم الأساسية',
    titleEn: 'Damascus University Journal for Basic Sciences',
    issn: '1726-5487',
    eissn: '2789-6366',
    sortOrder: 3,
  },
  {
    slug: 'econj',
    titleAr: 'مجلة جامعة دمشق للعلوم الاقتصادية والسياسية',
    titleEn: 'Damascus University Journal for Economic and Political Sciences',
    eissn: '2789-8202',
    sortOrder: 4,
  },
  {
    slug: 'eduj',
    titleAr: 'مجلة جامعة دمشق للعلوم التربوية والنفسية',
    titleEn:
      'Damascus University Journal for Educational and Psychological Sciences',
    sortOrder: 5,
  },
  {
    slug: 'agrj',
    titleAr: 'مجلة جامعة دمشق للعلوم الزراعية',
    titleEn: 'Damascus University Journal for Agricultural Sciences',
    sortOrder: 6,
  },
  {
    slug: 'medj',
    titleAr: 'مجلة جامعة دمشق للعلوم الطبية',
    titleEn: 'Damascus University Journal for Medical Sciences',
    issn: '2072-2265',
    eissn: '2789-6889',
    sortOrder: 7,
  },
  {
    slug: 'lawj',
    titleAr: 'مجلة جامعة دمشق للعلوم القانونية',
    titleEn: 'Damascus University Journal for Legal Sciences',
    eissn: '2789-7621',
    sortOrder: 8,
  },
  {
    slug: 'engj',
    titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
    titleEn: 'Damascus University Journal for Engineering Sciences',
    issn: '1999-7302',
    eissn: '2789-6854',
    sortOrder: 9,
  },
] as const;

/** Widest catch-all journal, used when backfilling rows that have none. */
export const JOURNAL_FALLBACK_SLUG = 'basj';

export const JOURNAL_SLUGS = JOURNAL_CATALOG.map((j) => j.slug);

export function journalEntryForSlug(slug: string): JournalCatalogEntry | null {
  return JOURNAL_CATALOG.find((j) => j.slug === slug) ?? null;
}
