"use client";

import { useEffect, useState } from "react";

/** Debounce delay for publications catalog quick search (`#pub-catalog-q`). */
export const PUBLICATION_CATALOG_QUICK_SEARCH_DEBOUNCE_MS = 500;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
