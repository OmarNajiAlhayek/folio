"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { ApiErrorState } from "@/components/api-error-state";
import { PublicationsCatalogSearch } from "@/components/publications-catalog-search";
import { formatMediumDate } from "@/lib/format-date";
import { getApiErrorKind } from "@/lib/api-error-message";
import {
  parsePublicationCatalogFilters,
  publicationCatalogFiltersActive,
  publicationCatalogFiltersToSearchParams,
  publicationCatalogUsesSemanticSearch,
  type PublicationCatalogFilters,
  type PublicationSearchMode,
} from "@/lib/public-submissions-query";
import {
  PUBLICATION_SEMANTIC_DEFAULT_LIMIT,
  usePublicationsCatalog,
  type PublicationListItem,
} from "@/lib/queries/publications";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useDisciplineLabel } from "@/lib/use-discipline-label";

function CatalogSkeleton() {
  return (
    <div className="mt-6 space-y-5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-ink/10 bg-surface/85 p-6 shadow-sm"
        >
          <div className="flex justify-between items-center mb-3">
            <div className="h-4 w-20 rounded bg-ink/10" />
            <div className="h-4 w-28 rounded bg-ink/10" />
          </div>
          <div className="h-8 max-w-xl rounded bg-ink/10" />
          <div className="mt-4 h-3 w-48 rounded bg-ink/10" />
          <div className="mt-6 space-y-2 border-s-4 border-ink/10 ps-4">
            <div className="h-3 rounded bg-ink/10" />
            <div className="h-3 max-w-lg rounded bg-ink/10" />
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
  const t = useTranslations("Publications");
  const tWf = useTranslations("SubmissionWorkflow");
  const { format: formatDiscipline } = useDisciplineLabel();
  const dateStr = formatMediumDate(item.publishedAt, locale);
  const pubSlug = item.slug ?? item.id;

  return (
    <article className="group relative rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/90 p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)] backdrop-blur-md transition-all duration-300 hover:border-accent-2/20 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="flex flex-wrap gap-2 items-center mb-4">
        {item.discipline ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/8 dark:bg-emerald-500/18 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 mr-1 rtl:ml-1 rtl:mr-0 animate-pulse" />
            {formatDiscipline(item.discipline)}
          </span>
        ) : null}
        {item.articleType ? (
          <span className="inline-flex items-center rounded-full bg-indigo-500/8 dark:bg-indigo-500/18 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
            {tWf(`articleType_${item.articleType}`)}
          </span>
        ) : null}
      </div>

      <div>
        <h2 className="font-serif text-xl font-bold leading-snug text-ink transition-colors duration-200 group-hover:text-accent sm:text-2xl">
          {item.title}
        </h2>
        {item.titleAr?.trim() ? (
          <p
            dir="rtl"
            className="mt-2 font-serif text-lg font-bold leading-snug text-ink/90"
          >
            {item.titleAr}
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
            <svg
              className="size-3.5 text-accent-2 opacity-75"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
            <span>{item.author.displayName}</span>
          </div>
        ) : null}
        {dateStr ? (
          <div className="flex items-center gap-1">
            <svg
              className="size-3.5 text-accent opacity-75"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008z"
              />
            </svg>
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
          >
            <svg
              className={`size-3.5 transform transition-transform duration-300 ${isAbstractOpen ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
            {isAbstractOpen ? t("hideAbstract") : t("showAbstract")}
          </button>

          {isAbstractOpen ? (
            <div className="mt-3.5 space-y-3 border-s-4 border-accent/40 ps-5 animate-fadeIn">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">
                  {tWf("abstractLabelEn")}
                </p>
                <p
                  dir="ltr"
                  className="mt-1 text-xs leading-relaxed text-ink/75"
                >
                  {item.abstract}
                </p>
              </div>
              {item.abstractAr?.trim() ? (
                <div className="pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">
                    {tWf("abstractLabelAr")}
                  </p>
                  <p
                    dir="rtl"
                    className="mt-1 text-xs leading-relaxed text-ink/75 font-serif"
                  >
                    {item.abstractAr}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 pt-3 border-t border-ink/[0.05] dark:border-white/[0.05] flex justify-between items-center">
        <Link
          href={`/publications/${encodeURIComponent(pubSlug)}`}
          className="group/btn inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition-all duration-200"
        >
          {t("readArticle")}
          <svg
            className="size-3.5 transform transition-transform duration-300 group-hover/btn:translate-x-1 rtl:rotate-180 rtl:group-hover/btn:-translate-x-1 text-accent"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      </div>
    </article>
  );
}

export function PublicationsCatalogBody() {
  const t = useTranslations("Publications");
  const tApi = useTranslations("ApiErrors");
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
      router.replace(qs ? `/publications?${qs}` : "/publications", {
        scroll: false,
      });
    },
    [router],
  );

  const onQuickQueryChange = useCallback(
    (q: string) => {
      replaceFilters({
        ...filters,
        q: q.trim() || undefined,
      });
    },
    [filters, replaceFilters],
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
        searchMode: searchMode === "keyword" ? undefined : searchMode,
      });
    },
    [filters, replaceFilters],
  );

  const toggleAbstract = (id: string) => {
    setOpenAbstracts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const loadError = error
    ? resolveApiError(error, t("loadFailed"))
    : null;
  const loading = isPending || (isFetching && !isFetchingNextPage);
  const showLoadMore =
    !semanticActive && hasNextPage && !loadError && items.length > 0;

  return (
    <>
      <PublicationsCatalogSearch
        filters={filters}
        onQuickQueryChange={onQuickQueryChange}
        onSearchModeChange={onSearchModeChange}
        onApplyAdvanced={onApplyAdvanced}
        onClear={onClear}
        resultCount={loading ? null : (total ?? items.length)}
        semanticResultsCap={
          semanticActive && !loading ? PUBLICATION_SEMANTIC_DEFAULT_LIMIT : null
        }
        loading={loading}
      />

      {loadError ? (
        <div className="mt-8">
          <ApiErrorState
            className="max-w-none px-0 py-0"
            message={loadError}
            error={error}
            hint={
              error && getApiErrorKind(error) === "rateLimit"
                ? tApi("rateLimitHint")
                : undefined
            }
            onRetry={() => void refetch()}
            retryLabel={tApi("retry")}
          />
        </div>
      ) : null}

      {loading ? (
        <>
          <p className="sr-only" aria-live="polite">
            {t("loading")}
          </p>
          <CatalogSkeleton />
        </>
      ) : !loadError && items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-ink/15 dark:border-white/15 bg-linear-to-b from-surface/50 to-surface-muted/20">
          <div className="relative flex items-center justify-center size-16 rounded-full bg-accent/8 border border-accent/15 text-accent mb-5">
            <span className="absolute inset-0 rounded-full bg-accent/8 animate-pulse" />
            <svg
              className="size-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="font-serif text-lg font-bold text-ink">
            {filtersActive ? t("noResults") : t("empty")}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink/60 max-w-xs">
            {filtersActive ? t("noResultsHint") : t("emptyHint")}
          </p>

          {filtersActive ? (
            <button
              type="button"
              onClick={onClear}
              className="mt-5 rounded-lg border border-accent px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/5 active:scale-[0.98] transition-all duration-200"
            >
              {t("clear")}
            </button>
          ) : null}
        </div>
      ) : (
        !loadError && (
          <div className="mt-6 space-y-5">
            {items.map((p) => (
              <CatalogArticle
                key={p.id}
                item={p}
                locale={locale}
                semanticActive={semanticActive}
                isAbstractOpen={openAbstracts[p.id] ?? false}
                onToggleAbstract={() => toggleAbstract(p.id)}
              />
            ))}

            {showLoadMore ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  className="rounded-lg border border-ink/15 bg-surface px-5 py-2.5 text-xs font-semibold text-ink shadow-sm transition hover:border-accent/30 hover:text-accent disabled:opacity-60"
                >
                  {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
                </button>
              </div>
            ) : null}
          </div>
        )
      )}
    </>
  );
}
