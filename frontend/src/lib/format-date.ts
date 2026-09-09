/**
 * Locale-aware medium date for catalog and workflow UI.
 *
 * Formatted in **UTC**, deliberately. Every caller passes a publication or
 * issue date, which is an editorial fact rather than a moment the reader was
 * present for: an article published on 12 March is published on 12 March in
 * Damascus and in Berlin alike. Left to the runtime zone it would instead be
 * formatted wherever the code happens to run — the server's zone on the
 * server-rendered public routes, the browser's in a client component — so a
 * date near midnight would name a different day depending on the reader, on
 * the host, or on whether the markup came from a server or a client render.
 *
 * It also keeps the visible date in step with `citation_publication_date`,
 * which `citation-meta.ts` builds from `getUTCFullYear()`/`getUTCMonth()`/
 * `getUTCDate()`. Google Scholar reads the tag and the reader reads the page;
 * they should not disagree.
 *
 * A genuine moment — "this comment was posted at" — wants the reader's own
 * zone and should not use this helper.
 */
export function formatMediumDate(
  iso: string | null | undefined,
  locale: string,
): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
