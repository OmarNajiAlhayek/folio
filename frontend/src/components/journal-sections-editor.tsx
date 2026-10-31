'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { apiJson } from '@/lib/api';
import { fetchAdminUsers } from '@/lib/queries/users-admin';
import { ROLE_SLUGS } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';

type SectionEditor = {
  userId: string;
  displayName: string;
  canRecordDecision: boolean;
};

type SectionRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  editors: SectionEditor[];
};

type Candidate = { id: string; displayName: string };

type DraftLink = { userId: string; canRecordDecision: boolean };

/**
 * The journal manager adds sections and links the section editors who
 * receive papers submitted to each one.
 */
export function JournalSectionsEditor({ slug }: { slug: string }) {
  const t = useTranslations('JournalSections');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const showApiError = useToastApiError();
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [sections, users] = await Promise.all([
      apiJson<SectionRow[]>(`/journals/${encodeURIComponent(slug)}/sections`),
      fetchAdminUsers({
        role: ROLE_SLUGS.SECTION_EDITOR,
        limit: 50,
        offset: 0,
      }),
    ]);
    setRows(sections);
    setCandidates(
      users.items.map((user) => ({
        id: user.id,
        displayName: user.displayName,
      })),
    );
  }, [slug]);

  useEffect(() => {
    void load().catch((err) => showApiError(err, t('loadFailed')));
  }, [load, showApiError, t]);

  async function createSection() {
    if (!nameAr.trim() || !nameEn.trim()) return;
    setBusy(true);
    try {
      await apiJson(`/journals/${encodeURIComponent(slug)}/sections`, {
        method: 'POST',
        body: JSON.stringify({ nameAr: nameAr.trim(), nameEn: nameEn.trim() }),
      });
      setNameAr('');
      setNameEn('');
      toast.success(t('saved'));
      await load();
    } catch (err) {
      showApiError(err, t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function saveEditors(sectionId: string, editors: DraftLink[]) {
    setBusy(true);
    try {
      await apiJson(
        `/journals/${encodeURIComponent(slug)}/sections/${sectionId}/editors`,
        { method: 'PUT', body: JSON.stringify({ editors }) },
      );
      toast.success(t('saved'));
      await load();
    } catch (err) {
      showApiError(err, t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-ink/10 p-4 dark:border-white/10">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t('title')}</h3>
        <p className="mt-1 text-xs text-ink/60">{t('hint')}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={nameAr}
          onChange={(event) => setNameAr(event.target.value)}
          placeholder={t('nameAr')}
          className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-xs dark:border-white/15"
        />
        <input
          value={nameEn}
          onChange={(event) => setNameEn(event.target.value)}
          placeholder={t('nameEn')}
          className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-xs dark:border-white/15"
        />
      </div>
      <Button size="sm" disabled={busy} onClick={() => void createSection()}>
        {t('add')}
      </Button>
      <ul className="space-y-3">
        {rows.map((row) => (
          <SectionEditors
            key={row.id}
            section={row}
            isAr={isAr}
            candidates={candidates}
            disabled={busy}
            onSave={(editors) => saveEditors(row.id, editors)}
          />
        ))}
      </ul>
    </section>
  );
}

function SectionEditors({
  section,
  isAr,
  candidates,
  disabled,
  onSave,
}: {
  section: SectionRow;
  isAr: boolean;
  candidates: Candidate[];
  disabled: boolean;
  onSave: (editors: DraftLink[]) => void;
}) {
  const t = useTranslations('JournalSections');
  const [links, setLinks] = useState<DraftLink[]>(
    section.editors.map((editor) => ({
      userId: editor.userId,
      canRecordDecision: editor.canRecordDecision,
    })),
  );

  function toggle(userId: string, on: boolean) {
    setLinks((current) =>
      on
        ? current.some((link) => link.userId === userId)
          ? current
          : [...current, { userId, canRecordDecision: true }]
        : current.filter((link) => link.userId !== userId),
    );
  }

  return (
    <li className="rounded-lg border border-ink/10 p-3 dark:border-white/10">
      <p className="text-xs font-semibold text-ink">
        {isAr ? section.nameAr : section.nameEn}
        {section.isActive ? '' : ` (${t('inactive')})`}
      </p>
      <ul className="mt-2 space-y-2">
        {candidates.map((person) => {
          const link = links.find((item) => item.userId === person.id);
          return (
            <li
              key={person.id}
              className="flex flex-wrap items-center gap-3 text-xs"
            >
              <Checkbox
                label={person.displayName}
                checked={Boolean(link)}
                onCheckedChange={(checked) => toggle(person.id, checked)}
                className="border-0 bg-transparent p-0 hover:bg-transparent"
              />
              {link ? (
                <Checkbox
                  label={t('canRecord')}
                  checked={link.canRecordDecision}
                  onCheckedChange={(checked) =>
                    setLinks((current) =>
                      current.map((item) =>
                        item.userId === person.id
                          ? { ...item, canRecordDecision: checked }
                          : item,
                      ),
                    )
                  }
                  className="border-0 bg-transparent p-0 hover:bg-transparent"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onSave(links)}
      >
        {t('saveEditors')}
      </Button>
    </li>
  );
}
