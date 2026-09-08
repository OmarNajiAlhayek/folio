import type { PublicationListItem } from '@/lib/publication-types';

/**
 * Shapes returned by the public portal endpoints (`/public/journals/*`).
 *
 * Kept outside `lib/queries/journals.ts` for the same reason as the publication
 * types: that module is `'use client'`, and the portal routes are now server
 * components that need these shapes without crossing the client boundary.
 */

export type PortalIssueSummary = {
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
  articleCount: number;
};

export type PortalJournal = {
  slug: string;
  titleAr: string;
  titleEn: string;
  disciplineLabel: string;
  /** Null until the DU library supplies them (EXTERNAL-ACTIONS A1). */
  issn: string | null;
  eissn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  articleCount: number;
  latestIssue: PortalIssueSummary | null;
};

export type JournalWithIssues = {
  journal: PortalJournal;
  issues: PortalIssueSummary[];
};

export type IssueWithArticles = {
  journal: PortalJournal;
  issue: PortalIssueSummary;
  articles: PublicationListItem[];
};
