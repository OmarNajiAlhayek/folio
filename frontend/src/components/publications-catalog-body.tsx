'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ApiErrorState } from '@/components/api-error-state';
import type React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonBusyRegion } from '@/components/ui/skeleton-loading-status';
import { EmptyState } from '@/components/ui/empty-state';
import { Highlight } from '@/components/ui/highlight';
import { Pagination } from '@/components/ui/pagination';
import { PublicationsCatalogSearch } from '@/components/publications-catalog-search';
import { formatMediumDate } from '@/lib/format-date';
import { getApiErrorKind } from '@/lib/api-error-message';
import { pageCount as toPageCount } from '@/lib/list-query';
import { useListQueryState } from '@/lib/use-list-query-state';
import {
  publicationCatalogQuery,
  publicationCatalogUsesSemanticSearch,
  type PublicationCatalogFilterKey,
  type PublicationCatalogFilters,
  type PublicationSearchMode,
} from '@/lib/public-submissions-query';
import {
  PUBLICATION_CATALOG_PAGE_SIZE,
  PUBLICATION_SEMANTIC_DEFAULT_LIMIT,
  usePublicationsCatalog,
  type PublicationListItem,
} from '@/lib/queries/publications';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { cn } from '@/lib/utils';
import { DisciplineBadges } from '@/components/discipline-badges';

