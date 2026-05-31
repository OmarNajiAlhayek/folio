"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { publicJson } from "@/lib/public-api";
import {
  buildPublicSubmissionsQuery,
  publicationCatalogUsesSemanticSearch,
  type PublicationCatalogFilters,
} from "@/lib/public-submissions-query";
import { queryKeys } from "@/lib/query-keys";

export const PUBLICATION_CATALOG_PAGE_SIZE = 20;
/** Matches backend default for semantic catalog search (max 30). */
export const PUBLICATION_SEMANTIC_DEFAULT_LIMIT = 20;

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
  discipline?: string | null;
  publishedAt: string | null;
  author?: { displayName: string };
  searchSnippet?: string;
  searchScore?: number;
};

export type PublicationCatalogPage = {
  items: PublicationListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type PublicationDetail = {
  id: string;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  discipline?: string | null;
  articleType?: string | null;
  keywords?: string | null;
  keywordsAr?: string | null;
  publishedAt: string | null;
  author?: { displayName: string };
  files: { id: string; originalName: string; mimeType: string }[];
};

import type { RelatedPublication } from "@/components/related-publications";

function catalogListPath(
  filters: PublicationCatalogFilters,
  offset: number,
): string {
  const semantic = publicationCatalogUsesSemanticSearch(filters);
  const base = buildPublicSubmissionsQuery(filters);
  const sp = new URLSearchParams(base.startsWith("?") ? base.slice(1) : "");
  if (!semantic) {
    sp.set("limit", String(PUBLICATION_CATALOG_PAGE_SIZE));
    sp.set("offset", String(offset));
  }
  const qs = sp.toString();
  return qs ? `/public/submissions?${qs}` : "/public/submissions";
}

export function usePublicationsCatalog(filters: PublicationCatalogFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.publicationsCatalog(filters),
    queryFn: ({ pageParam }) =>
      publicJson<PublicationCatalogPage>(
        catalogListPath(filters, pageParam as number),
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
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
