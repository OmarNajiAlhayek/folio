import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BookOpen, ChevronRight, Users } from 'lucide-react';
import type { JournalWithIssues } from '@/lib/journal-types';
import { JournalIssuesList } from '@/components/journal-issues-list';
import { PAGE_LIST_GAP, PAGE_SHELL } from '@/lib/page-shell';
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
          <Link
            href={`/journals/${journal.slug}/editorial-board`}
            className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {t('editorialBoard')}
          </Link>
        </div>
      </header>

      <h2
        className={`${PAGE_LIST_GAP} font-serif text-xl font-semibold text-ink`}
      >
        {t('issuesHeading')}
      </h2>

      <JournalIssuesList journalSlug={journal.slug} issues={issues} />
    </main>
  );
}
