/**
 * Shapes returned by the public publication endpoints.
 *
 * Kept out of `lib/queries/publications.ts` because that module is marked
 * `'use client'`: server components need these shapes too, and a type-only home
 * avoids importing a client module across the boundary just to name a field.
 */

export type PublicationAuthor = {
  fullName: string;
  affiliation: string | null;
  /** Only the submitting account holds one; free-text co-authors do not. */
  orcid: string | null;
  isCorresponding: boolean;
};

export type PublicationJournalRef = {
  slug: string;
  titleAr: string;
  titleEn: string;
  /** Null until the DU library supplies them (EXTERNAL-ACTIONS A1). */
  issn: string | null;
  eissn: string | null;
};

export type PublicationIssueRef = {
  year: number;
  number: number;
  volume: number | null;
  titleAr: string | null;
  titleEn: string | null;
  publishedAt: string | null;
  /** `العدد 1، 2026` */
  citationAr: string;
  /** `No. 1 (2026)` */
  citationEn: string;
};

export type PublicationFile = {
  id: string;
  originalName: string;
  mimeType: string;
};

export type PublicationDetail = {
  id: string;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  disciplines?: string[];
  articleType?: string | null;
  keywords?: string | null;
  keywordsAr?: string | null;
  publishedAt: string | null;
  journal?: PublicationJournalRef | null;
  issue?: PublicationIssueRef | null;
  /** Complete author list, in the order entered on the submission. */
  authors?: PublicationAuthor[];
  author?: { displayName: string };
  files: PublicationFile[];
};

/** A catalog card. Identical whether it came from search, the catalog or an issue. */
export type PublicationListItem = {
  id: string;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  articleType?: string | null;
  keywords?: string | null;
  keywordsAr?: string | null;
  disciplines?: string[];
  /** Journal this article was published in; null if the query did not load it. */
  journal?: { slug: string; titleAr: string; titleEn: string } | null;
  publishedAt: string | null;
  author?: { displayName: string };
  searchSnippet?: string;
  searchScore?: number;
};
