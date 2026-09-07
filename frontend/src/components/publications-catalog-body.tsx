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
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ApiErrorState } from '@/components/api-error-state';
import type React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonBusyRegion } from '@/components/ui/skeleton-loading-status';
import { PublicationsCatalogSearch } from '@/components/publications-catalog-search';
import { formatMediumDate } from '@/lib/format-date';
import { getApiErrorKind } from '@/lib/api-error-message';
import {
  parsePublicationCatalogFilters,
  publicationCatalogFiltersActive,
  publicationCatalogFiltersToSearchParams,
  publicationCatalogUsesSemanticSearch,
  type PublicationCatalogFilters,
  type PublicationSearchMode,
} from '@/lib/public-submissions-query';
import {
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
  semanticActive,
  isAbstractOpen,
  onToggleAbstract,
}: {
  item: PublicationListItem;
  locale: string;
  semanticActive: boolean;
  isAbstractOpen: boolean;
  onToggleAbstract: () => void;
}) {
  const t = useTranslations('Publications');
  const tWf = useTranslations('SubmissionWorkflow');
  const dateStr = formatMediumDate(item.publishedAt, locale);
  const pubSlug = item.slug ?? item.id;

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
            {item.title}
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
              {item.titleAr}
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
            <span>{item.author.displayName}</span>
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
                {item.abstract}
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
                  {item.abstractAr}
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
  const tApi = useTranslations('ApiErrors');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolve: resolveApiError } = useApiErrorMessages();

  const filters = useMemo(
    () => parsePublicationCatalogFilters(searchParams),
    [searchParams],
  );
  const filtersActive = publicationCatalogFiltersActive(filters);
  const semanticActive = publicationCatalogUsesSemanticSearch(filters);

  const {
    data,
    error,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = usePublicationsCatalog(filters);

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? null;

  const [openAbstracts, setOpenAbstracts] = useState<Record<string, boolean>>(
    {},
  );

  const replaceFilters = useCallback(
    (next: PublicationCatalogFilters) => {
      const sp = publicationCatalogFiltersToSearchParams(next);
      const qs = sp.toString();
      router.replace(qs ? `/publications?${qs}` : '/publications', {
        scroll: false,
      });
    },
    [router],
  );

  const onQuickQueryChange = useCallback(
    (q: string) => {
      const current = parsePublicationCatalogFilters(searchParams);
      replaceFilters({
        ...current,
        q: q.trim() || undefined,
      });
    },
    [searchParams, replaceFilters],
  );

  const onApplyAdvanced = useCallback(
    (draft: PublicationCatalogFilters) => {
      replaceFilters(draft);
    },
    [replaceFilters],
  );

  const onClear = useCallback(() => {
    replaceFilters({});
  }, [replaceFilters]);

  const onSearchModeChange = useCallback(
    (searchMode: PublicationSearchMode) => {
      replaceFilters({
        ...filters,
        searchMode: searchMode === 'keyword' ? undefined : searchMode,
      });
    },
    [filters, replaceFilters],
  );

  const onRemoveFilter = useCallback(
    (key: keyof PublicationCatalogFilters) => {
      const next = { ...filters };
      delete next[key];
      replaceFilters(next);
    },
    [filters, replaceFilters],
  );

  const toggleAbstract = (id: string) => {
    setOpenAbstracts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const loadError = error ? resolveApiError(error, t('loadFailed')) : null;
  const initialLoading = isPending && !data;
  const isRefetching = isFetching && !isPending && !isFetchingNextPage;
  const showLoadMore =
    !semanticActive && hasNextPage && !loadError && items.length > 0;
  const showEmptyState = !initialLoading && !loadError && items.length === 0;

  return (
    <>
      <PublicationsCatalogSearch
        filters={filters}
        onQuickQueryChange={onQuickQueryChange}
        onSearchModeChange={onSearchModeChange}
        onApplyAdvanced={onApplyAdvanced}
        onClear={onClear}
        onRemoveFilter={onRemoveFilter}
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
        <div className="mt-8 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-ink/15 dark:border-white/15 bg-linear-to-b from-surface/50 to-surface-muted/20">
          <div className="relative flex items-center justify-center size-16 rounded-full bg-accent/8 border border-accent/15 text-accent mb-5">
            <span className="absolute inset-0 rounded-full bg-accent/8 animate-pulse" />
            <TriangleAlert className="size-8" strokeWidth={2} aria-hidden />
          </div>

          <h2 className="font-serif text-lg font-bold text-ink">
            {filtersActive ? t('noResults') : t('empty')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink/60 max-w-xs">
            {filtersActive ? t('noResultsHint') : t('emptyHint')}
          </p>

          {filtersActive ? (
            <button
              type="button"
              onClick={onClear}
              className="mt-5 rounded-lg border border-accent px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/5 active:scale-[0.98] transition-all duration-200"
            >
              {t('clear')}
            </button>
          ) : null}
        </div>
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
                  semanticActive={semanticActive}
                  isAbstractOpen={openAbstracts[p.id] ?? false}
                  onToggleAbstract={() => toggleAbstract(p.id)}
                />
              </motion.div>
            ))}

            {showLoadMore ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  className="rounded-lg border border-ink/15 bg-surface px-5 py-2.5 text-xs font-semibold text-ink shadow-sm transition hover:border-accent/30 hover:text-accent disabled:opacity-60"
                >
                  {isFetchingNextPage ? t('loadingMore') : t('loadMore')}
                </button>
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </>
  );
}
