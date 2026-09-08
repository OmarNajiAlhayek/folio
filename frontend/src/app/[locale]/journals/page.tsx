import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BookOpen, Library } from 'lucide-react';
import type { PortalJournal } from '@/lib/journal-types';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP, PAGE_SHELL } from '@/lib/page-shell';
import { serverPublicJson } from '@/lib/server-api';
import { absoluteLocaleUrl, localeAlternates } from '@/lib/site-url';

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The press portal. A server component: unauthenticated, read-only, and one of
 * the three routes a crawler needs to reach the archive at all.
 */

async function loadJournals(): Promise<PortalJournal[]> {
  return (await serverPublicJson<PortalJournal[]>('/public/journals')) ?? [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Journals' });
  return {
    title: t('title'),
    description: t('hint'),
    alternates: {
      canonical: absoluteLocaleUrl(locale, '/journals') ?? undefined,
      languages: localeAlternates('/journals'),
    },
  };
}

export default async function JournalsPortalPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'Journals' });
  const isAr = locale.startsWith('ar');
  const journals = await loadJournals();

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
