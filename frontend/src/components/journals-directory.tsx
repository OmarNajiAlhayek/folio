'use client';

import { BookOpen, Library } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { PortalJournal } from '@/lib/journal-types';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP } from '@/lib/page-shell';

type Props = {
  journals: PortalJournal[];
};

/** The journal directory: every journal rendered as a card. */
export function JournalsDirectory({ journals }: Props) {
  const t = useTranslations('Journals');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');

  if (journals.length === 0) {
    return (
      <div className={EMPTY_STATE_CLS}>
        <Library className="h-6 w-6 text-ink/40" aria-hidden />
        <p className="text-sm text-ink/60">{t('empty')}</p>
      </div>
    );
  }

  return (
    <section className={PAGE_LIST_GAP}>
      <div id="journals-results">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {journals.map((j) => (
            <li key={j.slug}>
              <Link
                href={`/journals/${j.slug}`}
                className="group flex h-full flex-col rounded-xl border border-ink/10 bg-surface p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md dark:border-white/10"
              >
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
      </div>
    </section>
  );
}
