'use client';

import { useQuery } from '@tanstack/react-query';
import { publicJson } from '@/lib/public-api';
import { queryKeys } from '@/lib/query-keys';
import type { PublicationListItem } from '@/lib/queries/publications';

export type PortalIssueSummary = {
  year: number;
  number: number;
  volume: number | null;
  titleAr: string | null;
  titleEn: string | null;
  publishedAt: string | null;
  citationAr: string;
  citationEn: string;
  articleCount: number;
};

export type PortalJournal = {
  slug: string;
  titleAr: string;
  titleEn: string;
  disciplineLabel: string;
  issn: string | null;
  eissn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  articleCount: number;
  latestIssue: PortalIssueSummary | null;
};

export function useJournals() {
  return useQuery({
    queryKey: queryKeys.journals,
    queryFn: () => publicJson<PortalJournal[]>('/public/journals'),
    // Reference data — nine rows that change when a journal is founded.
    staleTime: 5 * 60 * 1000,
  });
}

export function useJournal(slug: string) {
  return useQuery({
    queryKey: queryKeys.journal(slug),
    queryFn: () =>
      publicJson<{ journal: PortalJournal; issues: PortalIssueSummary[] }>(
        `/public/journals/${encodeURIComponent(slug)}`,
      ),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}

export function useJournalIssue(slug: string, year: number, number: number) {
  return useQuery({
    queryKey: queryKeys.journalIssue(slug, year, number),
    queryFn: () =>
      publicJson<{
        journal: PortalJournal;
        issue: PortalIssueSummary;
        articles: PublicationListItem[];
      }>(
        `/public/journals/${encodeURIComponent(slug)}/issues/${year}/${number}`,
      ),
    enabled: Boolean(slug) && Number.isFinite(year) && Number.isFinite(number),
    staleTime: 5 * 60 * 1000,
  });
}
