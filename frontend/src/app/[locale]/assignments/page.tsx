'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { apiJson, ApiError } from '@/lib/api';
import { ApiErrorState } from '@/components/api-error-state';
import { getApiErrorKind } from '@/lib/api-error-message';
import { redirectToLogin } from '@/lib/auth-redirect';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import {
  AssignmentQueueRow,
  EMPTY_STATE_CLS,
  SubmissionListSkeleton,
  submissionQueueShellCls,
} from '@/lib/submission-list-ui';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ReviewerAvailabilityCard } from '@/components/reviewer-availability-card';
import { useMe } from '@/lib/queries/auth';

type Row = {
  id: string;
  slug: string | null;
  status: string;
  assignedAt?: string;
  submission?: { id: string; title: string; status: string };
};

export default function AssignmentsPage() {
  const t = useTranslations('Assignments');
  const tCommon = useTranslations('Common');
  const tSub = useTranslations('Submissions');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [showRetry, setShowRetry] = useState(true);
  const [loading, setLoading] = useState(true);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const tApi = useTranslations('ApiErrors');
  const me = useMe().data;

  const loadList = useCallback(() => {
    setLoadError(null);
    setLoadErrorCause(null);
    apiJson<Row[]>('/assignments/me')
      .then((data) => {
        setItems(data);
        setShowRetry(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin(router, pathname);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setLoadError(t('needReviewerRole'));
          setShowRetry(false);
          return;
        }
        setLoadErrorCause(err);
        setLoadError(resolveApiError(err, t('loadFailed')));
        setShowRetry(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, pathname, t, resolveApiError]);

  useEffect(() => {
    void Promise.resolve().then(() => loadList());
  }, [loadList]);

  if (loadError) {
    return (
      <ApiErrorState
        className={submissionQueueShellCls}
        message={loadError}
        error={loadErrorCause}
        hint={
          loadErrorCause && getApiErrorKind(loadErrorCause) === 'rateLimit'
            ? tApi('rateLimitHint')
            : undefined
        }
        onRetry={
          showRetry
            ? () => {
                setLoading(true);
                loadList();
              }
            : undefined
        }
        retryLabel={showRetry ? tApi('retry') : undefined}
        disableRetry={!showRetry}
      />
    );
  }

  const invited = items.filter((a) => a.status === 'invited');
  const active = items.filter((a) => a.status === 'accepted');
  const past = items.filter(
    (a) => a.status !== 'invited' && a.status !== 'accepted',
  );

  return (
    <main className={submissionQueueShellCls}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
            {t('hint')}
          </p>
        </div>
      </header>

      {me?.willingToReview && !loading && (
        <ReviewerAvailabilityCard
          me={me}
          activeLoad={invited.length + active.length}
        />
      )}

      {/* Summary chart — only when data loaded and non-empty */}
      {!loading &&
        items.length > 0 &&
        (() => {
          const chartData = [
            {
              name: t('sectionReviewInvitations'),
              value: invited.length,
              color: '#38bdf8',
            },
            {
              name: t('sectionActiveReviews'),
              value: active.length,
              color: '#f59e0b',
            },
            {
              name: t('sectionPastAssignments'),
              value: past.length,
              color: '#94a3b8',
            },
          ].filter((d) => d.value > 0);
          const total = items.length;
          return (
            <div className="relative flex flex-col sm:flex-row items-center gap-4 my-6 rounded-2xl border border-ink/8 dark:border-white/8 bg-surface/50 p-4">
              <div className="relative shrink-0 w-24 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={44}
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
                      }}
                      itemStyle={{ color: 'var(--ink)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-serif text-lg font-bold text-ink">
                    {total}
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wider text-ink/40">
                    total
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 flex-1 w-full">
                <div className="rounded-xl border border-sky-500/10 bg-sky-500/5 px-3 py-3 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-500 block">
                    {t('sectionReviewInvitations')}
                  </span>
                  <span className="font-serif text-2xl font-bold text-sky-700 dark:text-sky-300 mt-1 block">
                    {invited.length}
                  </span>
                </div>
                <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-3 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">
                    {t('sectionActiveReviews')}
                  </span>
                  <span className="font-serif text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 block">
                    {active.length}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-500/10 bg-slate-500/5 px-3 py-3 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {t('sectionPastAssignments')}
                  </span>
                  <span className="font-serif text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                    {past.length}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

      {loading ? (
        <SubmissionListSkeleton loadingLabel={tCommon('loading')} />
      ) : items.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <p className="font-serif text-base text-ink">{t('empty')}</p>
          <p className="max-w-md text-sm text-ink/65">{t('emptyHint')}</p>
        </div>
      ) : (
        <div ref={listRef} className="mt-6 space-y-6">
          {(() => {
            const block = (sectionId: string, title: string, rows: Row[]) =>
              rows.length === 0 ? null : (
                <section
                  key={sectionId}
                  aria-labelledby={`assign-${sectionId}`}
                >
                  <h2
                    id={`assign-${sectionId}`}
                    className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50"
                  >
                    {title}
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {rows.map((a) => (
                      <AssignmentQueueRow
                        key={a.id}
                        slug={a.slug}
                        title={a.submission?.title ?? t('submissionFallback')}
                        assignmentStatus={a.status}
                        submissionStatus={a.submission?.status ?? ''}
                        assignedAt={a.assignedAt}
                        locale={locale}
                        tAssign={t}
                        tSub={tSub}
                      />
                    ))}
                  </ul>
                </section>
              );
            return (
              <>
                {block('invited', t('sectionReviewInvitations'), invited)}
                {block('active', t('sectionActiveReviews'), active)}
                {block('past', t('sectionPastAssignments'), past)}
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}
