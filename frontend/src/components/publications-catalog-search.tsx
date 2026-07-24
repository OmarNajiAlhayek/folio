'use client';

import { FileText, Landmark, Search, UserRound, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PUBLICATION_CATALOG_QUICK_SEARCH_DEBOUNCE_MS,
  useDebouncedValue,
} from '@/lib/use-debounced-value';
import { useTranslations, useLocale } from 'next-intl';
import { useDisciplineLabel } from '@/lib/use-discipline-label';
import { formatMediumDate } from '@/lib/format-date';
import type {
  PublicationCatalogFilters,
  PublicationSearchMode,
} from '@/lib/public-submissions-query';
import { SUBMISSION_ARTICLE_TYPES } from '@/lib/validation/constants';
import { cn } from '@/lib/utils';
import { PublicationAuthorTypeahead } from '@/components/publication-author-typeahead';
import { DatePicker } from '@/components/ui/date-picker';
import { SimpleSelect } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { SimpleTooltip } from '@/components/ui/tooltip';

type Props = {
  filters: PublicationCatalogFilters;
  onQuickQueryChange: (q: string) => void;
  onSearchModeChange: (mode: PublicationSearchMode) => void;
  onApplyAdvanced: (draft: PublicationCatalogFilters) => void;
  onClear: () => void;
  onRemoveFilter: (key: keyof PublicationCatalogFilters) => void;
  resultCount: number | null;
  semanticResultsCap: number | null;
  loading: boolean;
  isUpdating?: boolean;
};

type ActiveFilterChip = {
  key: keyof PublicationCatalogFilters;
  label: string;
};