function CatalogSkeleton() {
  return (
    <div className="mt-6 space-y-5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{ '--sk-delay': `${i * 75}ms` } as React.CSSProperties}
          className="rounded-2xl border border-ink/10 bg-surface/85 p-6 shadow-sm space-y-3"
        >
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-4 w-28 rounded-full" />
          </div>
          <Skeleton className="h-8 max-w-xl rounded-xl" />
          <Skeleton className="h-3 w-48" />
          <div className="mt-2 border-s-4 border-ink/10 ps-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 max-w-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogArticle({
  item,
  locale,
  query,
  semanticActive,
  isAbstractOpen,
  onToggleAbstract,
}: {
  item: PublicationListItem;
  locale: string;
  /** Active text query, marked in the parts of the card it matches. */
  query: string;
  semanticActive: boolean;
  isAbstractOpen: boolean;
  onToggleAbstract: () => void;
}) {
  const t = useTranslations('Publications');
  const tWf = useTranslations('SubmissionWorkflow');
  const dateStr = formatMediumDate(item.publishedAt, locale);
  const pubSlug = item.slug ?? item.id;

  // Semantic hits are ranked by meaning rather than by the words typed, so
  // marking the literal query in them would be misleading.
  const markQuery = semanticActive ? '' : query;

  return (
    <article className="group relative rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/90 p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)] backdrop-blur-md transition-all duration-300 hover:border-accent-2/20 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="flex flex-wrap gap-2 items-center mb-4">
        {item.journal ? (
          <Link
            href={`/journals/${encodeURIComponent(item.journal.slug)}`}
            className="inline-flex items-center rounded-full bg-accent/8 border border-accent/25 px-2.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/15 transition-colors"
          >
            {locale === 'ar' ? item.journal.titleAr : item.journal.titleEn}
          </Link>
        ) : null}
        {(item.disciplines?.length ?? 0) > 0 ? (
          <DisciplineBadges labels={item.disciplines ?? []} />
        ) : null}
        {item.articleType ? (
          <span className="inline-flex items-center rounded-full bg-indigo-500/8 dark:bg-indigo-500/18 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
            {tWf(`articleType_${item.articleType}`)}
          </span>
        ) : null}
      </div>

      <div>
        <h2 className="font-serif text-xl font-bold leading-snug sm:text-2xl">
          <Link
            href={`/publications/${encodeURIComponent(pubSlug)}`}
            className="text-ink transition-colors duration-200 hover:text-accent group-hover:text-accent"
          >
            <Highlight text={item.title} query={markQuery} />
          </Link>
        </h2>
        {item.titleAr?.trim() ? (
          <p
            dir="rtl"
            className="mt-2 font-serif text-lg font-bold leading-snug"
          >
            <Link
              href={`/publications/${encodeURIComponent(pubSlug)}`}
              className="text-ink/90 transition-colors duration-200 hover:text-accent group-hover:text-accent"
            >
              <Highlight text={item.titleAr} query={markQuery} />
            </Link>
          </p>
        ) : null}
      </div>

      {semanticActive && item.searchSnippet?.trim() ? (
        <p
          className="mt-3 text-xs leading-relaxed text-ink/75 border-s-2 border-accent/35 ps-3 line-clamp-3"
          dir="auto"
        >
          {item.searchSnippet}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/50">
        {item.author?.displayName ? (
          <div className="flex items-center gap-1">
            <UserRound
              className="size-3.5 text-accent-2 opacity-75"
              strokeWidth={2.5}
              aria-hidden
            />
            <span>
              <Highlight text={item.author.displayName} query={markQuery} />
            </span>
          </div>
        ) : null}
        {dateStr ? (
          <div className="flex items-center gap-1">
            <CalendarDays
              className="size-3.5 text-accent opacity-75"
              strokeWidth={2.5}
              aria-hidden
            />
            <span>{dateStr}</span>
          </div>
        ) : null}
      </div>

      {item.abstract ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onToggleAbstract}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:brightness-95 active:scale-[0.98] transition-all duration-200 select-none pb-1.5"
            aria-expanded={isAbstractOpen}
          >
            <ChevronRight
              className={`size-3.5 transform transition-transform duration-300 ${isAbstractOpen ? 'rotate-90' : ''}`}
              strokeWidth={2.5}
              aria-hidden
            />
            {isAbstractOpen ? t('hideAbstract') : t('showAbstract')}
          </button>

          <CollapsibleSection
            open={isAbstractOpen}
            slide={false}
            contentClassName="mt-3.5 space-y-3 border-s-4 border-accent/40 ps-5"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">
                {tWf('abstractLabelEn')}
              </p>
              <p dir="ltr" className="mt-1 text-xs leading-relaxed text-ink/75">
                <Highlight text={item.abstract} query={markQuery} />
              </p>
            </div>
            {item.abstractAr?.trim() ? (
              <div className="pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">
                  {tWf('abstractLabelAr')}
                </p>
                <p
                  dir="rtl"
                  className="mt-1 text-xs leading-relaxed text-ink/75 font-serif"
                >
                  <Highlight text={item.abstractAr} query={markQuery} />
                </p>
              </div>
            ) : null}
          </CollapsibleSection>
        </div>
      ) : null}

      <div className="mt-5 pt-3 border-t border-ink/[0.05] dark:border-white/[0.05] flex justify-between items-center">
        <Link
          href={`/publications/${encodeURIComponent(pubSlug)}`}
          className="group/btn inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition-all duration-200"
        >
          {t('readArticle')}
          <ArrowRight
            className="size-3.5 transform transition-transform duration-300 group-hover/btn:translate-x-1 rtl:rotate-180 rtl:group-hover/btn:-translate-x-1 text-accent"
            aria-hidden
          />
        </Link>
      </div>
    </article>
  );
}

