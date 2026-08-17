'use client';

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ApiErrorState } from '@/components/api-error-state';
import { ArticlePicker } from '@/components/article-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { SimpleSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SkeletonBusyRegion,
  SkeletonLoadingStatus,
} from '@/components/ui/skeleton-loading-status';
import { ApiError } from '@/lib/api';
import { EMPTY_STATE_CLS } from '@/lib/page-shell';
import { PERMISSION_SLUGS } from '@/lib/permissions';
import {
  fetchArticleLabels,
  fetchSearchAnalytics,
  fetchSearchOverrides,
  fetchSearchStatus,
  fetchSearchSynonyms,
  deleteSearchOverride,
  deleteSearchSynonym,
  triggerSearchReindex,
  upsertSearchOverride,
  upsertSearchSynonym,
} from '@/lib/queries/search-curation';
import {
  EMPTY_OVERRIDE,
  EMPTY_SYNONYM,
  articleFromLabel,
  collectOverrideArticleIds,
  labelsToMap,
  type ArticleLabel,
  type OverrideFormState,
  type SearchAnalytics,
  type SearchCurationTab,
  type SearchOverride,
  type SearchStatus,
  type SearchSynonym,
  type SynonymFormState,
} from '@/lib/search-curation';
import { useMe } from '@/lib/queries/auth';
import { submissionQueueShellCls } from '@/lib/submission-list-ui';
import { toast } from '@/lib/toast';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { cn } from '@/lib/utils';

type PendingDelete = { type: 'override' | 'synonym'; id: string };

const MATCH_OPTIONS = [
  { value: 'exact', labelKey: 'matchExact' as const },
  { value: 'contains', labelKey: 'matchContains' as const },
];

function PageSkeleton() {
  const t = useTranslations('SearchCuration');
  return (
    <main className={submissionQueueShellCls} aria-busy="true">
      <SkeletonLoadingStatus label={t('loading')} />
      <header className="border-s-4 border-s-accent/35 ps-5 space-y-2">
        <Skeleton className="h-9 w-56 max-w-full rounded-xl" />
        <Skeleton className="h-4 w-full max-w-2xl rounded-lg" />
      </header>
      <SkeletonBusyRegion label={t('loading')} className="mt-8">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </SkeletonBusyRegion>
    </main>
  );
}

function formatArticleList(
  ids: { id: string }[],
  labels: Map<string, ArticleLabel>,
): string {
  return ids
    .map((entry) => {
      const label = labels.get(entry.id);
      return label?.title ?? entry.id;
    })
    .join(', ');
}

