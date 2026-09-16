import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  BOARD_GROUP_KEY,
  EDITORIAL_BOARD_ROLES,
  boardMemberAffiliation,
  boardMemberName,
  type PublicEditorialBoardMember,
} from '@/lib/editorial-board';
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
  const groups = EDITORIAL_BOARD_ROLES.map((role) => ({
    role,
    members: board.filter((m) => m.role === role),
  })).filter((g) => g.members.length > 0);

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

      {groups.length === 0 ? (
        <div className={`${EMPTY_STATE_CLS} ${PAGE_LIST_GAP}`}>
          <Users className="h-6 w-6 text-ink/40" aria-hidden />
          <p className="text-sm text-ink/60">{t('editorialBoardEmpty')}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.role}
            className={PAGE_LIST_GAP}
            aria-labelledby={`board-${group.role}`}
          >
            <h2
              id={`board-${group.role}`}
              className="font-serif text-xl font-semibold text-ink"
            >
              {t(BOARD_GROUP_KEY[group.role])}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.members.map((m, index) => {
                const name = boardMemberName(m, isAr);
                const affiliation = boardMemberAffiliation(m, isAr);
                return (
                  <li
                    key={m.orcid ?? `${name}-${index}`}
                    className="rounded-xl border border-ink/10 bg-surface px-5 py-4 shadow-sm dark:border-white/10"
                  >
                    <p className="font-serif text-base font-semibold text-ink">
                      {name}
                    </p>
                    {affiliation ? (
                      <p className="mt-0.5 text-sm text-ink/65">
                        {affiliation}
                      </p>
                    ) : null}
                    {m.orcid ? (
                      <a
                        href={`https://orcid.org/${m.orcid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        aria-label={t('orcidProfile', { name })}
                        className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition hover:text-accent"
                      >
                        <span
                          aria-hidden
                          className="inline-flex size-4 items-center justify-center rounded-full bg-[#A6CE39] font-sans text-[8px] font-bold text-white"
                        >
                          iD
                        </span>
                        {m.orcid}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
