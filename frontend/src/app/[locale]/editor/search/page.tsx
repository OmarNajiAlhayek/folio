'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson, ApiError } from '@/lib/api';
import { ArticlePicker, type ArticleHit } from '@/components/article-picker';

// ── Types ───────────────────────────────────────────────────────────────────

type IncludeEntry = { article: ArticleHit; position: number };

type Override = {
  id: string;
  rule: { query: string; match: 'exact' | 'contains' };
  includes?: { id: string; position: number }[];
  excludes?: { id: string }[];
};

type Synonym = {
  id: string;
  root?: string;
  synonyms: string[];
};

type Tab = 'overrides' | 'synonyms';

// ── Override form ────────────────────────────────────────────────────────────

type OverrideFormState = {
  id: string;
  query: string;
  match: 'exact' | 'contains';
  includes: IncludeEntry[];
  excludes: ArticleHit[];
};

const EMPTY_OVERRIDE: OverrideFormState = {
  id: '',
  query: '',
  match: 'exact',
  includes: [],
  excludes: [],
};

// ── Synonym form ─────────────────────────────────────────────────────────────

type SynonymFormState = {
  id: string;
  root: string;
  synonymsRaw: string; // comma-separated
};

const EMPTY_SYNONYM: SynonymFormState = {
  id: '',
  root: '',
  synonymsRaw: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeArticle(id: string): ArticleHit {
  return { id, slug: id, title: id };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SearchCurationPage() {
  const t = useTranslations('SearchCuration');
  const [tab, setTab] = useState<Tab>('overrides');
  const [disabled, setDisabled] = useState(false);

  // overrides
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovError, setOvError] = useState<string | null>(null);
  const [showOvForm, setShowOvForm] = useState(false);
  const [ovForm, setOvForm] = useState<OverrideFormState>(EMPTY_OVERRIDE);
  const [ovSaving, setOvSaving] = useState(false);
  const [ovFormError, setOvFormError] = useState<string | null>(null);

  // synonyms
  const [synonyms, setSynonyms] = useState<Synonym[]>([]);
  const [synLoading, setSynLoading] = useState(true);
  const [synError, setSynError] = useState<string | null>(null);
  const [showSynForm, setShowSynForm] = useState(false);
  const [synForm, setSynForm] = useState<SynonymFormState>(EMPTY_SYNONYM);
  const [synSaving, setSynSaving] = useState(false);
  const [synFormError, setSynFormError] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────

  const loadOverrides = useCallback(() => {
    setOvLoading(true);
    setOvError(null);
    void (async () => {
      try {
        const data = await apiJson<Override[]>('/editor/search/overrides');
        setOverrides(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) setDisabled(true);
        else setOvError(t('loadFailed'));
      } finally {
        setOvLoading(false);
      }
    })();
  }, [t]);

  const loadSynonyms = useCallback(() => {
    setSynLoading(true);
    setSynError(null);
    void (async () => {
      try {
        const data = await apiJson<Synonym[]>('/editor/search/synonyms');
        setSynonyms(data);
      } catch {
        setSynError(t('loadFailed'));
      } finally {
        setSynLoading(false);
      }
    })();
  }, [t]);

  useEffect(() => {
    loadOverrides();
    loadSynonyms();
  }, [loadOverrides, loadSynonyms]);

  // ── Override actions ────────────────────────────────────────────────────

  const saveOverride = useCallback(async () => {
    if (!ovForm.id.trim() || !ovForm.query.trim()) return;
    setOvSaving(true);
    setOvFormError(null);
    try {
      await apiJson(
        `/editor/search/overrides/${encodeURIComponent(ovForm.id.trim())}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            rule: { query: ovForm.query.trim(), match: ovForm.match },
            includes: ovForm.includes.map((e) => ({
              id: e.article.id,
              position: e.position,
            })),
            excludes: ovForm.excludes.map((a) => ({ id: a.id })),
          }),
        },
      );
      setOvForm(EMPTY_OVERRIDE);
      setShowOvForm(false);
      loadOverrides();
    } catch {
      setOvFormError(t('saveFailed'));
    } finally {
      setOvSaving(false);
    }
  }, [ovForm, loadOverrides, t]);

  const deleteOverride = useCallback(
    async (id: string) => {
      if (!confirm(t('confirmDelete'))) return;
      try {
        await apiJson(`/editor/search/overrides/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        loadOverrides();
      } catch {
        setOvError(t('deleteFailed'));
      }
    },
    [loadOverrides, t],
  );

  // ── Synonym actions ─────────────────────────────────────────────────────

  const saveSynonym = useCallback(async () => {
    const terms = synForm.synonymsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!synForm.id.trim() || terms.length < 1) return;
    setSynSaving(true);
    setSynFormError(null);
    try {
      const body: Record<string, unknown> = { synonyms: terms };
      if (synForm.root.trim()) body.root = synForm.root.trim();
      await apiJson(
        `/editor/search/synonyms/${encodeURIComponent(synForm.id.trim())}`,
        { method: 'PUT', body: JSON.stringify(body) },
      );
      setSynForm(EMPTY_SYNONYM);
      setShowSynForm(false);
      loadSynonyms();
    } catch {
      setSynFormError(t('saveFailed'));
    } finally {
      setSynSaving(false);
    }
  }, [synForm, loadSynonyms, t]);

  const deleteSynonym = useCallback(
    async (id: string) => {
      if (!confirm(t('confirmDelete'))) return;
      try {
        await apiJson(`/editor/search/synonyms/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        loadSynonyms();
      } catch {
        setSynError(t('deleteFailed'));
      }
    },
    [loadSynonyms, t],
  );

  // ── Disabled state ──────────────────────────────────────────────────────

  if (disabled) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 p-6 text-sm text-amber-800 dark:text-amber-300">
          {t('disabled')}
        </div>
      </main>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* Header */}
      <header className="border-s-4 border-s-accent/35 ps-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
          {t('hint')}
        </p>
      </header>

      {/* Tab bar */}
      <div
        className="flex rounded-xl border border-ink/15 dark:border-white/15 bg-surface/80 p-1 w-fit"
        role="tablist"
      >
        {(['overrides', 'synonyms'] as const).map((t_) => (
          <button
            key={t_}
            role="tab"
            aria-selected={tab === t_}
            type="button"
            onClick={() => setTab(t_)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 ${
              tab === t_
                ? 'bg-accent text-white shadow-xs'
                : 'text-ink/70 hover:text-ink hover:bg-ink/5'
            }`}
          >
            {t_ === 'overrides' ? t('tabOverrides') : t('tabSynonyms')}
          </button>
        ))}
      </div>

      {/* ── Overrides tab ─────────────────────────────────────────────── */}
      {tab === 'overrides' && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink/60">{t('overridesHint')}</p>
            <button
              type="button"
              onClick={() => {
                setShowOvForm((v) => !v);
                setOvFormError(null);
              }}
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all"
            >
              {showOvForm ? '×' : `+ ${t('addOverride')}`}
            </button>
          </div>

          {showOvForm && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-6 shadow-md space-y-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink/45">
                {t('formTitle')}
              </h2>

              {/* ID + Query */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-1">
                    {t('overrideId')}
                  </label>
                  <input
                    type="text"
                    value={ovForm.id}
                    onChange={(e) =>
                      setOvForm((f) => ({ ...f, id: e.target.value }))
                    }
                    placeholder={t('overrideIdHint')}
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-1">
                    {t('query')}
                  </label>
                  <input
                    type="text"
                    value={ovForm.query}
                    onChange={(e) =>
                      setOvForm((f) => ({ ...f, query: e.target.value }))
                    }
                    placeholder={t('queryHint')}
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                </div>
              </div>

              {/* Match type */}
              <div className="max-w-xs">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-1">
                  {t('match')}
                </label>
                <select
                  value={ovForm.match}
                  onChange={(e) =>
                    setOvForm((f) => ({
                      ...f,
                      match: e.target.value as 'exact' | 'contains',
                    }))
                  }
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                >
                  <option value="exact">{t('matchExact')}</option>
                  <option value="contains">{t('matchContains')}</option>
                </select>
              </div>

              {/* Pin articles */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-2">
                  {t('pinArticles')}
                </label>
                <ArticlePicker
                  selected={ovForm.includes.map((e) => e.article)}
                  onAdd={(a) =>
                    setOvForm((f) => ({
                      ...f,
                      includes: [
                        ...f.includes,
                        { article: a, position: f.includes.length + 1 },
                      ],
                    }))
                  }
                  onRemove={(slug) =>
                    setOvForm((f) => ({
                      ...f,
                      includes: f.includes.filter(
                        (e) => e.article.slug !== slug,
                      ),
                    }))
                  }
                  placeholder={t('articleSearchPlaceholder')}
                />
                {/* Position overrides per article */}
                {ovForm.includes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {ovForm.includes.map((entry, i) => (
                      <li
                        key={entry.article.slug}
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
                            setOvForm((f) => {
                              const updated = [...f.includes];
                              updated[i] = {
                                ...updated[i]!,
                                position: parseInt(e.target.value, 10) || 1,
                              };
                              return { ...f, includes: updated };
                            })
                          }
                          className="w-16 rounded-lg border border-ink/15 dark:border-white/15 bg-paper/50 px-2 py-1 text-xs text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Bury articles */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-2">
                  {t('buryArticles')}
                </label>
                <ArticlePicker
                  selected={ovForm.excludes}
                  onAdd={(a) =>
                    setOvForm((f) => ({ ...f, excludes: [...f.excludes, a] }))
                  }
                  onRemove={(slug) =>
                    setOvForm((f) => ({
                      ...f,
                      excludes: f.excludes.filter((a) => a.slug !== slug),
                    }))
                  }
                  placeholder={t('articleSearchPlaceholder')}
                />
              </div>

              {ovFormError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {ovFormError}
                </p>
              )}

              <div className="flex gap-2 pt-2 border-t border-ink/[0.06] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => void saveOverride()}
                  disabled={
                    ovSaving || !ovForm.id.trim() || !ovForm.query.trim()
                  }
                  className="rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ovSaving ? '…' : t('save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOvForm(false);
                    setOvForm(EMPTY_OVERRIDE);
                  }}
                  className="rounded-xl border border-ink/15 dark:border-white/15 px-5 py-2 text-xs font-semibold text-ink/75 hover:bg-ink/5 active:scale-[0.98] transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}

          {ovError && (
            <p className="text-sm text-red-600 dark:text-red-400">{ovError}</p>
          )}

          {ovLoading ? (
            <Skeleton rows={2} />
          ) : overrides.length === 0 ? (
            <p className="text-sm text-ink/50">{t('emptyOverrides')}</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-ink/10 dark:border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 dark:border-white/10 bg-ink/[0.02] dark:bg-white/[0.02]">
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
                      className={`border-b border-ink/[0.06] dark:border-white/[0.06] last:border-0 ${i % 2 ? 'bg-ink/[0.015] dark:bg-white/[0.015]' : ''}`}
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
                      <td className="px-4 py-3 text-ink/60 text-xs">
                        {(ov.includes ?? []).length > 0
                          ? (ov.includes ?? [])
                              .map((i) => `#${i.position}`)
                              .join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-ink/60 text-xs">
                        {(ov.excludes ?? []).length > 0
                          ? `${(ov.excludes ?? []).length} ${t('articles')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <DeleteBtn
                          onClick={() => void deleteOverride(ov.id)}
                          label={t('delete')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Synonyms tab ───────────────────────────────────────────────── */}
      {tab === 'synonyms' && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink/60">{t('synonymsHint')}</p>
            <button
              type="button"
              onClick={() => {
                setShowSynForm((v) => !v);
                setSynFormError(null);
              }}
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all"
            >
              {showSynForm ? '×' : `+ ${t('addSynonym')}`}
            </button>
          </div>

          {showSynForm && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-6 shadow-md space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink/45">
                {t('newSynonym')}
              </h2>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-1">
                    {t('synonymId')}
                  </label>
                  <input
                    type="text"
                    value={synForm.id}
                    onChange={(e) =>
                      setSynForm((f) => ({ ...f, id: e.target.value }))
                    }
                    placeholder="ai-terms"
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-1">
                    {t('synonymRoot')}
                    <span className="ms-1 text-ink/35 normal-case font-normal">
                      ({t('optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    value={synForm.root}
                    onChange={(e) =>
                      setSynForm((f) => ({ ...f, root: e.target.value }))
                    }
                    placeholder={t('synonymRootHint')}
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-ink/45 mb-1">
                    {t('synonymTerms')}
                  </label>
                  <input
                    type="text"
                    value={synForm.synonymsRaw}
                    onChange={(e) =>
                      setSynForm((f) => ({ ...f, synonymsRaw: e.target.value }))
                    }
                    placeholder={t('synonymTermsHint')}
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                </div>
              </div>

              <p className="text-[11px] text-ink/45 leading-relaxed">
                {t('synonymRootExplainer')}
              </p>

              {synFormError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {synFormError}
                </p>
              )}

              <div className="flex gap-2 pt-2 border-t border-ink/[0.06] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => void saveSynonym()}
                  disabled={
                    synSaving ||
                    !synForm.id.trim() ||
                    !synForm.synonymsRaw.trim()
                  }
                  className="rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {synSaving ? '…' : t('save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSynForm(false);
                    setSynForm(EMPTY_SYNONYM);
                  }}
                  className="rounded-xl border border-ink/15 dark:border-white/15 px-5 py-2 text-xs font-semibold text-ink/75 hover:bg-ink/5 active:scale-[0.98] transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}

          {synError && (
            <p className="text-sm text-red-600 dark:text-red-400">{synError}</p>
          )}

          {synLoading ? (
            <Skeleton rows={2} />
          ) : synonyms.length === 0 ? (
            <p className="text-sm text-ink/50">{t('emptySynonyms')}</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-ink/10 dark:border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 dark:border-white/10 bg-ink/[0.02] dark:bg-white/[0.02]">
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
                      className={`border-b border-ink/[0.06] dark:border-white/[0.06] last:border-0 ${i % 2 ? 'bg-ink/[0.015] dark:bg-white/[0.015]' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-ink/70">
                        {syn.id}
                      </td>
                      <td className="px-4 py-3 text-ink/60">
                        {syn.root ?? (
                          <span className="text-ink/30 italic">
                            {t('multiWay')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        <div className="flex flex-wrap gap-1">
                          {syn.synonyms.map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-ink/[0.06] dark:bg-white/[0.06] px-2 py-0.5 text-xs"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <DeleteBtn
                          onClick={() => void deleteSynonym(syn.id)}
                          label={t('delete')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// ── Small shared sub-components ───────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-start text-[11px] font-bold uppercase tracking-wider text-ink/45">
      {children}
    </th>
  );
}

function DeleteBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-red-200 dark:border-red-800/40 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 transition-all"
    >
      {label}
    </button>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-2xl bg-ink/5 dark:bg-white/5 animate-pulse"
        />
      ))}
    </div>
  );
}
