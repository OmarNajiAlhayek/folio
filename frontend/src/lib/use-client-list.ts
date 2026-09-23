'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { matchesTokens, tokenTexts } from '@folio/shared/text/search-normalize';
import {
  createListQuery,
  pageCount as toPageCount,
  paginate,
  type ListQuery,
} from '@/lib/list-query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useListQueryState } from '@/lib/use-list-query-state';

/** Rows already on the page filter instantly; this only smooths the URL writes. */
const SEARCH_DEBOUNCE_MS = 200;

const textQuery: ListQuery<'q'> = createListQuery<'q'>({ keys: ['q'] });

export type ClientList<T> = {
  /** What the input shows — updates on every keystroke. */
  draftQuery: string;
  setDraftQuery: (value: string) => void;
  /** What the URL holds, and what the rows are filtered and marked by. */
  query: string;
  /** Rows for the current page, after filtering. */
  visible: T[];
  /** Rows after filtering, before paging — for a result count. */
  matched: T[];
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  isActive: boolean;
  clear: () => void;
};

/**
 * Search and paginate a list that is already in the browser.
 *
 * For collections small and stable enough to ship with the page — a journal's
 * issues, an issue's table of contents, an editorial board. Filtering happens
 * locally so there is no request per keystroke, while the query still lives in
 * the URL and so stays shareable.
 *
 * Matching is Arabic-aware through the shared normalizer: harakat, tatweel,
 * hamza carriers, ta-marbuta and the definite article are all folded away.
 */
export function useClientList<T>({
  items,
  toSearchText,
  basePath,
  pageSize,
}: {
  items: readonly T[];
  /** Everything about a row that should be searchable, joined into one string. */
  toSearchText: (item: T) => string;
  /** Path to write the query string onto, e.g. `/journals/engj`. */
  basePath: string;
  /** Omit to show every match on one page. */
  pageSize?: number;
}): ClientList<T> {
  const { filters, page, setFilter, setPage, clear } = useListQueryState<'q'>(
    textQuery,
    basePath,
  );
  const query = filters.q ?? '';

  const [draftQuery, setDraftQuery] = useState(query);
  const debounced = useDebouncedValue(draftQuery, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (debounced.trim() !== query.trim()) setFilter('q', debounced);
  }, [debounced, query, setFilter]);

  // Fold each row once. `items` is stable for the life of the page, so this
  // does not rerun per keystroke.
  const searchable = useMemo(
    () => items.map((item) => ({ item, tokens: tokenTexts(toSearchText(item)) })),
    [items, toSearchText],
  );

  const matched = useMemo(() => {
    const queryTokens = tokenTexts(query);
    return searchable
      .filter(({ tokens }) => matchesTokens(tokens, queryTokens))
      .map(({ item }) => item);
  }, [searchable, query]);

  const pageCount = pageSize ? toPageCount(matched.length, pageSize) : 1;
  const visible = useMemo(
    () => (pageSize ? paginate(matched, page, pageSize) : matched),
    [matched, page, pageSize],
  );

  const handleClear = useCallback(() => {
    setDraftQuery('');
    clear();
  }, [clear]);

  return {
    draftQuery,
    setDraftQuery,
    query,
    visible,
    matched,
    page,
    pageCount,
    setPage,
    isActive: Boolean(query.trim()),
    clear: handleClear,
  };
}
