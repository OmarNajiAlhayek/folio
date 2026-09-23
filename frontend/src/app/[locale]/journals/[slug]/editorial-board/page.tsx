import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { PublicEditorialBoardMember } from '@/lib/editorial-board';
import type { JournalWithIssues } from '@/lib/journal-types';
import { EditorialBoardList } from '@/components/editorial-board-list';
import { PAGE_SHELL } from '@/lib/page-shell';
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

async function loadBoard(
  slug: string,
): Promise<PublicEditorialBoardMember[] | null> {
  return serverPublicJson<PublicEditorialBoardMember[]>(
    `/public/journals/${encodeURIComponent(slug)}/editorial-board`,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await loadJournal(slug);
  if (!data) return {};

  const t = await getTranslations({ locale, namespace: 'Journals' });
  const isAr = locale.startsWith('ar');
  const journalTitle = isAr ? data.journal.titleAr : data.journal.titleEn;
  const path = `/journals/${slug}/editorial-board`;

  return {
    title: `${t('editorialBoard')} · ${journalTitle}`,
    alternates: {
      canonical: absoluteLocaleUrl(locale, path) ?? undefined,
      languages: localeAlternates(path),
    },
  };
}

/**
 * A journal's editorial board — the URL given to DOAJ. Grouped by position in
 * the fixed order of `EDITORIAL_BOARD_ROLES`; within a group, the order staff
 * set. Empty positions are left out rather than shown as blanks.
 */
export default async function EditorialBoardPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [data, board] = await Promise.all([loadJournal(slug), loadBoard(slug)]);
  if (!data || !board) notFound();

  const t = await getTranslations({ locale, namespace: 'Journals' });
  const isAr = locale.startsWith('ar');
  const { journal } = data;
  const journalTitle = isAr ? journal.titleAr : journal.titleEn;
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
        <span className="text-ink/75">{t('editorialBoard')}</span>
      </nav>

      <header className="border-s-4 border-s-accent/35 ps-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-accent">
          {journalTitle}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t('editorialBoard')}
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-ink/65">
          {t('editorialBoardHint')}
        </p>
      </header>

      <EditorialBoardList
        basePath={`/journals/${journal.slug}/editorial-board`}
        board={board}
      />
    </main>
  );
}
