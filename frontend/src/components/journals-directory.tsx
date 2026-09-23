'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Library } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  filterJournals,
  journalDisciplines,
  toSearchableJournals,
} from '@/lib/journal-directory-filter';
import { createListQuery } from '@/lib/list-query';
import { useListQueryState } from '@/lib/use-list-query-state';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { PortalJournal } from '@/lib/journal-types';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP } from '@/lib/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChips, type FilterChip } from '@/components/ui/filter-chips';
import { Highlight } from '@/components/ui/highlight';
import { ResultCount } from '@/components/ui/result-count';
import { SearchInput } from '@/components/ui/search-input';
import { SearchableSelect } from '@/components/ui/searchable-select';

type FilterKey = 'q' | 'discipline';

const journalsQuery = createListQuery<FilterKey>({
  keys: ['q', 'discipline'],
});

/** Nine journals arrive with the page, so typing filters them without a round trip. */
const SEARCH_DEBOUNCE_MS = 200;

type Props = {
  journals: PortalJournal[];
};

/**
 * Search and discipline filter over the journal directory.
 *
 * The rows are handed down from the server component, which renders the full
 * list into the SSR HTML — a crawler still sees every journal, and this only
 * narrows what is already on the page. With nine rows there is nothing to
 * paginate and no reason to ask the server on every keystroke.
 */
export function JournalsDirectory({ journals }: Props) {
  const t = useTranslations('Journals');
  const tList = useTranslations('List');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');

  const { filters, setFilter, setFilters, removeFilter, clear, isActive } =
    useListQueryState(journalsQuery, '/journals');

  // The input is typed into directly and synced to the URL on a debounce, so a
  // keystroke never waits on a navigation.
  const [draftQuery, setDraftQuery] = useState(filters.q ?? '');
  const debouncedQuery = useDebouncedValue(draftQuery, SEARCH_DEBOUNCE_MS);

  /* eslint-disable react-hooks/set-state-in-effect -- the box mirrors URL state on back/forward and clear */
  useEffect(() => {
    setDraftQuery(filters.q ?? '');
  }, [filters.q]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (debouncedQuery.trim() !== (filters.q ?? '').trim()) {
      setFilter('q', debouncedQuery);
    }
  }, [debouncedQuery, filters.q, setFilter]);

  const disciplineOptions = useMemo(
    () => [
      { value: '', label: t('disciplineAny') },
      ...journalDisciplines(journals, locale).map((label) => ({
        value: label,
        label,
      })),
    ],
    [journals, locale, t],
  );

  // Fold each journal once, not once per keystroke.
  const searchable = useMemo(() => toSearchableJournals(journals), [journals]);

  const activeQuery = filters.q ?? '';
  const visible = useMemo(
    () =>
      filterJournals(searchable, {
        q: activeQuery,
        discipline: filters.discipline,
      }),
    [searchable, activeQuery, filters.discipline],
  );

  const chips = useMemo<FilterChip<FilterKey>[]>(() => {
    const out: FilterChip<FilterKey>[] = [];
    if (filters.q?.trim()) {
      out.push({ key: 'q', label: t('filterChipQuery', { value: filters.q.trim() }) });
    }
    if (filters.discipline?.trim()) {
      out.push({
        key: 'discipline',
        label: t('filterChipDiscipline', { value: filters.discipline.trim() }),
      });
    }
    return out;
  }, [filters.q, filters.discipline, t]);

  const handleClear = useCallback(() => {
    setDraftQuery('');
    clear();
  }, [clear]);

  const handleDiscipline = useCallback(
    (value: string) => {
      setFilters({ ...filters, discipline: value || undefined });
    },
    [filters, setFilters],
  );

  if (journals.length === 0) {
    return (
      <div className={EMPTY_STATE_CLS}>
        <Library className="h-6 w-6 text-ink/40" aria-hidden />
        <p className="text-sm text-ink/60">{t('empty')}</p>
      </div>
    );
  }

  return (
    <section className={PAGE_LIST_GAP}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          id="journals-q"
          value={draftQuery}
          onChange={setDraftQuery}
          placeholder={t('searchPlaceholder')}
          label={tList('searchLabel')}
          clearLabel={tList('clearSearch')}
          controls="journals-results"
        />
        <div className="w-full sm:w-64">
          <SearchableSelect
            options={disciplineOptions}
            value={filters.discipline ?? ''}
            onValueChange={handleDiscipline}
            placeholder={t('disciplineAny')}
            searchPlaceholder={t('disciplineSearchPlaceholder')}
            emptyText={t('disciplineEmpty')}
            className="w-full text-start"
          />
        </div>
      </div>

      <FilterChips
        chips={chips}
        onRemove={removeFilter}
        label={tList('activeFiltersLabel')}
        removeLabel={(label) => tList('removeFilter', { label })}
        className="mt-3"
      />

      {isActive ? (
        <ResultCount
          className="mt-3"
          label={tList('resultCount', { count: visible.length })}
        />
      ) : null}

      <div id="journals-results" aria-live="polite">
        {visible.length === 0 ? (
          <EmptyState
            title={t('noResults')}
            hint={t('noResultsHint')}
            action={{ label: tList('clear'), onClick: handleClear }}
          />
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((j) => (
              <li key={j.slug}>
                <Link
                  href={`/journals/${j.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-ink/10 bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
                >
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent">
                    <Highlight text={j.disciplineLabel} query={activeQuery} />
                  </span>
                  <h2 className="mt-2 font-serif text-lg font-semibold leading-snug text-ink group-hover:text-accent">
                    <Highlight
                      text={isAr ? j.titleAr : j.titleEn}
                      query={activeQuery}
                    />
                  </h2>
                  {(isAr ? j.descriptionAr : j.descriptionEn) && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/65">
                      <Highlight
                        text={(isAr ? j.descriptionAr : j.descriptionEn) ?? ''}
                        query={activeQuery}
                      />
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-ink/60">
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden />
                      {t('articleCount', { count: j.articleCount })}
                    </span>
                    {j.latestIssue && (
                      <span>
                        {t('latestIssue', {
                          issue: isAr
                            ? j.latestIssue.citationAr
                            : j.latestIssue.citationEn,
                        })}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
