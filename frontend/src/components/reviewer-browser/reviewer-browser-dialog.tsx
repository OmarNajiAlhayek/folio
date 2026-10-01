'use client';

import { Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ResultCount } from '@/components/ui/result-count';
import { SearchInput } from '@/components/ui/search-input';
import { SimpleSelect } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useReviewerDirectory } from '@/lib/queries/reviewers';
import {
  filterAndSortReviewers,
  REVIEWER_FILTERS,
  REVIEWER_SORTS,
  toSearchableReviewers,
  type ReviewerFilter,
  type ReviewerSort,
} from '@/lib/reviewer-directory';
import { cn } from '@/lib/utils';
import { ReviewerCard } from './reviewer-card';
import { ReviewerStatsDialog } from './reviewer-stats-dialog';

/**
 * The editor's reviewer picker: search, filter and sort the whole pool, open
 * any reviewer's profile, and select one. Selecting closes the browser — the
 * due dates and instructions stay in the sidebar where the invitation is sent.
 */
export function ReviewerBrowserDialog({
  slug,
  open,
  onOpenChange,
  selectedId,
  onSelect,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string;
  onSelect: (reviewerId: string) => void;
}) {
  const t = useTranslations('ReviewerBrowser');
  const locale = useLocale();
  const directory = useReviewerDirectory(slug, open);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReviewerFilter>('invitable');
  const [sort, setSort] = useState<ReviewerSort>('name');
  const [detailId, setDetailId] = useState<string | null>(null);
  // Folding and filtering is cheap, but a large pool re-renders many cards;
  // let typing stay responsive and the list catch up.
  const deferredQuery = useDeferredValue(query);

  const searchable = useMemo(
    () => toSearchableReviewers(directory.data ?? []),
    [directory.data],
  );
  const visible = useMemo(
    () =>
      filterAndSortReviewers(searchable, {
        query: deferredQuery,
        filter,
        sort,
        locale,
      }),
    [searchable, deferredQuery, filter, sort, locale],
  );
  const countByFilter = useMemo(() => {
    const counts = {} as Record<ReviewerFilter, number>;
    for (const f of REVIEWER_FILTERS) {
      counts[f] = filterAndSortReviewers(searchable, {
        query: deferredQuery,
        filter: f,
        sort: 'name',
        locale,
      }).length;
    }
    return counts;
  }, [searchable, deferredQuery, locale]);

  const choose = (id: string) => {
    onSelect(id);
    setDetailId(null);
    onOpenChange(false);
  };

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const pool = directory.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showClose
          className="flex h-[88vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 p-0"
        >
          <div className="border-b border-ink/[0.07] px-4 pb-4 pt-5 sm:px-6 dark:border-white/[0.07]">
            <DialogTitle className="pe-8">{t('dialogTitle')}</DialogTitle>
            <DialogDescription className="mt-1 text-xs sm:text-sm">
              {t('dialogDescription')}
            </DialogDescription>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={t('searchPlaceholder')}
                clearLabel={t('clearSearch')}
                controls="reviewer-browser-results"
                autoFocus
              />
              <SimpleSelect
                value={sort}
                onValueChange={(v) => setSort(v as ReviewerSort)}
                options={REVIEWER_SORTS.map((s) => ({
                  value: s,
                  label: t(`sort_${s}`),
                }))}
                aria-label={t('sortLabel')}
                className="sm:w-56"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div
                role="group"
                aria-label={t('filterLabel')}
                className="flex flex-wrap gap-1 rounded-xl bg-ink/[0.04] p-1 dark:bg-white/[0.04]"
              >
                {REVIEWER_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
                      filter === f
                        ? 'bg-surface text-ink shadow-xs'
                        : 'text-ink/60 hover:text-ink',
                    )}
                  >
                    {t(`filter_${f}`)}
                    {directory.data && (
                      <span className="ms-1 tabular-nums text-ink/40">
                        {countByFilter[f]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {directory.data && (
                <ResultCount
                  label={t('resultCount', { count: visible.length })}
                  stale={deferredQuery !== query}
                />
              )}
            </div>
          </div>

          <div
            id="reviewer-browser-results"
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
          >
            {directory.isPending ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-ink/60">
                <Spinner size="sm" />
                {t('loading')}
              </div>
            ) : directory.isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-ink/70">{t('loadFailed')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void directory.refetch()}
                >
                  {t('retry')}
                </Button>
              </div>
            ) : pool.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t('emptyPool')}
                hint={t('emptyPoolHint')}
                className="mt-0"
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title={t('emptyFiltered')}
                hint={t('emptyFilteredHint')}
                action={{ label: t('clearFilters'), onClick: resetFilters }}
                className="mt-0"
              />
            ) : (
              // `grid-cols-1` is `minmax(0, 1fr)`: without it the implicit
              // track sizes to content, and a long truncated line would widen
              // the card past a phone-width dialog.
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {visible.map((r) => (
                  <ReviewerCard
                    key={r.id}
                    reviewer={r}
                    selected={r.id === selectedId}
                    onSelect={() => choose(r.id)}
                    onDetails={() => setDetailId(r.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ReviewerStatsDialog
        slug={slug}
        reviewerId={detailId}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
        onSelect={choose}
        selectedId={selectedId}
      />
    </>
  );
}
