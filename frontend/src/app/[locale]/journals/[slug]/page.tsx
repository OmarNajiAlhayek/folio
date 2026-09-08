import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BookOpen, ChevronRight, Library } from 'lucide-react';
import { formatMediumDate } from '@/lib/format-date';
import type { JournalWithIssues } from '@/lib/journal-types';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP, PAGE_SHELL } from '@/lib/page-shell';
import { serverPublicJson } from '@/lib/server-api';
import { absoluteLocaleUrl, localeAlternates } from '@/lib/site-url';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

async function loadJournal(slug: string): Promise<JournalWithIssues | null> {
  return serverPublicJson<JournalWithIssues>(
    `/public/journals/${encodeURIComponent(slug)}`,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await loadJournal(slug);
  if (!data) return {};

  const isAr = locale.startsWith('ar');
  const { journal } = data;
  const title = isAr ? journal.titleAr : journal.titleEn;
  const description =
    (isAr ? journal.descriptionAr : journal.descriptionEn) ?? undefined;
  const path = `/journals/${slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: absoluteLocaleUrl(locale, path) ?? undefined,
      languages: localeAlternates(path),
    },
  };
}

export default async function JournalPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const data = await loadJournal(slug);
  if (!data) notFound();

  const t = await getTranslations({ locale, namespace: 'Journals' });
  const isAr = locale.startsWith('ar');
  const { journal, issues } = data;

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
        <span className="text-ink/75">
          {isAr ? journal.titleAr : journal.titleEn}
        </span>
      </nav>

      <header className="border-s-4 border-s-accent/35 ps-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-accent">
          {journal.disciplineLabel}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {isAr ? journal.titleAr : journal.titleEn}
        </h1>
        {(isAr ? journal.descriptionAr : journal.descriptionEn) && (
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-ink/65">
            {isAr ? journal.descriptionAr : journal.descriptionEn}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            {t('articleCount', { count: journal.articleCount })}
          </span>
          {journal.issn && <span dir="ltr">ISSN {journal.issn}</span>}
          {journal.eissn && <span dir="ltr">e-ISSN {journal.eissn}</span>}
        </div>
      </header>

      <h2
        className={`${PAGE_LIST_GAP} font-serif text-xl font-semibold text-ink`}
      >
        {t('issuesHeading')}
      </h2>

      {issues.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <Library className="h-6 w-6 text-ink/40" aria-hidden />
          <p className="text-sm text-ink/60">{t('noIssues')}</p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {issues.map((i) => (
            <li key={`${i.year}-${i.number}`}>
              <Link
                href={`/journals/${journal.slug}/issues/${i.year}/${i.number}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-surface px-5 py-4 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
              >
                <span>
                  <span className="block font-serif text-base font-semibold text-ink group-hover:text-accent">
                    {isAr ? i.citationAr : i.citationEn}
                  </span>
                  {(isAr ? i.titleAr : i.titleEn) && (
                    <span className="mt-0.5 block text-sm text-ink/65">
                      {isAr ? i.titleAr : i.titleEn}
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
      )}
    </main>
  );
}
