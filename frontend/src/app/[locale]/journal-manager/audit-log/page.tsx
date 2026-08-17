'use client';

import type React from 'react';
import { format } from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  ScrollText,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ApiErrorState } from '@/components/api-error-state';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { DatePicker } from '@/components/ui/date-picker';
import { SimpleSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SkeletonBusyRegion,
  SkeletonLoadingStatus,
} from '@/components/ui/skeleton-loading-status';
import { useMe } from '@/lib/queries/auth';
import { fetchAuditLogs } from '@/lib/queries/audit';
import {
  AUDIT_ACTION_TYPES,
  AUDIT_RESOURCE_TYPES,
  type AuditLogRow,
} from '@/lib/audit';
import { EMPTY_STATE_CLS } from '@/lib/page-shell';
import { PERMISSION_SLUGS } from '@/lib/permissions';
import { submissionQueueShellCls } from '@/lib/submission-list-ui';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function toIsoStart(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).toISOString();
}

function toIsoEnd(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).toISOString();
}

function statusTone(code: number | null): string {
  if (code === null) return 'text-ink/50';
  if (code >= 500) return 'text-danger';
  if (code >= 400) return 'text-amber-700 dark:text-amber-400';
  if (code >= 200 && code < 300)
    return 'text-emerald-700 dark:text-emerald-400';
  return 'text-ink/70';
}

function AuditLogPageSkeleton() {
  const t = useTranslations('JournalManagerAuditLog');
  return (
    <main className={submissionQueueShellCls} aria-busy="true">
      <SkeletonLoadingStatus label={t('loading')} />
      <header className="border-s-4 border-s-accent/35 ps-5">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </header>
      <Skeleton className="mt-6 h-11 w-full max-w-md" />
      <SkeletonBusyRegion label={t('loading')} className="mt-8">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </SkeletonBusyRegion>
    </main>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
        {label}
      </p>
      <div className="mt-1 text-xs text-ink/80 break-all">{children}</div>
    </div>
  );
}

function AuditLogRowCard({
  row,
  t,
}: {
  row: AuditLogRow;
  t: ReturnType<typeof useTranslations<'JournalManagerAuditLog'>>;
}) {
  const [open, setOpen] = useState(false);
  const when = row.occurredAt
    ? format(new Date(row.occurredAt), 'MMM d, yyyy HH:mm:ss')
    : '—';

  return (
    <li className="rounded-xl border border-ink/10 bg-surface shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-start transition hover:bg-ink/[0.02]"
        aria-expanded={open}
      >
        <span className="mt-0.5 shrink-0 text-ink/35" aria-hidden>
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4 rtl:rotate-180" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <time className="text-xs font-medium tabular-nums text-ink/55">
              {when}
            </time>
            {row.actionType ? (
              <span className="rounded-full border border-accent/25 bg-accent/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                {row.actionType}
              </span>
            ) : null}
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                statusTone(row.statusCode),
              )}
            >
              {row.method} {row.statusCode ?? '—'}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-ink">
            {row.userEmail ?? t('anonymousUser')}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-ink/50">
            {row.path}
          </p>
          {(row.resourceType || row.resourceId) && (
            <p className="mt-1 text-xs text-ink/55">
              {row.resourceType ?? '—'}
              {row.resourceId ? ` · ${row.resourceId}` : ''}
            </p>
          )}
        </div>
        {row.durationMs != null ? (
          <span className="shrink-0 text-xs tabular-nums text-ink/45">
            {row.durationMs} ms
          </span>
        ) : null}
      </button>
      <CollapsibleSection
        open={open}
        slide={false}
        contentClassName="border-t border-ink/8 px-4 py-4 ps-11"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailBlock label={t('detailUserId')}>
            {row.userId ?? '—'}
          </DetailBlock>
          <DetailBlock label={t('detailRoles')}>
            {row.userRoles?.length ? row.userRoles.join(', ') : '—'}
          </DetailBlock>
          <DetailBlock label={t('detailRoute')}>
            {row.routePattern ?? '—'}
          </DetailBlock>
          <DetailBlock label={t('detailIp')}>
            {row.ipAddress ?? '—'}
          </DetailBlock>
          <DetailBlock label={t('detailUserAgent')}>
            {row.userAgent ?? '—'}
          </DetailBlock>
          <DetailBlock label={t('detailError')}>{row.error ?? '—'}</DetailBlock>
        </div>
        {row.params && Object.keys(row.params).length > 0 ? (
          <div className="mt-4">
            <DetailBlock label={t('detailParams')}>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-ink/4 p-2 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(row.params, null, 2)}
              </pre>
            </DetailBlock>
          </div>
        ) : null}
        {row.requestBody && Object.keys(row.requestBody).length > 0 ? (
          <div className="mt-4">
            <DetailBlock label={t('detailBody')}>
              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-ink/4 p-2 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(row.requestBody, null, 2)}
              </pre>
            </DetailBlock>
          </div>
        ) : null}
      </CollapsibleSection>
    </li>
  );
}