export default function SearchCurationPage() {
  const t = useTranslations('SearchCuration');
  const { data: me, isPending: mePending } = useMe();
  const { resolve: resolveApiError } = useApiErrorMessages();

  const canAccess =
    me?.permissions.includes(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE) ??
    false;
  const canReindex =
    me?.permissions.includes(PERMISSION_SLUGS.USERS_MANAGE_ROLES) ?? false;

  const [tab, setTab] = useState<SearchCurationTab>('overrides');
  const [disabled, setDisabled] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [articleLabels, setArticleLabels] = useState<Map<string, ArticleLabel>>(
    new Map(),
  );

  const [overrides, setOverrides] = useState<SearchOverride[]>([]);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState<string | null>(null);
  const [ovErrorCause, setOvErrorCause] = useState<unknown>(null);
  const [showOvForm, setShowOvForm] = useState(false);
  const [ovEditingId, setOvEditingId] = useState<string | null>(null);
  const [ovForm, setOvForm] = useState<OverrideFormState>(EMPTY_OVERRIDE);
  const [ovSaving, setOvSaving] = useState(false);
  const [ovFormError, setOvFormError] = useState<string | null>(null);

  const [synonyms, setSynonyms] = useState<SearchSynonym[]>([]);
  const [synLoading, setSynLoading] = useState(true);
  const [synError, setSynError] = useState<string | null>(null);
  const [synErrorCause, setSynErrorCause] = useState<unknown>(null);
  const [showSynForm, setShowSynForm] = useState(false);
  const [synEditingId, setSynEditingId] = useState<string | null>(null);
  const [synForm, setSynForm] = useState<SynonymFormState>(EMPTY_SYNONYM);
  const [synSaving, setSynSaving] = useState(false);
  const [synFormError, setSynFormError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<SearchAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  const refreshLabels = useCallback(async (overrideList: SearchOverride[]) => {
    const ids = collectOverrideArticleIds(overrideList);
    if (ids.length === 0) {
      setArticleLabels(new Map());
      return;
    }
    try {
      const labels = await fetchArticleLabels(ids);
      setArticleLabels(labelsToMap(labels));
    } catch {
      /* non-fatal — ids remain as fallback */
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchSearchStatus();
      setStatus(data);
      if (!data.enabled) setDisabled(true);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadOverrides = useCallback(async () => {
    setOvLoading(true);
    setOvError(null);
    setOvErrorCause(null);
    try {
      const data = await fetchSearchOverrides();
      setOverrides(data);
      await refreshLabels(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setDisabled(true);
      else {
        setOvErrorCause(err);
        setOvError(resolveApiError(err, t('loadFailed')));
      }
    } finally {
      setOvLoading(false);
    }
  }, [refreshLabels, resolveApiError, t]);

  const loadSynonyms = useCallback(async () => {
    setSynLoading(true);
    setSynError(null);
    setSynErrorCause(null);
    try {
      const data = await fetchSearchSynonyms();
      setSynonyms(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setDisabled(true);
      else {
        setSynErrorCause(err);
        setSynError(resolveApiError(err, t('loadFailed')));
      }
    } finally {
      setSynLoading(false);
    }
  }, [resolveApiError, t]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await fetchSearchAnalytics();
      setAnalytics(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setDisabled(true);
      else setAnalyticsError(resolveApiError(err, t('loadFailed')));
    } finally {
      setAnalyticsLoading(false);
    }
  }, [resolveApiError, t]);

  useEffect(() => {
    void loadStatus();
    void loadOverrides();
    void loadSynonyms();
  }, [loadStatus, loadOverrides, loadSynonyms]);

  useEffect(() => {
    if (tab === 'analytics' && analytics === null && !analyticsLoading) {
      void loadAnalytics();
    }
  }, [tab, analytics, analyticsLoading, loadAnalytics]);

  const closeOvForm = useCallback(() => {
    setShowOvForm(false);
    setOvForm(EMPTY_OVERRIDE);
    setOvEditingId(null);
    setOvFormError(null);
  }, []);

  const startEditOverride = useCallback(
    (ov: SearchOverride) => {
      setOvForm({
        id: ov.id,
        query: ov.rule.query,
        match: ov.rule.match,
        includes: (ov.includes ?? []).map((inc) => ({
          article: articleFromLabel(articleLabels.get(inc.id), inc.id),
          position: inc.position,
        })),
        excludes: (ov.excludes ?? []).map((exc) =>
          articleFromLabel(articleLabels.get(exc.id), exc.id),
        ),
      });
      setOvEditingId(ov.id);
      setShowOvForm(true);
      setOvFormError(null);
    },
    [articleLabels],
  );

  const saveOverride = useCallback(async () => {
    if (!ovForm.id.trim() || !ovForm.query.trim()) return;
    setOvSaving(true);
    setOvFormError(null);
    try {
      await upsertSearchOverride(ovForm.id.trim(), {
        rule: { query: ovForm.query.trim(), match: ovForm.match },
        includes: ovForm.includes.map((e) => ({
          id: e.article.id,
          position: e.position,
        })),
        excludes: ovForm.excludes.map((a) => ({ id: a.id })),
      });
      closeOvForm();
      toast.success(t('saved'));
      await loadOverrides();
    } catch (err) {
      setOvFormError(resolveApiError(err, t('saveFailed')));
    } finally {
      setOvSaving(false);
    }
  }, [ovForm, closeOvForm, loadOverrides, resolveApiError, t]);

  const closeSynForm = useCallback(() => {
    setShowSynForm(false);
    setSynForm(EMPTY_SYNONYM);
    setSynEditingId(null);
    setSynFormError(null);
  }, []);

  const startEditSynonym = useCallback((syn: SearchSynonym) => {
    setSynForm({
      id: syn.id,
      root: syn.root ?? '',
      synonymsRaw: syn.synonyms.join(', '),
    });
    setSynEditingId(syn.id);
    setShowSynForm(true);
    setSynFormError(null);
  }, []);

  const saveSynonym = useCallback(async () => {
    const terms = synForm.synonymsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!synForm.id.trim() || terms.length < 1) return;
    setSynSaving(true);
    setSynFormError(null);
    try {
      const body: { synonyms: string[]; root?: string } = { synonyms: terms };
      if (synForm.root.trim()) body.root = synForm.root.trim();
      await upsertSearchSynonym(synForm.id.trim(), body);
      closeSynForm();
      toast.success(t('saved'));
      await loadSynonyms();
    } catch (err) {
      setSynFormError(resolveApiError(err, t('saveFailed')));
    } finally {
      setSynSaving(false);
    }
  }, [synForm, closeSynForm, loadSynonyms, resolveApiError, t]);

  const executeDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    setPendingDelete(null);
    try {
      if (type === 'override') {
        await deleteSearchOverride(id);
        await loadOverrides();
      } else {
        await deleteSearchSynonym(id);
        await loadSynonyms();
      }
      toast.success(t('deleted'));
    } catch (err) {
      const msg = resolveApiError(err, t('deleteFailed'));
      if (type === 'override') setOvError(msg);
      else setSynError(msg);
    }
  }, [pendingDelete, loadOverrides, loadSynonyms, resolveApiError, t]);

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    setReindexMsg(null);
    try {
      await triggerSearchReindex();
      setReindexMsg(t('reindexStarted'));
      void loadStatus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReindexMsg(t('reindexInProgress'));
      } else {
        setReindexMsg(resolveApiError(err, t('reindexFailed')));
      }
    } finally {
      setReindexing(false);
    }
  }, [loadStatus, resolveApiError, t]);

  const matchOptions = MATCH_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  if (mePending) return <PageSkeleton />;

  if (!canAccess) {
    return (
      <main className={submissionQueueShellCls}>
        <div className={cn(EMPTY_STATE_CLS, 'mt-8')}>
          <p className="text-sm text-ink/70">{t('forbidden')}</p>
        </div>
      </main>
    );
  }

  if (disabled) {
    return (
      <main className={submissionQueueShellCls}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          {t('disabled')}
        </div>
      </main>
    );
  }

  return (
    <main className={submissionQueueShellCls}>
      <Link
        href="/editor"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition hover:text-accent"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('backToEditor')}
      </Link>

      <header className="mt-4 border-s-4 border-s-accent/35 ps-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
          {t('hint')}
        </p>
        {canReindex ? (
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink/55">
            {t('journalManagerHint')}
          </p>
        ) : null}
      </header>

      {status ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-surface/80 px-4 py-3 text-xs">
          <span
            className={cn(
              'inline-block h-2 w-2 shrink-0 rounded-full',
              status.collectionReady ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
          <span className="text-ink/70">
            {status.collectionReady
              ? t('statusDocs', { count: status.documentCount ?? 0 })
              : t('statusNotReady')}
          </span>
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="ms-auto inline-flex items-center gap-1 text-ink/50 transition hover:text-ink"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {t('refreshStatus')}
          </button>
        </div>
      ) : null}

      <div
        className="mt-6 flex w-fit rounded-xl border border-ink/15 bg-surface/80 p-1"
        role="tablist"
      >
        {(['overrides', 'synonyms', 'analytics'] as const).map((tabId) => (
          <button
            key={tabId}
            id={`tab-${tabId}`}
            role="tab"
            type="button"
            aria-selected={tab === tabId}
            aria-controls={`tabpanel-${tabId}`}
            onClick={() => setTab(tabId)}
            className={cn(
              'rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200',
              tab === tabId
                ? 'bg-accent text-white shadow-xs'
                : 'text-ink/70 hover:bg-ink/5 hover:text-ink',
            )}
          >
            {tabId === 'overrides'
              ? t('tabOverrides')
              : tabId === 'synonyms'
                ? t('tabSynonyms')
                : t('tabAnalytics')}
          </button>
        ))}
      </div>

      {tab === 'overrides' && (
        <OverridesPanel
          t={t}
          overrides={overrides}
          articleLabels={articleLabels}
          loading={ovLoading}
          error={ovError}
          errorCause={ovErrorCause}
          showForm={showOvForm}
          editingId={ovEditingId}
          form={ovForm}
          saving={ovSaving}
          formError={ovFormError}
          matchOptions={matchOptions}
          onToggleForm={() => {
            if (showOvForm) closeOvForm();
            else {
              setShowOvForm(true);
              setOvFormError(null);
            }
          }}
          onFormChange={setOvForm}
          onSave={() => void saveOverride()}
          onCancel={closeOvForm}
          onEdit={startEditOverride}
          onDelete={(id) => setPendingDelete({ type: 'override', id })}
          onRetry={() => void loadOverrides()}
        />
      )}

      {tab === 'synonyms' && (
        <SynonymsPanel
          t={t}
          synonyms={synonyms}
          loading={synLoading}
          error={synError}
          errorCause={synErrorCause}
          showForm={showSynForm}
          editingId={synEditingId}
          form={synForm}
          saving={synSaving}
          formError={synFormError}
          onToggleForm={() => {
            if (showSynForm) closeSynForm();
            else {
              setShowSynForm(true);
              setSynFormError(null);
            }
          }}
          onFormChange={setSynForm}
          onSave={() => void saveSynonym()}
          onCancel={closeSynForm}
          onEdit={startEditSynonym}
          onDelete={(id) => setPendingDelete({ type: 'synonym', id })}
          onRetry={() => void loadSynonyms()}
        />
      )}

      {tab === 'analytics' && (
        <AnalyticsPanel
          t={t}
          analytics={analytics}
          loading={analyticsLoading}
          error={analyticsError}
          canReindex={canReindex}
          reindexing={reindexing}
          reindexMsg={reindexMsg}
          onRefresh={() => void loadAnalytics()}
          onReindex={() => void handleReindex()}
        />
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent title={t('deleteConfirmTitle')}>
          <DialogHeader>
            <h3 className="font-semibold text-ink">
              {t('deleteConfirmTitle')}
            </h3>
            <p className="text-sm text-ink/60">{t('deleteConfirmBody')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void executeDelete()}
            >
              {t('deleteConfirmOk')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingDelete(null)}
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

type TFn = ReturnType<typeof useTranslations<'SearchCuration'>>;

function OverridesPanel({
  t,
  overrides,
  articleLabels,
  loading,
  error,
  errorCause,
  showForm,
  editingId,
  form,
  saving,
  formError,
  matchOptions,
  onToggleForm,
  onFormChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  onRetry,
}: {
  t: TFn;
  overrides: SearchOverride[];
  articleLabels: Map<string, ArticleLabel>;
  loading: boolean;
  error: string | null;
  errorCause: unknown;
  showForm: boolean;
  editingId: string | null;
  form: OverrideFormState;
  saving: boolean;
  formError: string | null;
  matchOptions: { value: string; label: string }[];
  onToggleForm: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<OverrideFormState>>;
  onSave: () => void;
  onCancel: () => void;
  onEdit: (ov: SearchOverride) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <section
      id="tabpanel-overrides"
      role="tabpanel"
      aria-labelledby="tab-overrides"
      className="mt-6 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">{t('overridesHint')}</p>
        <Button type="button" size="sm" onClick={onToggleForm}>
          {showForm ? t('cancel') : t('addOverride')}
        </Button>
      </div>

      {showForm ? (
        <div className="space-y-5 rounded-2xl border border-ink/10 bg-surface p-6 shadow-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink/45">
            {editingId ? t('editFormTitle') : t('formTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
                {t('overrideId')}
              </label>
              <input
                type="text"
                value={form.id}
                readOnly={editingId !== null}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, id: e.target.value }))
                }
                placeholder={t('overrideIdHint')}
                className={cn(
                  'w-full rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15',
                  editingId && 'cursor-not-allowed opacity-60',
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
                {t('query')}
              </label>
              <input
                type="text"
                value={form.query}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, query: e.target.value }))
                }
                placeholder={
                  form.match === 'contains'
                    ? t('queryHintContains')
                    : t('queryHint')
                }
                className="w-full rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </div>
          </div>
          <div className="max-w-xs">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
              {t('match')}
            </label>
            <SimpleSelect
              value={form.match}
              onValueChange={(value) =>
                onFormChange((f) => ({
                  ...f,
                  match: value as 'exact' | 'contains',
                }))
              }
              options={matchOptions}
            />
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
              {t('pinArticles')}
            </label>
            <ArticlePicker
              selected={form.includes.map((e) => ({
                id: e.article.id,
                slug: e.article.slug ?? e.article.id,
                title: e.article.title,
              }))}
              onAdd={(a) =>
                onFormChange((f) => ({
                  ...f,
                  includes: [
                    ...f.includes,
                    {
                      article: {
                        id: a.id,
                        slug: a.slug,
                        title: a.title,
                      },
                      position: f.includes.length + 1,
                    },
                  ],
                }))
              }
              onRemove={(slug) =>
                onFormChange((f) => ({
                  ...f,
                  includes: f.includes.filter(
                    (e) => (e.article.slug ?? e.article.id) !== slug,
                  ),
                }))
              }
              placeholder={t('articleSearchPlaceholder')}
              searchingLabel={t('articleSearching')}
              noResultsLabel={t('articleNoResults')}
            />
            {form.includes.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {form.includes.map((entry, i) => (
                  <li
                    key={entry.article.id}
                    className="flex items-center gap-3"
                  >
                    <span
                      className="flex-1 truncate text-xs text-ink/70"
                      dir="auto"
                    >
                      {entry.article.title}
                    </span>
                    <label className="shrink-0 text-[11px] text-ink/50">
                      {t('position')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={entry.position}
                      onChange={(e) =>
                        onFormChange((f) => {
                          const updated = [...f.includes];
                          updated[i] = {
                            ...updated[i]!,
                            position: parseInt(e.target.value, 10) || 1,
                          };
                          return { ...f, includes: updated };
                        })
                      }
                      className="w-16 rounded-lg border border-ink/15 bg-paper/50 px-2 py-1 text-xs text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
              {t('buryArticles')}
            </label>
            <ArticlePicker
              selected={form.excludes.map((a) => ({
                id: a.id,
                slug: a.slug ?? a.id,
                title: a.title,
              }))}
              onAdd={(a) =>
                onFormChange((f) => ({
                  ...f,
                  excludes: [
                    ...f.excludes,
                    { id: a.id, slug: a.slug, title: a.title },
                  ],
                }))
              }
              onRemove={(slug) =>
                onFormChange((f) => ({
                  ...f,
                  excludes: f.excludes.filter((a) => (a.slug ?? a.id) !== slug),
                }))
              }
              placeholder={t('articleSearchPlaceholder')}
              searchingLabel={t('articleSearching')}
              noResultsLabel={t('articleNoResults')}
            />
          </div>
          {formError ? (
            <p className="text-sm text-danger">{formError}</p>
          ) : null}
          <div className="flex gap-2 border-t border-ink/6 pt-2">
            <Button
              type="button"
              size="sm"
              disabled={saving || !form.id.trim() || !form.query.trim()}
              onClick={onSave}
            >
              {saving ? t('saving') : t('save')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {error && !loading && overrides.length === 0 ? (
        <ApiErrorState
          message={error}
          error={errorCause}
          onRetry={onRetry}
          retryLabel={t('retryLoad')}
        />
      ) : null}
      {error && overrides.length > 0 ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}

      {loading ? (
        <SkeletonBusyRegion label={t('loading')} className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </SkeletonBusyRegion>
      ) : overrides.length === 0 ? (
        <p className="text-sm text-ink/50">{t('emptyOverrides')}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                <Th>{t('overrideId')}</Th>
                <Th>{t('query')}</Th>
                <Th>{t('match')}</Th>
                <Th>{t('pinned')}</Th>
                <Th>{t('buried')}</Th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((ov, i) => (
                <tr
                  key={ov.id}
                  className={cn(
                    'border-b border-ink/6 last:border-0',
                    i % 2 && 'bg-ink/1.5',
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink/70">
                    {ov.id}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {ov.rule.query}
                  </td>
                  <td className="px-4 py-3 text-ink/60">
                    {ov.rule.match === 'exact'
                      ? t('matchExact')
                      : t('matchContains')}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 text-xs text-ink/70">
                    {(ov.includes ?? []).length > 0
                      ? formatArticleList(ov.includes ?? [], articleLabels)
                      : '—'}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 text-xs text-ink/70">
                    {(ov.excludes ?? []).length > 0
                      ? formatArticleList(ov.excludes ?? [], articleLabels)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(ov)}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-danger hover:text-danger"
                        onClick={() => onDelete(ov.id)}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SynonymsPanel({
  t,
  synonyms,
  loading,
  error,
  errorCause,
  showForm,
  editingId,
  form,
  saving,
  formError,
  onToggleForm,
  onFormChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  onRetry,
}: {
  t: TFn;
  synonyms: SearchSynonym[];
  loading: boolean;
  error: string | null;
  errorCause: unknown;
  showForm: boolean;
  editingId: string | null;
  form: SynonymFormState;
  saving: boolean;
  formError: string | null;
  onToggleForm: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<SynonymFormState>>;
  onSave: () => void;
  onCancel: () => void;
  onEdit: (syn: SearchSynonym) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <section
      id="tabpanel-synonyms"
      role="tabpanel"
      aria-labelledby="tab-synonyms"
      className="mt-6 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">{t('synonymsHint')}</p>
        <Button type="button" size="sm" onClick={onToggleForm}>
          {showForm ? t('cancel') : t('addSynonym')}
        </Button>
      </div>

      {showForm ? (
        <div className="space-y-4 rounded-2xl border border-ink/10 bg-surface p-6 shadow-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink/45">
            {editingId ? t('editSynonymTitle') : t('newSynonym')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
                {t('synonymId')}
              </label>
              <input
                type="text"
                value={form.id}
                readOnly={editingId !== null}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, id: e.target.value }))
                }
                placeholder="ai-terms"
                className={cn(
                  'w-full rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15',
                  editingId && 'cursor-not-allowed opacity-60',
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
                {t('synonymRoot')}{' '}
                <span className="font-normal normal-case text-ink/35">
                  ({t('optional')})
                </span>
              </label>
              <input
                type="text"
                value={form.root}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, root: e.target.value }))
                }
                placeholder={t('synonymRootHint')}
                className="w-full rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink/45">
                {t('synonymTerms')}
              </label>
              <input
                type="text"
                value={form.synonymsRaw}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, synonymsRaw: e.target.value }))
                }
                placeholder={t('synonymTermsHint')}
                className="w-full rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-ink/45">
            {t('synonymRootExplainer')}
          </p>
          {formError ? (
            <p className="text-sm text-danger">{formError}</p>
          ) : null}
          <div className="flex gap-2 border-t border-ink/6 pt-2">
            <Button
              type="button"
              size="sm"
              disabled={saving || !form.id.trim() || !form.synonymsRaw.trim()}
              onClick={onSave}
            >
              {saving ? t('saving') : t('save')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {error && !loading && synonyms.length === 0 ? (
        <ApiErrorState
          message={error}
          error={errorCause}
          onRetry={onRetry}
          retryLabel={t('retryLoad')}
        />
      ) : null}
      {error && synonyms.length > 0 ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}

      {loading ? (
        <SkeletonBusyRegion label={t('loading')} className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </SkeletonBusyRegion>
      ) : synonyms.length === 0 ? (
        <p className="text-sm text-ink/50">{t('emptySynonyms')}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                <Th>{t('synonymId')}</Th>
                <Th>{t('synonymRoot')}</Th>
                <Th>{t('synonymTerms')}</Th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {synonyms.map((syn, i) => (
                <tr
                  key={syn.id}
                  className={cn(
                    'border-b border-ink/6 last:border-0',
                    i % 2 && 'bg-ink/1.5',
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink/70">
                    {syn.id}
                  </td>
                  <td className="px-4 py-3 text-ink/60">
                    {syn.root ?? (
                      <span className="italic text-ink/30">
                        {t('multiWay')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    <div className="flex flex-wrap gap-1">
                      {syn.synonyms.map((s) => (
                        <span
                          key={s}
                          className="rounded-md bg-ink/[0.06] px-2 py-0.5 text-xs"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(syn)}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-danger hover:text-danger"
                        onClick={() => onDelete(syn.id)}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AnalyticsPanel({
  t,
  analytics,
  loading,
  error,
  canReindex,
  reindexing,
  reindexMsg,
  onRefresh,
  onReindex,
}: {
  t: TFn;
  analytics: SearchAnalytics | null;
  loading: boolean;
  error: string | null;
  canReindex: boolean;
  reindexing: boolean;
  reindexMsg: string | null;
  onRefresh: () => void;
  onReindex: () => void;
}) {
  return (
    <section
      id="tabpanel-analytics"
      role="tabpanel"
      aria-labelledby="tab-analytics"
      className="mt-6 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink/60">{t('analyticsHint')}</p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
            {t('refreshAnalytics')}
          </Button>
          {canReindex ? (
            <>
              {reindexMsg ? (
                <span className="text-xs text-ink/60">{reindexMsg}</span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={reindexing}
                onClick={onReindex}
              >
                {reindexing ? t('reindexing') : t('reindex')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <SkeletonBusyRegion label={t('loading')} className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </SkeletonBusyRegion>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !analytics ||
        (analytics.topQueries.length === 0 &&
          analytics.noResultQueries.length === 0) ? (
        <p className="text-sm text-ink/50">{t('analyticsEmpty')}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <AnalyticsTable
            title={t('topQueries')}
            entries={analytics.topQueries}
            queryLabel={t('queryText')}
            countLabel={t('queryCount')}
          />
          <AnalyticsTable
            title={t('noResultQueries')}
            entries={analytics.noResultQueries}
            queryLabel={t('queryText')}
            countLabel={t('queryCount')}
          />
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wider text-ink/45">
      {children}
    </th>
  );
}

function AnalyticsTable({
  title,
  entries,
  queryLabel,
  countLabel,
}: {
  title: string;
  entries: { q: string; count: number }[];
  queryLabel: string;
  countLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10">
      <div className="border-b border-ink/10 bg-ink/[0.02] px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink/45">
          {title}
        </h3>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink/50">—</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>{queryLabel}</th>
              <th>{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr
                key={e.q}
                className={cn(
                  'border-b border-ink/6 last:border-0',
                  i % 2 && 'bg-ink/1.5',
                )}
              >
                <td className="px-4 py-2 font-medium text-ink" dir="auto">
                  {e.q}
                </td>
                <td className="px-4 py-2 text-end text-xs tabular-nums text-ink/50">
                  {e.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
