import { parseKeywordsFromStorage } from '@/lib/keywords';
import type { PublicationDetail } from '@/lib/publication-types';

/**
 * Google Scholar `citation_*` meta tags.
 *
 * Scholar does not execute JavaScript, so these must be present in the HTML the
 * server returns — which is the whole reason the public article route became a
 * server component. They are returned as a `Metadata['other']` record, whose
 * array values Next renders as repeated `<meta>` tags.
 *
 * Reference: Scholar's "Inclusion Guidelines for Webmasters", which specifies
 * this tag family (the same set Highwire Press emits).
 */

export type CitationMetaInput = {
  article: PublicationDetail;
  /** Absolute URL of the article page; tags are meaningless relative. */
  articleUrl: string | null;
  /** Absolute URL of a public PDF of record, when one exists. */
  pdfUrl: string | null;
};

/** Scholar expects `YYYY/MM/DD`, not ISO-8601. */
function scholarDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/**
 * The PDF of record, if the article has one published.
 *
 * Only files the backend already exposes publicly reach this list, so there is
 * nothing to re-authorise here — a retracted article has its public files
 * cleared, which is what makes the whole page vanish.
 */
export function findPublicPdf(article: PublicationDetail) {
  return (
    article.files?.find(
      (f) =>
        f.mimeType === 'application/pdf' ||
        f.originalName.toLowerCase().endsWith('.pdf'),
    ) ?? null
  );
}

export function authorNames(article: PublicationDetail): string[] {
  const fromList = (article.authors ?? [])
    .map((a) => a.fullName?.trim())
    .filter((n): n is string => Boolean(n));
  if (fromList.length > 0) return fromList;
  const fallback = article.author?.displayName?.trim();
  return fallback ? [fallback] : [];
}

/**
 * Builds the tag set. Every value is omitted rather than emitted empty: Scholar
 * treats a present-but-blank tag as a data error, and a wrong tag is worse than
 * an absent one.
 */
export function buildCitationMeta({
  article,
  articleUrl,
  pdfUrl,
}: CitationMetaInput): Record<string, string | string[]> {
  const meta: Record<string, string | string[]> = {};

  meta.citation_title = article.title;

  const authors = authorNames(article);
  if (authors.length > 0) meta.citation_author = authors;

  // citation_author_institution is deliberately NOT emitted. Scholar pairs an
  // institution with the author tag it *follows*, and Next renders `other` as
  // one group per key — so every institution would land after the last author
  // and be mis-attributed. Affiliations are carried per-author in the JSON-LD
  // instead, where the nesting is explicit and cannot be mis-associated.

  const published = scholarDate(article.publishedAt);
  if (published) {
    meta.citation_publication_date = published;
    meta.citation_online_date = published;
  }

  const journal = article.journal;
  if (journal) {
    meta.citation_journal_title = journal.titleEn;
    // Scholar accepts one ISSN; the electronic one identifies this edition.
    const issn = journal.eissn ?? journal.issn;
    if (issn) meta.citation_issn = issn;
  }

  const issue = article.issue;
  if (issue) {
    meta.citation_issue = String(issue.number);
    if (issue.volume != null) meta.citation_volume = String(issue.volume);
    // No citation_firstpage/lastpage: this platform publishes articles, not
    // paginated print galleys, and inventing page numbers would corrupt every
    // citation generated from them.
  }

  if (articleUrl) meta.citation_abstract_html_url = articleUrl;
  if (pdfUrl) meta.citation_pdf_url = pdfUrl;

  const keywords = [
    ...parseKeywordsFromStorage(article.keywords),
    ...parseKeywordsFromStorage(article.keywordsAr),
  ];
  if (keywords.length > 0) meta.citation_keywords = keywords.join('; ');

  // Both abstracts are always published, so the record is bilingual.
  meta.citation_language = ['en', 'ar'];

  meta.citation_publisher = 'Damascus University';

  return meta;
}
