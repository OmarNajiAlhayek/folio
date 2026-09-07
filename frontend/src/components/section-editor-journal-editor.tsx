'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import { useJournalOptions } from '@/lib/queries/journals';

type Props = {
  userId: string;
};

/**
 * Which journals a section editor serves.
 *
 * Values are journal slugs — the same identifiers the portal URLs use — so an
 * admin screen and a reader's URL name a journal the same way. Until slice 7
 * this surface spoke Arabic discipline labels, which only worked because
 * journals happen to be 1:1 with classifier labels.
 */
export function SectionEditorJournalEditor({ userId }: Props) {
  const t = useTranslations('JournalManagerUsers');
  const locale = useLocale();
  const { data: journalOptions } = useJournalOptions();
  const [journals, setJournals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<string[]>(
        `/users/${userId}/section-editor-journals`,
      );
      setJournals(data);
      setDirty(false);
    } catch {
      // ignore — scope defaults to empty, which means "no journals"
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      await apiJson(`/users/${userId}/section-editor-journals`, {
        method: 'PUT',
        body: JSON.stringify({ journals }),
      });
      setDirty(false);
    } catch {
      // toast handled by parent context if needed
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
