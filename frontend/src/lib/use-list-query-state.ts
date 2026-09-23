'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import {
  PAGE_PARAM,
  parsePage,
  type ListFilters,
  type ListQuery,
} from '@/lib/list-query';

export type ListQueryState<K extends string> = {
  /** Filters as the URL currently has them. */
  filters: ListFilters<K>;
  /** 1-based page from `?page=`, defaulting to 1. */
  page: number;
  /** Replace the whole filter set. Resets to page 1. */
  setFilters: (next: ListFilters<K>) => void;
  /** Set or clear one filter. Resets to page 1. */
  setFilter: (key: K, value: string | undefined) => void;
  /** Drop one filter — what a chip's × does. Resets to page 1. */
  removeFilter: (key: K) => void;
  /** Clear every filter and go back to page 1. */
  clear: () => void;
  /** Move to a page, leaving filters alone. */
  setPage: (page: number) => void;
  /** Whether any filter is set, for empty-state copy and a "clear" affordance. */
  isActive: boolean;
};

/**
 * Keeps a listing page's filters and page number in the URL.
 *
 * Writes with `router.replace(…, { scroll: false })` so typing in a search box
 * does not push a history entry per keystroke, and so the page does not jump to
 * the top while someone is reading. The router comes from `@/i18n/navigation`,
 * which is locale-aware — using the bare `next/navigation` one drops the locale
 * segment and bounces the user to the default language.
 */
export function useListQueryState<K extends string>(
  query: ListQuery<K>,
  basePath: string,
): ListQueryState<K> {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => query.parse(new URLSearchParams(searchParams.toString())),
    [query, searchParams],
  );
  const page = useMemo(
    () => parsePage(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const push = useCallback(
    (next: ListFilters<K>, nextPage: number) => {
      const sp = query.toSearchParams(next);
      // Page 1 is the default; leaving it out keeps shared URLs tidy.
      if (nextPage > 1) sp.set(PAGE_PARAM, String(nextPage));
      const qs = sp.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [basePath, query, router],
  );

  /**
   * Any filter change returns to page 1. Without this, someone on page 7 who
   * types a query lands on page 7 of a two-page result — an empty list that
   * looks like "no matches".
   */
  const setFilters = useCallback(
    (next: ListFilters<K>) => push(next, 1),
    [push],
  );

  const setFilter = useCallback(
    (key: K, value: string | undefined) => {
      const next = { ...filters };
      if (value?.trim()) next[key] = value;
      else delete next[key];
      push(next, 1);
    },
    [filters, push],
  );

  const removeFilter = useCallback(
    (key: K) => {
      const next = { ...filters };
      delete next[key];
      push(next, 1);
    },
    [filters, push],
  );

  const clear = useCallback(() => push({}, 1), [push]);

  const setPage = useCallback(
    (nextPage: number) => push(filters, nextPage),
    [filters, push],
  );

  return {
    filters,
    page,
    setFilters,
    setFilter,
    removeFilter,
    clear,
    setPage,
    isActive: query.isActive(filters),
  };
}
