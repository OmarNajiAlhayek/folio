'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ChevronRight, FileText, UserRound } from 'lucide-react';
import { ApiErrorState } from '@/components/api-error-state';
import { getApiErrorKind } from '@/lib/api-error-message';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { LoadingCenter } from '@/components/ui/spinner';
import { formatMediumDate } from '@/lib/format-date';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP, PAGE_SHELL } from '@/lib/page-shell';
import { useJournalIssue } from '@/lib/queries/journals';

export default function JournalIssuePage() {
  const t = useTranslations('Journals');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');
  const params = useParams<{ slug: string; year: string; number: string }>();
  const slug = params?.slug ?? '';
  const year = Number(params?.year);
  const number = Number(params?.number);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations('ApiErrors');
  const { data, isLoading, error, refetch } = useJournalIssue(
    slug,
    year,
    number,
  );

  if (isLoading && !error) {
    return (
      <main className={PAGE_SHELL}>
        <LoadingCenter label={t('loading')} className="mt-8 text-ink/70" />
      </main>
    );
  }

  if (error) {
    const kind = getApiErrorKind(error);
    return (
      <ApiErrorState
        message={resolveApiError(error, t('loadFailed'))}
        error={error}
        title={kind === 'notFound' ? t('notFound') : undefined}
        hint={kind === 'rateLimit' ? tApi('rateLimitHint') : undefined}
        onRetry={() => void refetch()}
        retryLabel={tApi('retry')}
        backHref="/journals"
        backLabel={t('back')}
      />
    );
  }
  if (!data) return null;

  const { journal, issue, articles } = data;
  const journalTitle = isAr ? journal.titleAr : journal.titleEn;
  const issueTitle = isAr ? issue.titleAr : issue.titleEn;

  return (
    <main className={PAGE_SHELL}>
      <nav className="mb-4 text-xs text-ink/55">
        <Link href="/journals" className="hover:text-accent">
          {t('title')}
        </Link>
        <ChevronRight
          className="mx-1 inline h-3 w-3 rtl:rotate-180"
          aria-hidden
        />
        <Link href={`/journals/${journal.slug}`} className="hover:text-accent">
          {journalTitle}
        </Link>
        <ChevronRight
          className="mx-1 inline h-3 w-3 rtl:rotate-180"
          aria-hidden
        />
        <span className="text-ink/75">
          {isAr ? issue.citationAr : issue.citationEn}
        </span>
      </nav>

      <header className="border-s-4 border-s-accent/35 ps-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-accent">
          {journalTitle}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {isAr ? issue.citationAr : issue.citationEn}
        </h1>
        {issueTitle && (
          <p className="mt-2 text-pretty text-sm leading-relaxed text-ink/65">
            {issueTitle}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
          <span>{t('articleCount', { count: issue.articleCount })}</span>
          {issue.publishedAt && (
            <span>{formatMediumDate(issue.publishedAt, locale)}</span>
          )}
        </div>
      </header>

      <h2
        className={`${PAGE_LIST_GAP} font-serif text-xl font-semibold text-ink`}
      >
        {t('contentsHeading')}
      </h2>

      {articles.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <FileText className="h-6 w-6 text-ink/40" aria-hidden />
          <p className="text-sm text-ink/60">{t('noArticles')}</p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/publications/${a.slug ?? ''}`}
                className="group block rounded-xl border border-ink/10 bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
              >
                <h3 className="font-serif text-base font-semibold leading-snug text-ink group-hover:text-accent">
                  {isAr && a.titleAr ? a.titleAr : a.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
                  {a.author?.displayName && (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5" aria-hidden />
                      {a.author.displayName}
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
    </main>
  );
}
