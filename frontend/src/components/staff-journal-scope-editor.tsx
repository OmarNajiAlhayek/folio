'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import { useJournalOptions } from '@/lib/queries/journals';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';

/** The journal-scoped role being assigned; each has its own endpoint. */
export type StaffJournalScope = 'section-editor' | 'editor';

const SCOPE_PATH: Record<StaffJournalScope, string> = {
  'section-editor': 'section-editor-journals',
  editor: 'editor-journals',
};

type Props = {
  userId: string;
  scope: StaffJournalScope;
};

/**
 * Which journals a staff user serves in one role: section editor, or
 * editor-in-chief. An editor with no journal here has an empty queue and can
 * edit no journal's details, so this is where each year's editor-in-chief is
 * put in charge.
 *
 * Values are journal slugs — the same identifiers the portal URLs use — so an
 * admin screen and a reader's URL name a journal the same way.
 */
export function StaffJournalScopeEditor({ userId, scope }: Props) {
  const t = useTranslations('JournalManagerUsers');
  const locale = useLocale();
  const showApiError = useToastApiError();
  const { data: journalOptions } = useJournalOptions();
  const [journals, setJournals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const path = `/users/${userId}/${SCOPE_PATH[scope]}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<string[]>(path);
      setJournals(data);
      setDirty(false);
    } catch {
      // ignore — scope defaults to empty, which means "no journals"
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const stored = await apiJson<string[]>(path, {
        method: 'PUT',
        body: JSON.stringify({ journals }),
      });
      setJournals(stored);
      setDirty(false);
      toast.success(t('journalsSaved'));
    } catch (err) {
      showApiError(err, t('journalsSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const options = useMemo(
    () =>
      (journalOptions ?? []).map((j) => ({
        value: j.slug,
        label: locale === 'ar' ? j.titleAr : j.titleEn,
      })),
    [journalOptions, locale],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-ink/50">
        <Spinner className="h-3 w-3" />
        {t('loadingJournals')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MultiSelect
        options={options}
        value={journals}
        onChange={(next) => {
          setJournals(next);
          setDirty(true);
        }}
        emptyLabel={t('noJournalsSelected')}
        manySelectedLabel={(c) => `${c} ${t('journalsSelected')}`}
        className="w-full"
      />
      {dirty && (
        <Button
          size="sm"
          disabled={saving}
          onClick={() => void save()}
          className="w-full text-xs"
        >
          {saving ? <Spinner className="h-3 w-3 me-1" /> : null}
          {t('saveJournals')}
        </Button>
      )}
    </div>
  );
}