export function PublicationsCatalogSearch({
  filters,
  onQuickQueryChange,
  onSearchModeChange,
  onApplyAdvanced,
  onClear,
  onRemoveFilter,
  resultCount,
  semanticResultsCap,
  loading,
  isUpdating = false,
}: Props) {
  const t = useTranslations('Publications');
  const tWf = useTranslations('SubmissionWorkflow');
  const locale = useLocale();
  const { selectableOptions, format: formatDiscipline } = useDisciplineLabel();
  const [quickQ, setQuickQ] = useState(filters.q ?? '');
  const debouncedQ = useDebouncedValue(
    quickQ,
    PUBLICATION_CATALOG_QUICK_SEARCH_DEBOUNCE_MS,
  );
  const applyQuickQueryRef = useRef(onQuickQueryChange);
  useEffect(() => {
    applyQuickQueryRef.current = onQuickQueryChange;
  }, [onQuickQueryChange]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [author, setAuthor] = useState(filters.author ?? '');
  const [discipline, setDiscipline] = useState(filters.discipline ?? '');
  const [articleType, setArticleType] = useState(filters.articleType ?? '');
  const [publishedFrom, setPublishedFrom] = useState<Date | undefined>(
    filters.publishedFrom ? parseISO(filters.publishedFrom) : undefined,
  );
  const [publishedTo, setPublishedTo] = useState<Date | undefined>(
    filters.publishedTo ? parseISO(filters.publishedTo) : undefined,
  );
  const searchMode: PublicationSearchMode = filters.searchMode ?? 'keyword';

  // Sync local draft fields when parent filters change (e.g. clear, back/forward).
  /* eslint-disable react-hooks/set-state-in-effect -- controlled filter draft mirrors URL state */
  useEffect(() => {
    setQuickQ(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    setAuthor(filters.author ?? '');
    setDiscipline(filters.discipline ?? '');
    setArticleType(filters.articleType ?? '');
    setPublishedFrom(
      filters.publishedFrom ? parseISO(filters.publishedFrom) : undefined,
    );
    setPublishedTo(
      filters.publishedTo ? parseISO(filters.publishedTo) : undefined,
    );
  }, [
    filters.author,
    filters.discipline,
    filters.articleType,
    filters.publishedFrom,
    filters.publishedTo,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const trimmed = debouncedQ.trim();
    if (trimmed !== (filters.q ?? '').trim()) {
      applyQuickQueryRef.current(debouncedQ);
    }
  }, [debouncedQ, filters.q]);

  const handleApply = useCallback(() => {
    onApplyAdvanced({
      q: filters.q,
      searchMode: filters.searchMode,
      author: author.trim() || undefined,
      discipline: discipline || undefined,
      articleType: articleType || undefined,
      publishedFrom: publishedFrom
        ? format(publishedFrom, 'yyyy-MM-dd')
        : undefined,
      publishedTo: publishedTo ? format(publishedTo, 'yyyy-MM-dd') : undefined,
    });
  }, [
    filters.q,
    filters.searchMode,
    author,
    discipline,
    articleType,
    publishedFrom,
    publishedTo,
    onApplyAdvanced,
  ]);

  const disciplineOptions = [
    { value: '', label: t('disciplineAny') },
    ...selectableOptions,
  ];

  const articleTypeOptions = [
    { value: '', label: tWf('articleTypePlaceholder') },
    ...SUBMISSION_ARTICLE_TYPES.map((type) => ({
      value: type,
      label: tWf(`articleType_${type}`),
    })),
  ];

  const advancedFilterCount = useMemo(
    () =>
      [
        filters.author,
        filters.discipline,
        filters.articleType,
        filters.publishedFrom,
        filters.publishedTo,
      ].filter((value) => Boolean(value?.trim())).length,
    [
      filters.author,
      filters.discipline,
      filters.articleType,
      filters.publishedFrom,
      filters.publishedTo,
    ],
  );

  const activeFilterChips = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (filters.q?.trim()) {
      chips.push({
        key: 'q',
        label: t('filterChipQuery', { value: filters.q.trim() }),
      });
    }
    if (filters.searchMode === 'semantic') {
      chips.push({
        key: 'searchMode',
        label: t('searchModeSemantic'),
      });
    }
    if (filters.author?.trim()) {
      chips.push({
        key: 'author',
        label: t('filterChipAuthor', { value: filters.author.trim() }),
      });
    }
    if (filters.discipline?.trim()) {
      chips.push({
        key: 'discipline',
        label: t('filterChipDiscipline', {
          value: formatDiscipline(filters.discipline),
        }),
      });
    }
    if (filters.articleType?.trim()) {
      chips.push({
        key: 'articleType',
        label: t('filterChipArticleType', {
          value: tWf(`articleType_${filters.articleType}`),
        }),
      });
    }
    if (filters.publishedFrom?.trim()) {
      chips.push({
        key: 'publishedFrom',
        label: t('filterChipPublishedFrom', {
          date: formatMediumDate(filters.publishedFrom, locale),
        }),
      });
    }
    if (filters.publishedTo?.trim()) {
      chips.push({
        key: 'publishedTo',
        label: t('filterChipPublishedTo', {
          date: formatMediumDate(filters.publishedTo, locale),
        }),
      });
    }

    return chips;
  }, [filters, formatDiscipline, locale, t, tWf]);

  const handleClearSearch = useCallback(() => {
    setQuickQ('');
    applyQuickQueryRef.current('');
  }, []);

  return (
    <div className="mt-8 space-y-4">
      {/* Search mode + quick search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className="flex w-fit shrink-0 self-start rounded-xl border border-ink/15 dark:border-white/15 bg-surface/80 p-1"
          role="radiogroup"
          aria-label={t('searchModeLabel')}
        >
          {(['keyword', 'semantic'] as const).map((mode) => {
            const isActive = searchMode === mode;
            const label =
              mode === 'keyword'
                ? t('searchModeText')
                : t('searchModeSemantic');
            const tooltip =
              mode === 'keyword'
                ? t('searchModeTextTooltip')
                : t('searchModeSemanticTooltip');
            const ariaLabel =
              mode === 'keyword'
                ? t('searchModeTextAria')
                : t('searchModeSemanticAria');

            return (
              <SimpleTooltip key={mode} content={tooltip}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => onSearchModeChange(mode)}
                  aria-label={ariaLabel}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-ink/70 hover:text-ink hover:bg-ink/5'
                  }`}
                >
                  {label}
                </button>
              </SimpleTooltip>
            );
          })}
        </div>
        <div className="relative flex-1 flex items-center">
          <label className="sr-only" htmlFor="pub-catalog-q">
            {t('searchPlaceholder')}
          </label>
          <div
            className="absolute start-3 pointer-events-none text-ink/35 z-10"
            aria-hidden
          >
            <Search className="size-4" strokeWidth={2.5} aria-hidden />
          </div>
          <input
            id="pub-catalog-q"
            type="search"
            value={quickQ}
            onChange={(e) => setQuickQ(e.target.value)}
            placeholder={
              searchMode === 'semantic'
                ? t('searchPlaceholderSemantic')
                : t('searchPlaceholder')
            }
            className={cn(
              'w-full rounded-xl border border-ink/15 dark:border-white/15 bg-surface/90 ps-9 py-2.5 text-sm text-ink outline-hidden transition focus:border-accent focus:ring-2 focus:ring-accent/15',
              quickQ.trim() ? 'pe-9' : 'pe-4',
            )}
            autoComplete="off"
          />
          {quickQ.trim() ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute end-2.5 z-10 rounded-md p-1 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
              aria-label={t('clearSearch')}
            >
              <X className="size-4" strokeWidth={2.5} aria-hidden />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className={cn(
            'relative shrink-0 flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 dark:border-white/15 bg-surface/80 px-5 py-2.5 text-sm font-semibold text-ink/80 transition-all duration-300 hover:border-ink/25 hover:text-ink active:scale-[0.98]',
            advancedOpen &&
              'bg-accent/8 border-accent/20 text-accent hover:border-accent/35',
            advancedFilterCount > 0 &&
              !advancedOpen &&
              'border-accent/25 text-ink',
          )}
          aria-expanded={advancedOpen}
          aria-controls="pub-advanced-filters"
        >
          {t('advancedSearch')}
          {advancedFilterCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {advancedFilterCount}
            </span>
          ) : null}
          <span
            className={`inline-block text-[10px] transform transition-transform duration-300 ${advancedOpen ? 'rotate-180 text-accent' : 'text-ink/40'}`}
          >
            ▼
          </span>
        </button>
      </div>

      {activeFilterChips.length > 0 ? (
        <ul
          className="flex flex-wrap items-center gap-2"
          aria-label={t('activeFiltersLabel')}
        >
          {activeFilterChips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => onRemoveFilter(chip.key)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/8 px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent/40 hover:bg-accent/12"
                aria-label={t('removeFilter', { label: chip.label })}
              >
                <span className="truncate" dir="auto" title={chip.label}>
                  {chip.label}
                </span>
                <X
                  className="size-3 shrink-0 opacity-70"
                  strokeWidth={2.5}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Advanced Filters Panel */}
      <CollapsibleSection
        id="pub-advanced-filters"
        open={advancedOpen}
        contentClassName="relative overflow-visible rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-5 shadow-md backdrop-blur-md"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Author Name */}
          <div className="relative z-20 sm:col-span-2">
            <label
              htmlFor="pub-adv-author"
              className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
            >
              {t('advancedAuthor')}
            </label>
            <div className="relative mt-1.5">
              <div
                className="absolute start-3 top-1/2 z-10 -translate-y-1/2 pointer-events-none text-ink/35"
                aria-hidden
              >
                <UserRound className="size-4" strokeWidth={2} aria-hidden />
              </div>
              <PublicationAuthorTypeahead
                id="pub-adv-author"
                value={author}
                onChange={setAuthor}
                className="w-full"
                inputClassName="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 ps-9 pe-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </div>
            <p className="mt-1 text-[10px] text-ink/50 leading-tight">
              {t('advancedAuthorHint')}
            </p>
          </div>

          {/* Academic Discipline */}
          <div>
            <label
              htmlFor="pub-adv-discipline"
              className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
            >
              {t('discipline')}
            </label>
            <div className="relative flex items-center mt-1.5 w-full">
              <div
                className="absolute start-3 pointer-events-none text-ink/35 z-10"
                aria-hidden
              >
                <Landmark className="size-4" strokeWidth={2} aria-hidden />
              </div>
              <SearchableSelect
                options={disciplineOptions}
                value={discipline}
                onValueChange={setDiscipline}
                placeholder={t('disciplineAny')}
                searchPlaceholder={tWf('disciplineSearchPlaceholder')}
                emptyText={tWf('disciplineEmpty')}
                className="ps-9 w-full text-start"
              />
            </div>
          </div>

          {/* Article Type */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45">
              {t('articleType')}
            </label>
            <div className="relative flex items-center mt-1.5 w-full">
              <div
                className="absolute start-3 pointer-events-none text-ink/35 z-10"
                aria-hidden
              >
                <FileText className="size-4" strokeWidth={2} aria-hidden />
              </div>
              <SimpleSelect
                value={articleType}
                onValueChange={setArticleType}
                placeholder={tWf('articleTypePlaceholder')}
                className="ps-9 w-full text-start"
                options={articleTypeOptions}
              />
            </div>
          </div>

          {/* Published From Date */}
          <div>
            <label
              htmlFor="pub-adv-from"
              className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
            >
              {t('publishedFrom')}
            </label>
            <div className="mt-1.5">
              <DatePicker
                id="pub-adv-from"
                value={publishedFrom}
                onChange={setPublishedFrom}
                aria-label={t('publishedFrom')}
              />
            </div>
          </div>

          {/* Published To Date */}
          <div>
            <label
              htmlFor="pub-adv-to"
              className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
            >
              {t('publishedTo')}
            </label>
            <div className="mt-1.5">
              <DatePicker
                id="pub-adv-to"
                value={publishedTo}
                onChange={setPublishedTo}
                aria-label={t('publishedTo')}
              />
            </div>
          </div>
        </div>

        {/* Action triggers */}
        <div className="mt-5 flex flex-wrap gap-2 pt-4 border-t border-ink/[0.06] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={handleApply}
            className="rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
          >
            {t('apply')}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-ink/15 dark:border-white/15 px-5 py-2.5 text-xs font-semibold text-ink/75 hover:bg-ink/5 active:scale-[0.98] transition-all duration-200"
          >
            {t('clear')}
          </button>
        </div>
      </CollapsibleSection>

      {/* Query count indicator */}
      {!loading && resultCount !== null ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 transition-opacity duration-200',
            isUpdating && 'opacity-70',
          )}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-ink/55 bg-ink/[0.03] dark:bg-white/[0.03] border border-ink/[0.05] max-w-fit px-3.5 py-1 rounded-full">
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-accent opacity-75 animate-ping" />
              <span className="relative rounded-full size-1.5 bg-accent" />
            </span>
            {t('resultCount', { count: resultCount })}
          </div>
          {semanticResultsCap != null ? (
            <p className="text-[11px] text-ink/50 max-w-md leading-snug">
              {t('semanticResultsCap', { limit: semanticResultsCap })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
