'use client';

import { useCallback } from 'react';
import { ChevronRight, Library } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatMediumDate } from '@/lib/format-date';
import type { PortalIssueSummary } from '@/lib/journal-types';
import { EMPTY_STATE_CLS } from '@/lib/page-shell';
import { useClientList } from '@/lib/use-client-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Highlight } from '@/components/ui/highlight';
import { Pagination } from '@/components/ui/pagination';
import { ResultCount } from '@/components/ui/result-count';
import { SearchInput } from '@/components/ui/search-input';

/** A long-running journal accumulates issues; past this many, paginate. */
const PAGE_SIZE = 20;

type Props = {
  journalSlug: string;
  issues: PortalIssueSummary[];
};

/**
 * An issue archive, searchable by citation, title or year.
 *
 * The rows come from the server component, which renders them into the SSR
 * HTML, so crawlers still reach every issue page.
 */
export function JournalIssuesList({ journalSlug, issues }: Props) {
  const t = useTranslations('Journals');
  const tList = useTranslations('List');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');

  const toSearchText = useCallback(
    (i: PortalIssueSummary) =>
      [
        i.citationEn,
        i.citationAr,
        i.titleEn,
        i.titleAr,
        String(i.year),
        String(i.number),
      ]
        .filter(Boolean)
        .join(' '),
    [],
  );

  const {
    draftQuery,
    setDraftQuery,
    query,
    visible,
    matched,
    page,
    pageCount,
    setPage,
    isActive,
    clear,
  } = useClientList({
    items: issues,
    toSearchText,
    basePath: `/journals/${journalSlug}`,
    pageSize: PAGE_SIZE,
  });

  if (issues.length === 0) {
    return (
      <div className={EMPTY_STATE_CLS}>
        <Library className="h-6 w-6 text-ink/40" aria-hidden />
        <p className="text-sm text-ink/60">{t('noIssues')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Below a screenful there is nothing to find; the box would be noise. */}
      {issues.length > 6 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            id="journal-issues-q"
            value={draftQuery}
            onChange={setDraftQuery}
            onClear={clear}
            placeholder={t('issueSearchPlaceholder')}
            label={tList('searchLabel')}
            clearLabel={tList('clearSearch')}
            controls="journal-issues-results"
          />
          {isActive ? (
            <ResultCount label={tList('resultCount', { count: matched.length })} />
          ) : null}
        </div>
      ) : null}

      <div id="journal-issues-results">
        {visible.length === 0 ? (
          <EmptyState
            title={t('noIssueResults')}
            hint={t('noIssueResultsHint')}
            action={{ label: tList('clear'), onClick: clear }}
          />
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {visible.map((i) => (
                <li key={`${i.year}-${i.number}`}>
                  <Link
                    href={`/journals/${journalSlug}/issues/${i.year}/${i.number}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-surface px-5 py-4 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
                  >
                    <span>
                      <span className="block font-serif text-base font-semibold text-ink group-hover:text-accent">
                        <Highlight
                          text={isAr ? i.citationAr : i.citationEn}
                          query={query}
                        />
                      </span>
                      {(isAr ? i.titleAr : i.titleEn) && (
                        <span className="mt-0.5 block text-sm text-ink/65">
                          <Highlight
                            text={(isAr ? i.titleAr : i.titleEn) ?? ''}
                            query={query}
                          />
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-ink/55">
                        {t('articleCount', { count: i.articleCount })}
                        {i.publishedAt
                          ? ` · ${formatMediumDate(i.publishedAt, locale)}`
                          : ''}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-ink/35 rtl:rotate-180"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>

            <Pagination
              className="mt-6"
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
              labels={{
                nav: tList('paginationLabel'),
                previous: tList('prevPage'),
                next: tList('nextPage'),
                pageOf: (p, total) =>
                  tList('pageOf', { page: p, totalPages: total }),
                goToPage: (p) => tList('goToPage', { page: p }),
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
