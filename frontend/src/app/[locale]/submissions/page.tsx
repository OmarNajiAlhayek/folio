'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { FileText, Plus } from 'lucide-react';
import { ApiErrorState } from '@/components/api-error-state';
import { getApiErrorKind } from '@/lib/api-error-message';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { useMe } from '@/lib/queries/auth';
import { canManageOwnSubmissions } from '@/lib/permissions';
import { useSubmissionsList } from '@/lib/queries/submissions';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SkeletonBusyRegion,
  SkeletonLoadingStatus,
} from '@/components/ui/skeleton-loading-status';
import {
  SubmissionListSkeleton,
  SubmissionQueueRow,
  submissionQueueShellCls,
} from '@/lib/submission-list-ui';

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ctrl = animate(0, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    return () => ctrl.stop();
  }, [value]);
  return <span ref={ref}>0</span>;
}

export default function SubmissionsPage() {
  const t = useTranslations('Submissions');
  const tCommon = useTranslations('Common');
  const tApi = useTranslations('ApiErrors');
  const locale = useLocale();
  const router = useRouter();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const meQuery = useMe();
  const canManageOwn = meQuery.data
    ? canManageOwnSubmissions(meQuery.data.permissions)
    : false;

  useEffect(() => {
    if (
      meQuery.isSuccess &&
      meQuery.data &&
      !canManageOwnSubmissions(meQuery.data.permissions)
    ) {
      router.replace('/dashboard');
    }
  }, [meQuery.isSuccess, meQuery.data, router]);

  const listQuery = useSubmissionsList();
  const [listRef] = useAutoAnimate<HTMLUListElement>();

  const loadError = listQuery.isError
    ? resolveApiError(listQuery.error, t('loadFailed'))
    : null;

  const items = listQuery.data ?? [];
  const loading = listQuery.isLoading;

  // Real-time metrics calculations
  const draftsCount = items.filter((s) => s.status === 'draft').length;
  const inReviewCount = items.filter((s) =>
    ['submitted', 'under_review', 'revisions_requested'].includes(s.status),
  ).length;
  const decisionsCount = items.filter((s) =>
    ['accepted', 'copyediting', 'published'].includes(s.status),
  ).length;

  if (meQuery.isLoading || (meQuery.isSuccess && !canManageOwn)) {
    return (
      <main className={submissionQueueShellCls} aria-busy="true">
        <SkeletonLoadingStatus label={tCommon('loading')} />
        <header className="relative border-s-4 border-s-accent/70 ps-5 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-9 w-44 rounded-xl" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-36 rounded-xl shrink-0" />
          </div>
        </header>
        <SubmissionListSkeleton />
      </main>
    );
  }

  if (loadError) {
    return (
      <ApiErrorState
        className={submissionQueueShellCls}
        message={loadError}
        error={listQuery.error}
        hint={
          listQuery.error && getApiErrorKind(listQuery.error) === 'rateLimit'
            ? tApi('rateLimitHint')
            : undefined
        }
        onRetry={() => void listQuery.refetch()}
        retryLabel={tApi('retry')}
      />
    );
  }

  return (
    <main className={submissionQueueShellCls}>
      {/* Background Grid Canvas Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.01]"
        style={{
          backgroundImage: `linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <header className="relative border-s-4 border-s-accent/70 ps-5 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-start">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink/65">
              {t('hint')}
            </p>
          </div>
          {canManageOwn && (
            <Link
              href="/submissions/new"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              {t('newDraft')}
            </Link>
          )}
        </div>
      </header>

      {/* Dynamic Summary Cards + Donut Chart */}
      {!loading &&
        items.length > 0 &&
        (() => {
          const chartData = [
            { name: t('summaryDrafts'), value: draftsCount, color: '#94a3b8' },
            {
              name: t('summaryInEvaluation'),
              value: inReviewCount,
              color: '#f59e0b',
            },
            {
              name: t('summaryAccepted'),
              value: decisionsCount,
              color: '#10b981',
            },
          ].filter((d) => d.value > 0);
          const total = items.length;

          return (
            <div className="relative flex flex-col sm:flex-row items-center gap-4 mb-6 pt-2 rounded-2xl border border-ink/8 dark:border-white/8 bg-surface/50 p-4">
              {/* Donut chart */}
              <div className="relative shrink-0 w-28 h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={34}
                      outerRadius={52}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid rgba(15,23,42,0.1)',
                        borderRadius: '10px',
                        fontSize: '11px',
                        color: 'var(--ink)',
                        boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                      }}
                      itemStyle={{ color: 'var(--ink)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-serif text-xl font-bold text-ink">
                    <AnimatedNumber value={total} />
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-ink/40">
                    total
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 flex-1 w-full">
                <div className="rounded-xl border border-slate-500/10 bg-slate-500/5 px-3 py-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                    {t('summaryDrafts')}
                  </span>
                  <span className="font-serif text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                    <AnimatedNumber value={draftsCount} />
                  </span>
                </div>
                <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block truncate">
                    {t('summaryInEvaluation')}
                  </span>
                  <span className="font-serif text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 block">
                    <AnimatedNumber value={inReviewCount} />
                  </span>
                </div>
                <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block truncate">
                    {t('summaryAccepted')}
                  </span>
                  <span className="font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 block">
                    <AnimatedNumber value={decisionsCount} />
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

      {/* List content / Custom onboarding empty states */}
      {loading ? (
        <SubmissionListSkeleton loadingLabel={tCommon('loading')} />
      ) : items.length === 0 ? (
        /* Visual Onboarding State replacing generic blank whitespace */
        <div className="relative flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-ink/15 dark:border-white/15 bg-linear-to-b from-surface/50 to-surface-muted/20">
          <div className="relative flex items-center justify-center size-16 rounded-full bg-accent/8 border border-accent/15 text-accent mb-5">
            <span className="absolute inset-0 rounded-full bg-accent/8 animate-pulse" />
            <FileText className="size-8" strokeWidth={2} aria-hidden />
          </div>

          <h2 className="font-serif text-lg font-bold text-ink">
            {t('empty')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink/60 max-w-xs">
            {t('emptyHint')}
          </p>

          {canManageOwn && (
            <Link
              href="/submissions/new"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
            >
              {t('emptyCta')}
            </Link>
          )}
        </div>
      ) : (
        <ul ref={listRef} className="mt-6 flex flex-col gap-3">
          {items.map((s) => (
            <SubmissionQueueRow
              key={s.id}
              href={`/submissions/${encodeURIComponent(s.slug)}`}
              title={s.title}
              status={s.status}
              updatedAt={s.updatedAt}
              locale={locale}
              t={t}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
