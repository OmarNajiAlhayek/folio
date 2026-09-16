'use client';

import { BookCopy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiErrorState } from '@/components/api-error-state';
import { EditorialBoardEditor } from '@/components/editorial-board-editor';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonLoadingStatus } from '@/components/ui/skeleton-loading-status';
import { normalizeIssn } from '@/lib/issn';
import { EMPTY_STATE_CLS } from '@/lib/page-shell';
import {
  updateJournalMetadata,
  useEditableJournals,
  type EditableJournal,
  type JournalMetadataPatch,
} from '@/lib/queries/journal-admin';
import { queryKeys } from '@/lib/query-keys';
import { submissionQueueShellCls } from '@/lib/submission-list-ui';
import { toast } from '@/lib/toast';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { cn } from '@/lib/utils';

type Draft = {
  titleAr: string;
  titleEn: string;
  issn: string;
  eissn: string;
  descriptionAr: string;
  descriptionEn: string;
};

type DraftErrors = Partial<Record<keyof Draft, string>>;

/** Unsaved edits, tagged with the journal version they were made against. */
type Edit = { key: string; draft: Draft; errors: DraftErrors };

function toDraft(j: EditableJournal): Draft {
  return {
    titleAr: j.titleAr,
    titleEn: j.titleEn,
    issn: j.issn ?? '',
    eissn: j.eissn ?? '',
    descriptionAr: j.descriptionAr ?? '',
    descriptionEn: j.descriptionEn ?? '',
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k]);
}

function fieldCls(err: boolean) {
  return cn(
    'w-full rounded-xl border bg-paper/60 px-3 py-2.5 text-sm text-ink outline-hidden transition focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-60',
    err ? 'border-red-400' : 'border-ink/15 dark:border-white/15',
  );
}

const SECTION_CLS =
  'rounded-2xl border border-ink/10 bg-surface p-5 shadow-xs sm:p-6';

/**
 * Journal metadata staff maintain in the app (Damascus University,
 * 2026-09-14): registered titles for the journal manager only; ISSNs, aims and
 * scope, and the editorial board for the journal manager or the journal's own
 * editor-in-chief.
 *
 * The API decides which journals and which fields. This page mirrors it, so a
 * locked field reads as locked rather than failing on save.
 */
