'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiJson } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import { ROLE_SLUGS } from '@/lib/permissions';
import { useMe } from '@/lib/queries/auth';
import { useJournalOptions } from '@/lib/queries/journals';
import { useEditableJournals } from '@/lib/queries/journal-admin';
import { useJournalRoleHolders } from '@/lib/queries/users-admin';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { cn } from '@/lib/utils';

/** The journal-scoped role being assigned; each has its own endpoint. */
export type StaffJournalScope =
  | 'section-editor'
  | 'editor'
  | 'journal-manager'
  | 'reviewer';

const SCOPE_PATH: Record<StaffJournalScope, string> = {
  'section-editor': 'section-editor-journals',
  editor: 'editor-journals',
  'journal-manager': 'journal-manager-journals',
  reviewer: 'reviewer-journals',
};

const SCOPE_ROLE: Record<StaffJournalScope, string> = {
  'section-editor': ROLE_SLUGS.SECTION_EDITOR,
  editor: ROLE_SLUGS.EDITOR,
  'journal-manager': ROLE_SLUGS.JOURNAL_MANAGER,
  reviewer: ROLE_SLUGS.REVIEWER,
};

const SINGLETON_SCOPE: ReadonlySet<StaffJournalScope> = new Set([
  'editor',
  'journal-manager',
]);

type Props = {
  userId: string;
  scope: StaffJournalScope;
};

function sameJournalSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((slug, index) => slug === sortedRight[index]);
}

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
  const queryClient = useQueryClient();
  const { data: journalOptions } = useJournalOptions();
  const { data: editable } = useEditableJournals();
  const { data: me } = useMe();
  const roleSlug = SCOPE_ROLE[scope];
  const singleton = SINGLETON_SCOPE.has(scope);
  const { data: holders } = useJournalRoleHolders(roleSlug, singleton);
  const [journals, setJournals] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const path = `/users/${userId}/${SCOPE_PATH[scope]}`;
  const labelKey =
    scope === 'editor'
      ? 'editorJournals'
      : scope === 'journal-manager'
        ? 'journalManagerJournals'
        : scope === 'reviewer'
          ? 'reviewerJournals'
          : 'sectionEditorJournals';
  const managedSlugs = useMemo(() => {
    const slugs = new Set(
      (editable ?? [])
        .filter((journal) => journal.canEditTitles)
        .map((journal) => journal.slug),
    );
    return slugs;
  }, [editable]);
  const savedVisible = saved.filter((slug) => managedSlugs.has(slug));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<string[]>(path);
      setJournals(data);
      setSaved(data);
      setLoaded(true);
      setDirty(false);
    } catch {
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  async function save() {
    setSaving(true);
    try {
      const stored = await apiJson<string[]>(path, {
        method: 'PUT',
        body: JSON.stringify({ journals }),
      });
      setJournals(stored);
      setSaved(stored);
      setLoaded(true);
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.journalRoleHolders(roleSlug),
      });
      if (scope === 'journal-manager') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.editableJournals,
        });
      }
      toast.success(t('journalsSaved'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'JOURNAL_ROLE_TAKEN') {
        toast.error(t('journalRoleTaken'));
      } else {
        showApiError(err, t('journalsSaveFailed'));
      }
    } finally {
      setSaving(false);
    }
  }

  const holderBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const holder of holders ?? []) {
      if (holder.userId === userId) continue;
      // The actor's own manager seat can be handed over from this card.
      if (scope === 'journal-manager' && holder.userId === me?.id) continue;
      map.set(holder.journalSlug, holder.displayName);
    }
    return map;
  }, [holders, userId, scope, me?.id]);

  const visibleJournals = journals.filter((slug) => managedSlugs.has(slug));
  const needsJournal = loaded && !dirty && visibleJournals.length === 0;

  const options = useMemo(
    () =>
      (journalOptions ?? [])
        .filter((j) => managedSlugs.has(j.slug))
        .map((j) => {
          const title = locale === 'ar' ? j.titleAr : j.titleEn;
          const holderName = singleton ? holderBySlug.get(j.slug) : undefined;
          return {
            value: j.slug,
            label: holderName
              ? `${title} — ${t('heldBy', { name: holderName })}`
              : title,
            disabled: Boolean(holderName),
          };
        }),
    [journalOptions, locale, holderBySlug, t, managedSlugs, singleton],
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
    <div
      className={cn(
        'space-y-2',
        needsJournal &&
          'rounded-xl border border-amber-500/30 bg-amber-500/8 p-3',
      )}
    >
      {needsJournal ? (
        <p className="flex items-start gap-2 text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(
            scope === 'editor'
              ? 'editorNeedsJournal'
              : scope === 'journal-manager'
                ? 'journalManagerNeedsJournal'
                : scope === 'reviewer'
                  ? 'reviewerNeedsJournal'
                  : 'sectionEditorNeedsJournal',
          )}
        </p>
      ) : null}
      <MultiSelect
        options={options}
        value={visibleJournals}
        onChange={(next) => {
          setJournals(next);
          setDirty(!sameJournalSet(next, savedVisible));
        }}
        emptyLabel={t('chooseJournal')}
        manySelectedLabel={(c) => `${c} ${t('journalsSelected')}`}
        aria-label={t(labelKey)}
        className="w-full"
      />
      {dirty ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink/70">
            {t('journalsUnsaved')}
          </p>
          <Button
            size="sm"
            loading={saving}
            onClick={() => void save()}
            className="w-full text-xs"
          >
            {t('saveJournals')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
