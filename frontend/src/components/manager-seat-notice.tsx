'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditableJournals } from '@/lib/queries/journal-admin';
import { useMe } from '@/lib/queries/auth';
import { ROLE_SLUGS } from '@/lib/permissions';

/**
 * A journal manager's permissions reach the whole press, but every journal
 * action also needs a seat on that journal. Someone who accepted the role and
 * was never handed a journal, or who handed over their last one, sees these
 * pages and then gets refusals and empty lists with no explanation.
 */
export function ManagerSeatNotice() {
  const t = useTranslations('ManagerSeatNotice');
  const { data: me } = useMe();
  const { data: editable, isSuccess } = useEditableJournals();

  if (!me?.roles.includes(ROLE_SLUGS.JOURNAL_MANAGER) || !isSuccess) {
    return null;
  }
  if (editable.some((journal) => journal.canEditTitles)) return null;

  return (
    <div
      role="status"
      className="mx-auto mt-4 flex max-w-5xl items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{t('title')}</p>
        <p className="mt-1 leading-relaxed">{t('body')}</p>
      </div>
    </div>
  );
}
