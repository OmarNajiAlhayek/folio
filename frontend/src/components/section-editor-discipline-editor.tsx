'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import { ARABIC_DISCIPLINE_LABELS } from '@/lib/discipline-labels';

type Props = {
  userId: string;
};

export function SectionEditorDisciplineEditor({ userId }: Props) {
  const t = useTranslations('JournalManager');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<string[]>(
        `/users/${userId}/section-editor-disciplines`,
      );
      setDisciplines(data);
      setDirty(false);
    } catch {
      // ignore — disciplines default to empty
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
      await apiJson(`/users/${userId}/section-editor-disciplines`, {
        method: 'PUT',
        body: JSON.stringify({ disciplines }),
      });
      setDirty(false);
    } catch {
      // toast handled by parent context if needed
    } finally {
      setSaving(false);
    }
  }

  const options = ARABIC_DISCIPLINE_LABELS.map((d) => ({ value: d, label: d }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-ink/50">
        <Spinner className="h-3 w-3" />
        {t('loadingDisciplines')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MultiSelect
        options={options}
        value={disciplines}
        onChange={(next) => {
          setDisciplines(next);
          setDirty(true);
        }}
        emptyLabel={t('noDisciplinesSelected')}
        manySelectedLabel={(c) => `${c} ${t('disciplinesSelected')}`}
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
          {t('saveDisciplines')}
        </Button>
      )}
    </div>
  );
}
