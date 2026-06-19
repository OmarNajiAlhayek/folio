import { apiJson } from '@/lib/api';
import type {
  ArticleLabel,
  SearchAnalytics,
  SearchOverride,
  SearchStatus,
  SearchSynonym,
} from '@/lib/search-curation';

export async function fetchSearchStatus(): Promise<SearchStatus> {
  return apiJson<SearchStatus>('/editor/search/status');
}

export async function fetchSearchOverrides(): Promise<SearchOverride[]> {
  return apiJson<SearchOverride[]>('/editor/search/overrides');
}

export async function fetchSearchSynonyms(): Promise<SearchSynonym[]> {
  return apiJson<SearchSynonym[]>('/editor/search/synonyms');
}

export async function fetchSearchAnalytics(): Promise<SearchAnalytics> {
  return apiJson<SearchAnalytics>('/editor/search/analytics');
}

export async function fetchArticleLabels(
  ids: string[],
): Promise<ArticleLabel[]> {
  if (ids.length === 0) return [];
  const sp = new URLSearchParams({ ids: ids.join(',') });
  return apiJson<ArticleLabel[]>(
    `/editor/search/article-labels?${sp.toString()}`,
  );
}

export async function upsertSearchOverride(
  id: string,
  body: {
    rule: { query: string; match: 'exact' | 'contains' };
    includes?: { id: string; position: number }[];
    excludes?: { id: string }[];
  },
): Promise<void> {
  await apiJson(`/editor/search/overrides/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteSearchOverride(id: string): Promise<void> {
  await apiJson(`/editor/search/overrides/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function upsertSearchSynonym(
  id: string,
  body: { synonyms: string[]; root?: string },
): Promise<void> {
  await apiJson(`/editor/search/synonyms/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteSearchSynonym(id: string): Promise<void> {
  await apiJson(`/editor/search/synonyms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function triggerSearchReindex(): Promise<void> {
  await apiJson('/editor/search/reindex', { method: 'POST' });
}
