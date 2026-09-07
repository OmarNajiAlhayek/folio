'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BookOpen, Library } from 'lucide-react';
import { ApiErrorState } from '@/components/api-error-state';
import { getApiErrorKind } from '@/lib/api-error-message';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { LoadingCenter } from '@/components/ui/spinner';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP, PAGE_SHELL } from '@/lib/page-shell';
import { useJournals } from '@/lib/queries/journals';

export default function JournalsPortalPage() {
  const t = useTranslations('Journals');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations('ApiErrors');
  const { data, isLoading, error, refetch } = useJournals();

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

  const journals = data ?? [];

  return (
    <main className={PAGE_SHELL}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-accent">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-ink/65">
          {t('hint')}
        </p>
      </header>

      {journals.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <Library className="h-6 w-6 text-ink/40" aria-hidden />
          <p className="text-sm text-ink/60">{t('empty')}</p>
        </div>
      ) : (
        <ul
          className={`${PAGE_LIST_GAP} grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}
        >
          {journals.map((j) => (
            <li key={j.slug}>
              <Link
                href={`/journals/${j.slug}`}
                className="group flex h-full flex-col rounded-xl border border-ink/10 bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
              >
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent">
                  {j.disciplineLabel}
                </span>
                <h2 className="mt-2 font-serif text-lg font-semibold leading-snug text-ink group-hover:text-accent">
                  {isAr ? j.titleAr : j.titleEn}
                </h2>
                {(isAr ? j.descriptionAr : j.descriptionEn) && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/65">
                    {isAr ? j.descriptionAr : j.descriptionEn}
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
    </main>
  );
}