export default function JournalSettingsPage() {
  const t = useTranslations('JournalSettings');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { resolve } = useApiErrorMessages();
  const showApiError = useToastApiError();
  const journals = useEditableJournals();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);

  const list = journals.data ?? [];
  const selected =
    list.find((j) => j.slug === selectedSlug) ?? list[0] ?? null;

  // Keyed on slug and updatedAt, so a background refetch of unchanged data
  // keeps what the user is typing, while switching journals or saving resets.
  const selectedKey = selected ? `${selected.slug}@${selected.updatedAt}` : '';
  const baseline = selected ? toDraft(selected) : null;
  const current = edit?.key === selectedKey ? edit : null;
  const draft = current?.draft ?? baseline;
  const errors = current?.errors ?? {};
  const dirty = Boolean(draft && baseline && !sameDraft(draft, baseline));

  function setField(field: keyof Draft, value: string) {
    if (!draft) return;
    const nextErrors = { ...errors };
    delete nextErrors[field];
    setEdit({
      key: selectedKey,
      draft: { ...draft, [field]: value },
      errors: nextErrors,
    });
  }

  function selectJournal(slug: string) {
    if (slug === selected?.slug) return;
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    setEdit(null);
    setSelectedSlug(slug);
  }

  function validate(d: Draft, canEditTitles: boolean): DraftErrors {
    const out: DraftErrors = {};
    if (canEditTitles) {
      if (!d.titleAr.trim()) out.titleAr = t('titleRequired');
      if (!d.titleEn.trim()) out.titleEn = t('titleRequired');
    }
    const issn = d.issn.trim() ? normalizeIssn(d.issn) : null;
    const eissn = d.eissn.trim() ? normalizeIssn(d.eissn) : null;
    if (d.issn.trim() && !issn) out.issn = t('issnInvalid');
    if (d.eissn.trim() && !eissn) out.eissn = t('issnInvalid');
    if (issn && eissn && issn === eissn) out.eissn = t('issnSame');
    return out;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !draft) return;
    const nextErrors = validate(draft, selected.canEditTitles);
    if (Object.keys(nextErrors).length > 0) {
      setEdit({ key: selectedKey, draft, errors: nextErrors });
      return;
    }

    const patch: JournalMetadataPatch = {
      issn: draft.issn.trim() ? normalizeIssn(draft.issn) : null,
      eissn: draft.eissn.trim() ? normalizeIssn(draft.eissn) : null,
      descriptionAr: draft.descriptionAr.trim() || null,
      descriptionEn: draft.descriptionEn.trim() || null,
    };
    if (selected.canEditTitles) {
      patch.titleAr = draft.titleAr.trim();
      patch.titleEn = draft.titleEn.trim();
    }

    setSaving(true);
    try {
      const saved = await updateJournalMetadata(selected.slug, patch);
      queryClient.setQueryData<EditableJournal[]>(
        queryKeys.editableJournals,
        (prev) => prev?.map((j) => (j.slug === saved.slug ? saved : j)),
      );
      setEdit(null);
      // The public portal and the author's journal picker read the same rows.
      void queryClient.invalidateQueries({ queryKey: queryKeys.journals });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.journal(saved.slug),
      });
      toast.success(t('saved'));
    } catch (err) {
      showApiError(err, t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <header className="border-s-4 border-s-accent/35 ps-5">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {t('title')}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
        {t('hint')}
      </p>
    </header>
  );

  if (journals.isPending) {
    return (
      <main className={submissionQueueShellCls} aria-busy="true">
        <SkeletonLoadingStatus label={t('loading')} />
        <header className="border-s-4 border-s-accent/35 ps-5 space-y-2">
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </header>
        <div
          className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
          aria-hidden
        >
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (journals.isError) {
    return (
      <main className={submissionQueueShellCls}>
        <ApiErrorState
          message={resolve(journals.error, t('loadFailed'))}
          error={journals.error}
          onRetry={() => void journals.refetch()}
          retryLabel={t('retry')}
        />
      </main>
    );
  }

  if (!selected || !draft) {
    return (
      <main className={submissionQueueShellCls}>
        {header}
        <div className={cn(EMPTY_STATE_CLS, 'mt-8')}>
          <div className="flex size-12 items-center justify-center rounded-full bg-ink/6">
            <BookCopy className="size-6 text-ink/40" aria-hidden />
          </div>
          <div>
            <p className="font-serif text-base font-semibold text-ink">
              {t('empty')}
            </p>
            <p className="mt-1 text-sm text-ink/60">{t('emptyHint')}</p>
          </div>
        </div>
      </main>
    );
  }

  const titlesLocked = !selected.canEditTitles;
  const lastUpdated = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(selected.updatedAt));

  return (
    <main className={submissionQueueShellCls}>
      {header}

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label={t('journalsLabel')}>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {list.map((j) => {
              const active = j.slug === selected.slug;
              return (
                <li key={j.slug} className="w-56 shrink-0 lg:w-auto">
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => selectJournal(j.slug)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2.5 text-start text-sm transition',
                      active
                        ? 'border-accent/40 bg-accent/8 font-semibold text-accent'
                        : 'border-ink/10 bg-surface text-ink/75 hover:border-ink/20 hover:text-ink',
                    )}
                  >
                    <span className="block truncate">
                      {locale === 'ar' ? j.titleAr : j.titleEn}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-ink/45">
                      {j.slug}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
          <section className={SECTION_CLS} aria-labelledby="journal-titles">
            <h2
              id="journal-titles"
              className="font-serif text-lg font-semibold text-ink"
            >
              {t('sectionTitles')}
            </h2>
            {titlesLocked ? (
              <p className="mt-1 text-xs text-ink/55">
                {t('titlesLockedHint')}
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              <FormField label={t('titleAr')} error={errors.titleAr}>
                <input
                  dir="rtl"
                  lang="ar"
                  value={draft.titleAr}
                  onChange={(e) => setField('titleAr', e.target.value)}
                  disabled={titlesLocked}
                  maxLength={300}
                  className={fieldCls(!!errors.titleAr)}
                />
              </FormField>
              <FormField label={t('titleEn')} error={errors.titleEn}>
                <input
                  dir="ltr"
                  lang="en"
                  value={draft.titleEn}
                  onChange={(e) => setField('titleEn', e.target.value)}
                  disabled={titlesLocked}
                  maxLength={300}
                  className={fieldCls(!!errors.titleEn)}
                />
              </FormField>
            </div>
          </section>

          <section className={SECTION_CLS} aria-labelledby="journal-issn">
            <h2
              id="journal-issn"
              className="font-serif text-lg font-semibold text-ink"
            >
              {t('sectionIdentifiers')}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('issn')}
                error={errors.issn}
                hint={t('issnHint')}
              >
                <input
                  dir="ltr"
                  value={draft.issn}
                  onChange={(e) => setField('issn', e.target.value)}
                  placeholder="0000-0000"
                  maxLength={20}
                  autoComplete="off"
                  className={cn(fieldCls(!!errors.issn), 'font-mono')}
                />
              </FormField>
              <FormField
                label={t('eissn')}
                error={errors.eissn}
                hint={t('issnHint')}
              >
                <input
                  dir="ltr"
                  value={draft.eissn}
                  onChange={(e) => setField('eissn', e.target.value)}
                  placeholder="0000-0000"
                  maxLength={20}
                  autoComplete="off"
                  className={cn(fieldCls(!!errors.eissn), 'font-mono')}
                />
              </FormField>
            </div>
          </section>

          <section className={SECTION_CLS} aria-labelledby="journal-scope">
            <h2
              id="journal-scope"
              className="font-serif text-lg font-semibold text-ink"
            >
              {t('sectionScope')}
            </h2>
            <p className="mt-1 text-xs text-ink/55">{t('scopeHint')}</p>
            <div className="mt-4 grid gap-4">
              <FormField label={t('descriptionAr')}>
                <textarea
                  dir="rtl"
                  lang="ar"
                  rows={6}
                  value={draft.descriptionAr}
                  onChange={(e) => setField('descriptionAr', e.target.value)}
                  maxLength={10000}
                  className={fieldCls(false)}
                />
              </FormField>
              <FormField label={t('descriptionEn')}>
                <textarea
                  dir="ltr"
                  lang="en"
                  rows={6}
                  value={draft.descriptionEn}
                  onChange={(e) => setField('descriptionEn', e.target.value)}
                  maxLength={10000}
                  className={fieldCls(false)}
                />
              </FormField>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="me-auto text-xs text-ink/50">
              {t('lastUpdated', { date: lastUpdated })}
            </p>
            {dirty ? (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {t('unsaved')}
              </span>
            ) : null}
            <Button type="submit" loading={saving} disabled={!dirty}>
              {t('save')}
            </Button>
          </div>
        </form>

        {/* Saves per change, independent of the form above; keyed so switching journals resets it. */}
        <div className="lg:col-start-2">
          <EditorialBoardEditor key={selected.slug} slug={selected.slug} />
        </div>
      </div>
    </main>
  );
}
