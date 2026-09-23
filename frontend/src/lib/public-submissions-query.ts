import { createListQuery, type ListFilters } from '@/lib/list-query';

export type PublicationSearchMode = 'keyword' | 'semantic';

export type PublicationCatalogFilters = {
  q?: string;
  searchMode?: PublicationSearchMode;
  author?: string;
  /** Journal slug (`engj`) — matches the portal URLs. */
  journal?: string;
  discipline?: string;
  articleType?: string;
  publishedFrom?: string;
  publishedTo?: string;
};

export type PublicationCatalogFilterKey = keyof PublicationCatalogFilters;

type FilterKey = PublicationCatalogFilterKey;

const FILTER_KEYS = [
  'q',
  'searchMode',
  'author',
  'journal',
  'discipline',
  'articleType',
  'publishedFrom',
  'publishedTo',
] as const satisfies readonly FilterKey[];

/**
 * `keyword` is the implicit mode: it is omitted from the URL and does not count
 * as an active filter, so a plain text search produces `?q=…` and nothing else.
 */
export const publicationCatalogQuery = createListQuery<FilterKey>({
  keys: FILTER_KEYS,
  enums: { searchMode: ['keyword', 'semantic'] },
  defaults: { searchMode: 'keyword' },
});

const catalogQuery = publicationCatalogQuery;

export function parsePublicationCatalogFilters(
  params: URLSearchParams,
): PublicationCatalogFilters {
  return catalogQuery.parse(params) as PublicationCatalogFilters;
}

export function publicationCatalogFiltersActive(
  filters: PublicationCatalogFilters,
): boolean {
  return catalogQuery.isActive(filters as ListFilters<FilterKey>);
}

export function publicationCatalogActiveKeys(
  filters: PublicationCatalogFilters,
): FilterKey[] {
  return catalogQuery.activeKeys(filters as ListFilters<FilterKey>);
}

export function publicationCatalogUsesSemanticSearch(
  filters: PublicationCatalogFilters,
): boolean {
  return filters.searchMode === 'semantic' && Boolean(filters.q?.trim());
}

export function buildPublicSubmissionsQuery(
  filters: PublicationCatalogFilters,
): string {
  return catalogQuery.buildQuery(filters as ListFilters<FilterKey>);
}

export function publicationCatalogFiltersToSearchParams(
  filters: PublicationCatalogFilters,
): URLSearchParams {
  return catalogQuery.toSearchParams(filters as ListFilters<FilterKey>);
}