export default function AuditLogPage() {
  const t = useTranslations('JournalManagerAuditLog');
  const me = useMe();
  const { resolve: resolveApiError } = useApiErrorMessages();

  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [methodDraft, setMethodDraft] = useState('');
  const [actionTypeDraft, setActionTypeDraft] = useState('');
  const [resourceTypeDraft, setResourceTypeDraft] = useState('');
  const [resourceIdDraft, setResourceIdDraft] = useState('');
  const [userIdDraft, setUserIdDraft] = useState('');
  const [fromDraft, setFromDraft] = useState<Date | undefined>();
  const [toDraft, setToDraft] = useState<Date | undefined>();

  const [appliedMethod, setAppliedMethod] = useState('');
  const [appliedActionType, setAppliedActionType] = useState('');
  const [appliedResourceType, setAppliedResourceType] = useState('');
  const [appliedResourceId, setAppliedResourceId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  const activeFilterCount = [
    appliedMethod,
    appliedActionType,
    appliedResourceType,
    appliedResourceId,
    appliedUserId,
    appliedFrom,
    appliedTo,
  ].filter(Boolean).length;

  const canAccess = me.data?.permissions.includes(
    PERMISSION_SLUGS.AUDIT_LOG_VIEW,
  );

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    setErrorCause(null);
    try {
      const data = await fetchAuditLogs({
        userId: appliedUserId || undefined,
        startDate: appliedFrom || undefined,
        endDate: appliedTo || undefined,
        method: appliedMethod || undefined,
        actionType: appliedActionType || undefined,
        resourceType: appliedResourceType || undefined,
        resourceId: appliedResourceId || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setErrorCause(err);
      setError(resolveApiError(err, t('loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [
    canAccess,
    appliedUserId,
    appliedFrom,
    appliedTo,
    appliedMethod,
    appliedActionType,
    appliedResourceType,
    appliedResourceId,
    page,
    resolveApiError,
    t,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyAdvanced() {
    setAppliedMethod(methodDraft);
    setAppliedActionType(actionTypeDraft);
    setAppliedResourceType(resourceTypeDraft);
    setAppliedResourceId(resourceIdDraft.trim());
    setAppliedUserId(userIdDraft.trim());
    setAppliedFrom(fromDraft ? toIsoStart(fromDraft) : '');
    setAppliedTo(toDraft ? toIsoEnd(toDraft) : '');
    setPage(1);
    setAdvancedOpen(false);
  }

  function clearAllFilters() {
    setMethodDraft('');
    setActionTypeDraft('');
    setResourceTypeDraft('');
    setResourceIdDraft('');
    setUserIdDraft('');
    setFromDraft(undefined);
    setToDraft(undefined);
    setAppliedMethod('');
    setAppliedActionType('');
    setAppliedResourceType('');
    setAppliedResourceId('');
    setAppliedUserId('');
    setAppliedFrom('');
    setAppliedTo('');
    setPage(1);
    setAdvancedOpen(false);
  }

  if (me.isPending) {
    return <AuditLogPageSkeleton />;
  }

  if (!canAccess) {
    return (
      <main className={submissionQueueShellCls}>
        <div className={cn(EMPTY_STATE_CLS, 'mt-8')}>
          <div className="flex size-12 items-center justify-center rounded-full bg-ink/6">
            <ScrollText className="size-6 text-ink/40" aria-hidden />
          </div>
          <p className="text-sm text-ink/70">{t('forbidden')}</p>
        </div>
      </main>
    );
  }

  if (error && items.length === 0 && !loading) {
    return (
      <main className={submissionQueueShellCls}>
        <ApiErrorState
          message={error}
          error={errorCause}
          onRetry={() => void load()}
          retryLabel={t('retryLoad')}
        />
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const methodOptions = [
    { value: '', label: t('filterMethodAny') },
    ...HTTP_METHODS.map((m) => ({ value: m, label: m })),
  ];

  const actionOptions = [
    { value: '', label: t('filterActionAny') },
    ...AUDIT_ACTION_TYPES.map((a) => ({ value: a, label: a })),
  ];

  const resourceOptions = [
    { value: '', label: t('filterResourceAny') },
    ...AUDIT_RESOURCE_TYPES.map((r) => ({ value: r, label: r })),
  ];

  return (
    <main className={submissionQueueShellCls}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
              {t('hint')}
            </p>
          </div>
          {!loading && total > 0 ? (
            <div className="hidden shrink-0 rounded-xl border border-ink/10 bg-surface px-4 py-3 text-center shadow-xs sm:block">
              <p className="text-2xl font-bold tabular-nums text-ink">
                {total}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink/45">
                {t('totalEntries')}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          aria-controls="audit-advanced-filters"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all duration-200',
            advancedOpen
              ? 'border-accent/30 bg-accent/8 text-accent'
              : 'border-ink/15 bg-surface text-ink/70 hover:border-ink/25 hover:text-ink',
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {t('filters')}
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-sm font-medium text-ink/55 underline-offset-2 hover:text-ink hover:underline"
          >
            {t('filterClear')}
          </button>
        ) : null}
      </div>

      <CollapsibleSection
        id="audit-advanced-filters"
        open={advancedOpen}
        className="mt-4"
        contentClassName="rounded-2xl border border-ink/10 bg-surface p-4 shadow-xs sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink/50">
              {t('filterFrom')}
            </label>
            <div className="mt-2">
              <DatePicker
                value={fromDraft}
                onChange={setFromDraft}
                placeholder={t('filterPickDate')}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink/50">
              {t('filterTo')}
            </label>
            <div className="mt-2">
              <DatePicker
                value={toDraft}
                onChange={setToDraft}
                placeholder={t('filterPickDate')}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink/50">
              {t('filterMethod')}
            </label>
            <div className="mt-2">
              <SimpleSelect
                value={methodDraft}
                onValueChange={setMethodDraft}
                options={methodOptions}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink/50">
              {t('filterAction')}
            </label>
            <div className="mt-2">
              <SimpleSelect
                value={actionTypeDraft}
                onValueChange={setActionTypeDraft}
                options={actionOptions}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink/50">
              {t('filterResource')}
            </label>
            <div className="mt-2">
              <SimpleSelect
                value={resourceTypeDraft}
                onValueChange={setResourceTypeDraft}
                options={resourceOptions}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="audit-filter-user-id"
              className="text-xs font-semibold uppercase tracking-wider text-ink/50"
            >
              {t('filterUserId')}
            </label>
            <input
              id="audit-filter-user-id"
              type="text"
              value={userIdDraft}
              onChange={(e) => setUserIdDraft(e.target.value)}
              placeholder={t('filterUserIdPlaceholder')}
              className="mt-2 w-full rounded-xl border border-ink/15 bg-surface px-3 py-2.5 text-sm text-ink shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              autoComplete="off"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="audit-filter-resource-id"
              className="text-xs font-semibold uppercase tracking-wider text-ink/50"
            >
              {t('filterResourceId')}
            </label>
            <input
              id="audit-filter-resource-id"
              type="text"
              value={resourceIdDraft}
              onChange={(e) => setResourceIdDraft(e.target.value)}
              placeholder={t('filterResourceIdPlaceholder')}
              className="mt-2 w-full rounded-xl border border-ink/15 bg-surface px-3 py-2.5 text-sm text-ink shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={applyAdvanced}>
            {t('filterApply')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearAllFilters}
          >
            {t('filterClear')}
          </Button>
        </div>
      </CollapsibleSection>

      {loading && items.length === 0 ? (
        <SkeletonBusyRegion label={t('loading')} className="mt-8">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </SkeletonBusyRegion>
      ) : items.length === 0 ? (
        <div className={cn(EMPTY_STATE_CLS, 'mt-8')}>
          <div className="flex size-12 items-center justify-center rounded-full bg-ink/6">
            <ScrollText className="size-6 text-ink/40" aria-hidden />
          </div>
          <p className="text-sm font-medium text-ink/80">{t('empty')}</p>
          <p className="text-sm text-ink/55">{t('emptyHint')}</p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-ink/50">
            {t('showingCount', {
              count: items.length,
              total,
              page,
              totalPages,
            })}
          </p>
          <ul className="mt-3 space-y-2">
            {items.map((row) => (
              <AuditLogRowCard key={row.id} row={row} t={t} />
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('prevPage')}
            </Button>

            {totalPages > 1 && totalPages <= 7 ? (
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={loading}
                      onClick={() => setPage(p)}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg text-xs font-medium transition',
                        p === page
                          ? 'bg-accent text-white'
                          : 'text-ink/60 hover:bg-ink/6 hover:text-ink disabled:opacity-40',
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            ) : totalPages > 7 ? (
              <span className="text-xs tabular-nums text-ink/55">
                {t('pageOf', { page, totalPages })}
              </span>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('nextPage')}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
