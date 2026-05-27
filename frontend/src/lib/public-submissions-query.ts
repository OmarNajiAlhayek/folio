export type PublicationCatalogFilters = {
  q?: string;
  author?: string;
  discipline?: string;
  articleType?: string;
  publishedFrom?: string;
  publishedTo?: string;
};

const FILTER_KEYS: (keyof PublicationCatalogFilters)[] = [
  "q",
  "author",
  "discipline",
  "articleType",
  "publishedFrom",
  "publishedTo",
];

export function parsePublicationCatalogFilters(
  params: URLSearchParams,
): PublicationCatalogFilters {
  const filters: PublicationCatalogFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) {
      filters[key] = value;
    }
  }
  return filters;
}

export function publicationCatalogFiltersActive(
  filters: PublicationCatalogFilters,
): boolean {
  return FILTER_KEYS.some((k) => Boolean(filters[k]?.trim()));
}

export function buildPublicSubmissionsQuery(
  filters: PublicationCatalogFilters,
): string {
  const sp = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key]?.trim();
    if (value) {
      sp.set(key, value);
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function publicationCatalogFiltersToSearchParams(
  filters: PublicationCatalogFilters,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key]?.trim();
    if (value) {
      sp.set(key, value);
    }
  }
  return sp;
}
