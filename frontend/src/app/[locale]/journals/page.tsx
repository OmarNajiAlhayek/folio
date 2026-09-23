import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { PortalJournal } from '@/lib/journal-types';
import { JournalsDirectory } from '@/components/journals-directory';
import { PAGE_SHELL } from '@/lib/page-shell';
import { serverPublicJson } from '@/lib/server-api';
import { absoluteLocaleUrl, localeAlternates } from '@/lib/site-url';

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The press portal. A server component: unauthenticated, read-only, and one of
 * the three routes a crawler needs to reach the archive at all.
 *
 * The journals are fetched and rendered here, not in the client child, so the
 * full directory is present in the SSR HTML. `JournalsDirectory` only narrows
 * what is already on the page.
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

      <JournalsDirectory journals={journals} />
    </main>
  );
}
