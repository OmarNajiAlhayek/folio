/**
 * URL-shaped state for listing pages.
 *
 * A listing page's filters belong in the query string, not in `useState`: a
 * filtered list is something people bookmark, share and reach with the back
 * button. This factory turns a small spec into the parse/serialize pair a page
 * needs, so every list agrees on how a filter becomes a URL.
 *
 * Page number is handled separately by `usePage`/`PAGE_PARAM` — it is navigation
 * state rather than a filter, and mixing the two makes query keys thrash.
 */

/** Only string-valued filters: they have to survive a query string either way. */
export type ListFilters<K extends string> = Partial<Record<K, string>>;

export type ListQuerySpec<K extends string> = {
  /** Every key this list understands. Unknown params are ignored on parse. */
  readonly keys: readonly K[];
  /**
   * Allowed values per key. A param whose value is not in the list is dropped,
   * so a hand-edited URL cannot inject an arbitrary value into a request.
   */
  readonly enums?: Partial<Record<K, readonly string[]>>;
  /**
   * Values that mean "no filter". A key at its default is omitted from the URL
   * and does not count as active — keeps the common case out of the address bar.
   */
  readonly defaults?: Partial<Record<K, string>>;
};

export type ListQuery<K extends string> = {
  parse(params: URLSearchParams): ListFilters<K>;
  toSearchParams(filters: ListFilters<K>): URLSearchParams;
  /** `?a=1&b=2`, or `''` when nothing is set — safe to append to a path. */
  buildQuery(filters: ListFilters<K>): string;
  activeKeys(filters: ListFilters<K>): K[];
  isActive(filters: ListFilters<K>): boolean;
};

/** The one param name every paginated list uses. */
export const PAGE_PARAM = 'page';

export function createListQuery<K extends string>(
  spec: ListQuerySpec<K>,
): ListQuery<K> {
  const { keys, enums, defaults } = spec;

  const allowed = (key: K, value: string): boolean => {
    const options = enums?.[key];
    return !options || options.includes(value);
  };

  const isDefault = (key: K, value: string): boolean =>
    defaults?.[key] !== undefined && defaults[key] === value;

  const clean = (filters: ListFilters<K>): Array<[K, string]> => {
    const out: Array<[K, string]> = [];
    for (const key of keys) {
      const value = filters[key]?.trim();
      if (!value) continue;
      if (!allowed(key, value)) continue;
      if (isDefault(key, value)) continue;
      out.push([key, value]);
    }
    return out;
  };

  return {
    parse(params) {
      const filters: ListFilters<K> = {};
      for (const key of keys) {
        const value = params.get(key)?.trim();
        if (!value) continue;
        if (!allowed(key, value)) continue;
        if (isDefault(key, value)) continue;
        filters[key] = value;
      }
      return filters;
    },

    toSearchParams(filters) {
      const sp = new URLSearchParams();
      for (const [key, value] of clean(filters)) sp.set(key, value);
      return sp;
    },

    buildQuery(filters) {
      const qs = this.toSearchParams(filters).toString();
      return qs ? `?${qs}` : '';
    },

    activeKeys(filters) {
      return clean(filters).map(([key]) => key);
    },

    isActive(filters) {
      return clean(filters).length > 0;
    },
  };
}

/**
 * Read `?page=` as a 1-based page number.
 *
 * Anything unparseable, zero or negative reads as page 1 rather than throwing:
 * a bad page number in a shared link should show the first page, not an error.
 */
export function parsePage(params: URLSearchParams): number {
  const raw = params.get(PAGE_PARAM);
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Total pages for a result count, never less than 1 so the UI has a page to show. */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** 1-based page → the `offset` the list endpoints take. */
export function pageToOffset(page: number, pageSize: number): number {
  return Math.max(0, (Math.max(1, page) - 1) * pageSize);
}

/** The slice of an in-memory array that belongs to `page`. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const start = pageToOffset(page, pageSize);
  return items.slice(start, start + pageSize);
}
