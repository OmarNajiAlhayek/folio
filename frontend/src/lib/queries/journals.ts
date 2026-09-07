'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
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

/** One option in the author's journal picker (`GET /submissions/journal-options`). */
export type JournalOption = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  disciplineLabel: string;
};

/**
 * Journals an author may submit to. Authenticated and thinner than
 * {@link useJournals}: the picker needs the `id` the submission stores, which
 * the public portal payload deliberately does not carry.
 */
export function useJournalOptions() {
  return useQuery({
    queryKey: queryKeys.journalOptions,
    queryFn: () => apiJson<JournalOption[]>('/submissions/journal-options'),
    // Reference data — nine rows that change when a journal is founded.
    staleTime: 5 * 60 * 1000,
  });
}

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
