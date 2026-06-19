'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { publicJson } from '@/lib/public-api';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;

export type ArticleHit = {
  id: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  author?: { displayName?: string } | null;
};

type SearchResponse = {
  items: ArticleHit[];
};

type Props = {
  /** Articles already selected (shown as chips below the input). */
  selected: ArticleHit[];
  onAdd: (article: ArticleHit) => void;
  onRemove: (slug: string) => void;
  placeholder?: string;
  searchingLabel?: string;
  noResultsLabel?: string;
};

export function ArticlePicker({
  selected,
  onAdd,
  onRemove,
  placeholder,
  searchingLabel = 'Searching…',
  noResultsLabel = 'No results',
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ArticleHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const fetchSeq = useRef(0);

  const selectedSlugs = new Set(selected.map((a) => a.slug));

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        q: q.trim(),
        limit: String(SEARCH_LIMIT),
      });
      const res = await publicJson<SearchResponse>(
        `/public/submissions?${sp.toString()}`,
      );
      if (seq !== fetchSeq.current) return;
      setHits(Array.isArray(res.items) ? res.items : []);
    } catch {
      if (seq === fetchSeq.current) setHits([]);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => void search(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (article: ArticleHit) => {
    if (!selectedSlugs.has(article.slug)) onAdd(article);
    setQuery('');
    setHits([]);
    setOpen(false);
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink/35">
          <Search className="size-4" aria-hidden />
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search article title…'}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listId : undefined}
          className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 ps-9 pe-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        {showDropdown && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-ink/15 dark:border-white/15 bg-surface py-1 text-sm shadow-lg"
          >
            {loading ? (
              <li className="px-3 py-2 text-ink/50">{searchingLabel}</li>
            ) : hits.length === 0 ? (
              <li className="px-3 py-2 text-ink/50">{noResultsLabel}</li>
            ) : (
              hits.map((h) => {
                const already = selectedSlugs.has(h.slug);
                return (
                  <li key={h.slug} role="option" aria-selected={already}>
                    <button
                      type="button"
                      disabled={already}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(h)}
                      className={cn(
                        'flex w-full flex-col gap-0.5 px-3 py-2 text-start transition-colors',
                        already
                          ? 'opacity-40 cursor-default'
                          : 'hover:bg-accent/8 hover:text-ink',
                      )}
                    >
                      <span className="truncate font-medium" dir="auto">
                        {h.title}
                      </span>
                      {h.author?.displayName && (
                        <span className="text-[11px] text-ink/50 truncate">
                          {h.author.displayName}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((a) => (
            <li
              key={a.slug}
              className="flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/8 px-2.5 py-1 text-xs font-medium text-accent"
            >
              <span
                className="max-w-[18rem] truncate"
                dir="auto"
                title={a.title}
              >
                {a.title}
              </span>
              <button
                type="button"
                onClick={() => onRemove(a.slug)}
                className="shrink-0 text-accent/60 hover:text-accent leading-none"
                aria-label={`Remove ${a.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
