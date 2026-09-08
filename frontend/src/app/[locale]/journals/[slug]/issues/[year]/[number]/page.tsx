import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChevronRight, FileText, UserRound } from 'lucide-react';
import { formatMediumDate } from '@/lib/format-date';
import type { IssueWithArticles } from '@/lib/journal-types';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP, PAGE_SHELL } from '@/lib/page-shell';
import { serverPublicJson } from '@/lib/server-api';
import { absoluteLocaleUrl, localeAlternates } from '@/lib/site-url';

type Props = {
  params: Promise<{
    locale: string;
    slug: string;
    year: string;
    number: string;
  }>;
};

/**
 * One issue's table of contents.
 *
 * `year` and `number` address the issue rather than an id, because
 * `/journals/engj/issues/2026/3` is the public URL contract. A non-numeric
 * segment is a 404 here rather than a wasted API call — the backend rejects
 * out-of-range values the same way.
 */
async function loadIssue(
  slug: string,
  year: string,
  number: string,
): Promise<IssueWithArticles | null> {
  if (!/^\d+$/.test(year) || !/^\d+$/.test(number)) return null;
  return serverPublicJson<IssueWithArticles>(
    `/public/journals/${encodeURIComponent(slug)}/issues/${year}/${number}`,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug, year, number } = await params;
  const data = await loadIssue(slug, year, number);
  if (!data) return {};

  const isAr = locale.startsWith('ar');
  const journalTitle = isAr ? data.journal.titleAr : data.journal.titleEn;
  const citation = isAr ? data.issue.citationAr : data.issue.citationEn;
  const path = `/journals/${slug}/issues/${year}/${number}`;

  return {
    title: `${journalTitle} — ${citation}`,
    description: (isAr ? data.issue.titleAr : data.issue.titleEn) ?? undefined,
    alternates: {
      canonical: absoluteLocaleUrl(locale, path) ?? undefined,
      languages: localeAlternates(path),
    },
  };
}

export default async function JournalIssuePage({ params }: Props) {
  const { locale, slug, year, number } = await params;
  setRequestLocale(locale);

  const data = await loadIssue(slug, year, number);
  if (!data) notFound();

  const t = await getTranslations({ locale, namespace: 'Journals' });
  const isAr = locale.startsWith('ar');
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