export function PublicationsCatalogBody() {
  const t = useTranslations('Publications');
  const tList = useTranslations('List');
  const tApi = useTranslations('ApiErrors');
  const locale = useLocale();
  const { resolve: resolveApiError } = useApiErrorMessages();

  const {
    filters: rawFilters,
    page,
    setFilters,
    setFilter,
    removeFilter,
    clear,
    setPage,
    isActive: filtersActive,
  } = useListQueryState<PublicationCatalogFilterKey>(
    publicationCatalogQuery,
    '/publications',
  );
  const filters = rawFilters as PublicationCatalogFilters;
  const semanticActive = publicationCatalogUsesSemanticSearch(filters);

  const { data, error, isPending, isFetching, isPlaceholderData, refetch } =
    usePublicationsCatalog(filters, page);

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? null;
  const pageCount = semanticActive
    ? 1
    : toPageCount(total ?? 0, PUBLICATION_CATALOG_PAGE_SIZE);

  const [openAbstracts, setOpenAbstracts] = useState<Record<string, boolean>>(
    {},
  );

  const onQuickQueryChange = useCallback(
    (q: string) => setFilter('q', q),
    [setFilter],
  );

  const onApplyAdvanced = useCallback(
    (draft: PublicationCatalogFilters) => setFilters(draft),
    [setFilters],
  );

  const onSearchModeChange = useCallback(
    (searchMode: PublicationSearchMode) => {
      // `keyword` is the default and is omitted from the URL.
      setFilter('searchMode', searchMode === 'keyword' ? undefined : searchMode);
    },
    [setFilter],
  );

  const toggleAbstract = (id: string) => {
    setOpenAbstracts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadError = error ? resolveApiError(error, t('loadFailed')) : null;
  const initialLoading = isPending && !data;
  // `isPlaceholderData` is the previous page still on screen while the next
  // one loads — the cue for the stale overlay, not a reason to show a skeleton.
  const isRefetching = (isFetching && !isPending) || isPlaceholderData;
  const showEmptyState = !initialLoading && !loadError && items.length === 0;
  const activeQuery = filters.q ?? '';

  return (
    <>
      <PublicationsCatalogSearch
        filters={filters}
        onQuickQueryChange={onQuickQueryChange}
        onSearchModeChange={onSearchModeChange}
        onApplyAdvanced={onApplyAdvanced}
        onClear={clear}
        onRemoveFilter={removeFilter}
        resultCount={initialLoading ? null : (total ?? items.length)}
        semanticResultsCap={
          semanticActive && !initialLoading
            ? PUBLICATION_SEMANTIC_DEFAULT_LIMIT
            : null
        }
        loading={initialLoading}
        isUpdating={isRefetching}
      />

      {loadError ? (
        <div className="mt-8">
          <ApiErrorState
            className="max-w-none px-0 py-0"
            message={loadError}
            error={error}
            hint={
              error && getApiErrorKind(error) === 'rateLimit'
                ? tApi('rateLimitHint')
                : undefined
            }
            onRetry={() => void refetch()}
            retryLabel={tApi('retry')}
          />
        </div>
      ) : null}

      {initialLoading ? (
        <SkeletonBusyRegion label={t('loading')}>
          <CatalogSkeleton />
        </SkeletonBusyRegion>
      ) : showEmptyState ? (
        <EmptyState
          icon={TriangleAlert}
          title={filtersActive ? t('noResults') : t('empty')}
          hint={filtersActive ? t('noResultsHint') : t('emptyHint')}
          action={
            filtersActive ? { label: t('clear'), onClick: clear } : undefined
          }
        />
      ) : !loadError && items.length > 0 ? (
        <div className="relative mt-6">
          {isRefetching ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-accent/15"
              aria-hidden
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          ) : null}
          {isRefetching ? (
            <p className="sr-only" aria-live="polite">
              {t('updatingResults')}
            </p>
          ) : null}
          <motion.div
            className={cn(
              'space-y-5',
              isRefetching && 'opacity-70 transition-opacity duration-200',
            )}
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          >
            {items.map((p) => (
              <motion.div
                key={p.id}
                variants={{
                  hidden: { opacity: 0, y: 18 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { type: 'spring', stiffness: 260, damping: 24 },
                  },
                }}
                viewport={{ once: true, margin: '-40px' }}
              >
                <CatalogArticle
                  item={p}
                  locale={locale}
                  query={activeQuery}
                  semanticActive={semanticActive}
                  isAbstractOpen={openAbstracts[p.id] ?? false}
                  onToggleAbstract={() => toggleAbstract(p.id)}
                />
              </motion.div>
            ))}
          </motion.div>

          <Pagination
            className="mt-8"
            page={page}
            pageCount={pageCount}
            onPageChange={(next) => {
              setPage(next);
              // A new page starts at the top; without this the reader lands
              // mid-list because the previous page's scroll position is kept.
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            disabled={isRefetching}
            labels={{
              nav: tList('paginationLabel'),
              previous: tList('prevPage'),
              next: tList('nextPage'),
              pageOf: (p, total) => tList('pageOf', { page: p, totalPages: total }),
              goToPage: (p) => tList('goToPage', { page: p }),
            }}
          />
        </div>
      ) : null}
    </>
  );
}
