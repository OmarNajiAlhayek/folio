'use client';

import { useCallback } from 'react';
import { FileText, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatMediumDate } from '@/lib/format-date';
import type { PublicationListItem } from '@/lib/publication-types';
import { EMPTY_STATE_CLS } from '@/lib/page-shell';
import { useClientList } from '@/lib/use-client-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Highlight } from '@/components/ui/highlight';
import { ResultCount } from '@/components/ui/result-count';
import { SearchInput } from '@/components/ui/search-input';

type Props = {
  basePath: string;
  articles: PublicationListItem[];
};

/**
 * An issue's table of contents, searchable by title, author or keyword.
 *
 * No pagination: an issue is a bounded object, and splitting its contents
 * across pages would break what a table of contents is for. The rows are
 * server-rendered; this only narrows them.
 */
export function IssueArticlesList({ basePath, articles }: Props) {
  const t = useTranslations('Journals');
  const tList = useTranslations('List');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');

  const toSearchText = useCallback(
    (a: PublicationListItem) =>
      [
        a.title,
        a.titleAr,
        a.author?.displayName,
        a.keywords,
        a.keywordsAr,
        ...(a.disciplines ?? []),
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
    isActive,
    clear,
  } = useClientList({ items: articles, toSearchText, basePath });

  if (articles.length === 0) {
    return (
      <div className={EMPTY_STATE_CLS}>
        <FileText className="h-6 w-6 text-ink/40" aria-hidden />
        <p className="text-sm text-ink/60">{t('noArticles')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* A short contents list is read, not searched. */}
      {articles.length > 5 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            id="issue-articles-q"
            value={draftQuery}
            onChange={setDraftQuery}
            onClear={clear}
            placeholder={t('articleSearchPlaceholder')}
            label={tList('searchLabel')}
            clearLabel={tList('clearSearch')}
            controls="issue-articles-results"
          />
          {isActive ? (
            <ResultCount label={tList('resultCount', { count: matched.length })} />
          ) : null}
        </div>
      ) : null}

      <div id="issue-articles-results">
        {visible.length === 0 ? (
          <EmptyState
            title={t('noArticleResults')}
            hint={t('noArticleResultsHint')}
            action={{ label: tList('clear'), onClick: clear }}
          />
        ) : (
          <ol className="mt-4 space-y-3">
            {visible.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/publications/${a.slug ?? ''}`}
                  className="group block rounded-xl border border-ink/10 bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
                >
                  <h3 className="font-serif text-base font-semibold leading-snug text-ink group-hover:text-accent">
                    <Highlight
                      text={isAr && a.titleAr ? a.titleAr : a.title}
                      query={query}
                    />
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
                    {a.author?.displayName && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5" aria-hidden />
                        <Highlight text={a.author.displayName} query={query} />
                      </span>
                    )}
                    {a.publishedAt && (
                      <span>{formatMediumDate(a.publishedAt, locale)}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
