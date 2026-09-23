'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { pageToOffset } from '@/lib/list-query';
import { publicJson } from '@/lib/public-api';
import type {
  PublicationDetail,
  PublicationListItem,
} from '@/lib/publication-types';
import {
  buildPublicSubmissionsQuery,
  publicationCatalogUsesSemanticSearch,
  type PublicationCatalogFilters,
} from '@/lib/public-submissions-query';
import { queryKeys } from '@/lib/query-keys';

export const PUBLICATION_CATALOG_PAGE_SIZE = 20;
/** Matches backend default for semantic catalog search (max 30). */
export const PUBLICATION_SEMANTIC_DEFAULT_LIMIT = 20;

export type { PublicationListItem } from '@/lib/publication-types';

export type PublicationCatalogPage = {
  items: PublicationListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type { PublicationDetail } from '@/lib/publication-types';

import type { RelatedPublication } from '@/components/related-publications';

function catalogListPath(
  filters: PublicationCatalogFilters,
  offset: number,
): string {
  const semantic = publicationCatalogUsesSemanticSearch(filters);
  const base = buildPublicSubmissionsQuery(filters);
  const sp = new URLSearchParams(base.startsWith('?') ? base.slice(1) : '');
  if (!semantic) {
    sp.set('limit', String(PUBLICATION_CATALOG_PAGE_SIZE));
    sp.set('offset', String(offset));
  }
  const qs = sp.toString();
  return qs ? `/public/submissions?${qs}` : '/public/submissions';
}

/**
 * One page of the catalog.
 *
 * Page-based rather than infinite: `?page=3` is in the URL, so a result set can
 * be shared, bookmarked and returned to with the back button — which matters for
 * an archive people cite. The endpoint speaks `limit`/`offset`, so the page
 * number is converted here and the API is unchanged.
 *
 * `keepPreviousData` holds the previous page on screen while the next one
 * loads, instead of flashing a skeleton between pages.
 */
export function usePublicationsCatalog(
  filters: PublicationCatalogFilters,
  page = 1,
) {
  const semantic = publicationCatalogUsesSemanticSearch(filters);
  // Semantic search returns a single capped result set with no paging.
  const effectivePage = semantic ? 1 : page;

  return useQuery({
    queryKey: [...queryKeys.publicationsCatalog(filters), effectivePage],
    queryFn: () =>
      publicJson<PublicationCatalogPage>(
        catalogListPath(
          filters,
          pageToOffset(effectivePage, PUBLICATION_CATALOG_PAGE_SIZE),
        ),
      ),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePublicationDetail(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.publicationDetail(slug),
    queryFn: () =>
      publicJson<PublicationDetail>(
        `/public/submissions/${encodeURIComponent(slug)}`,
      ),
    enabled: enabled && Boolean(slug),
    retry: false,
  });
}

export function useRelatedPublications(slug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.publicationRelated(slug),
    queryFn: () =>
      publicJson<RelatedPublication[]>(
        `/public/submissions/${encodeURIComponent(slug)}/related`,
      ),
    enabled: enabled && Boolean(slug),
    retry: false,
  });
}
