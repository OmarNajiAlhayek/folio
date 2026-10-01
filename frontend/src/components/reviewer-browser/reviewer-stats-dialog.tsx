'use client';

import { ExternalLink, Mail } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { recommendationLabel } from '@/components/ReviewConsensusPanel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { formatMediumDate } from '@/lib/format-date';
import {
  useReviewerDetail,
  type ReviewerDetail,
  type ReviewerRecentAssignment,
} from '@/lib/queries/reviewers';
import {
  formatPercent,
  reviewerInitials,
  reviewerKeywordList,
} from '@/lib/reviewer-directory';
import {
  assignmentStatusLabel,
  assignmentStatusPillClass,
} from '@/lib/submission-list-ui';
import { ReviewerLoadMeter, ReviewerStatusPill } from './reviewer-status';

/** Stat-tile contract: label, value, optional qualifier. Sans figures throughout. */
function StatTile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink/[0.07] bg-paper/50 p-3 dark:border-white/[0.07]">
      <dt className="text-[11px] font-medium text-ink/55">{label}</dt>
      <dd className="mt-1">
        <span className="font-sans text-xl font-semibold text-ink">
          {value}
        </span>
        {detail ? (
          <span className="ms-1.5 text-[11px] text-ink/50">{detail}</span>
        ) : null}
        {children}
      </dd>
    </div>
  );
}

/**
 * One series, one hue: bar length is the count, the value sits at the tip,
 * the label is plain ink. Bars grow from a shared start edge with a rounded
 * data end, so the list reads correctly in either direction.
 */
function RecommendationBars({
  counts,
  emptyText,
}: {
  counts: Record<string, number>;
  emptyText: string;
}) {
  const tCommon = useTranslations('Common');
  const rows = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    return <p className="text-xs text-ink/50">{emptyText}</p>;
  }
  const max = rows[0][1];
  return (
    <ul className="space-y-2">
      {rows.map(([rec, n]) => {
        const label = recommendationLabel(rec, tCommon);
        return (
          <li
            key={rec}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3"
            title={`${label}: ${n}`}
          >
            <span className="truncate text-xs text-ink/70">{label}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-2 rounded-e-[4px] bg-accent"
                style={{ width: `${Math.max(4, (n / max) * 100)}%` }}
                aria-hidden
              />
              <span className="text-xs font-semibold tabular-nums text-ink">
                {n}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RecentRow({ row }: { row: ReviewerRecentAssignment }) {
  const t = useTranslations('ReviewerBrowser');
  const tAssign = useTranslations('Assignments');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const journalName = row.journal
    ? locale === 'ar'
      ? row.journal.titleAr || row.journal.titleEn
      : row.journal.titleEn || row.journal.titleAr
    : null;
  const title =
    row.submission?.title ??
    (journalName
      ? t('recentHiddenTitle', { journal: journalName })
      : t('recentHiddenTitleNoJournal'));

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p
          className={
            row.submission
              ? 'truncate text-xs font-medium text-ink'
              : 'truncate text-xs italic text-ink/55'
          }
          dir="auto"
          title={title}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[10px] text-ink/50">
          {row.submission && journalName ? `${journalName} · ` : ''}
          {t('recentInvited', {
            date: formatMediumDate(row.assignedAt, locale),
          })}
          {row.submittedAt
            ? ` · ${t('recentSubmitted', {
                date: formatMediumDate(row.submittedAt, locale),
              })}`
            : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {row.recommendation && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
            {recommendationLabel(row.recommendation, tCommon)}
          </span>
        )}
        <span className={assignmentStatusPillClass(row.status)}>
          {assignmentStatusLabel(row.status, tAssign)}
        </span>
      </div>
    </li>
  );
}

function DetailBody({ reviewer }: { reviewer: ReviewerDetail }) {
  const t = useTranslations('ReviewerBrowser');
  const locale = useLocale();
  const { stats, capacity, availability } = reviewer;
  const keywords = reviewerKeywordList(reviewer.reviewKeywords, 50);
  const days = (n: number | null) =>
    n == null ? t('noData') : t('days', { days: n });

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4 pe-8">
        <Avatar className="size-14">
          <AvatarFallback className="text-base">
            {reviewerInitials(reviewer.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <DialogTitle className="text-lg leading-tight" dir="auto">
            {reviewer.displayName}
          </DialogTitle>
          {reviewer.affiliation && (
            <DialogDescription className="mt-0 text-xs text-ink/60" dir="auto">
              {reviewer.affiliation}
            </DialogDescription>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink/60">
            <a
              href={`mailto:${reviewer.email}`}
              className="inline-flex items-center gap-1 hover:text-accent"
            >
              <Mail className="size-3" aria-hidden />
              <span className="break-all">{reviewer.email}</span>
            </a>
            {reviewer.orcid && (
              <a
                href={`https://orcid.org/${reviewer.orcid}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono hover:text-accent"
              >
                <span className="flex size-3.5 items-center justify-center rounded-full bg-[#A6C307] text-[7px] font-bold text-white">
                  iD
                </span>
                {reviewer.orcid}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <ReviewerStatusPill
              availability={availability}
              blockReason={reviewer.blockReason}
            />
            <span className="text-[11px] text-ink/50">
              {stats.lastCompletedAt
                ? t('lastCompleted', {
                    date: formatMediumDate(stats.lastCompletedAt, locale),
                  })
                : t('neverCompleted')}
            </span>
          </div>
        </div>
      </header>

      {!availability.available && availability.note && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-ink/80">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            {t('unavailableNote')}
          </p>
          <p className="mt-0.5" dir="auto">
            {availability.note}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile
          label={t('kpiActive')}
          value={String(capacity.active)}
          detail={
            capacity.max == null
              ? t('kpiActiveNoLimit')
              : t('kpiActiveOf', { max: capacity.max })
          }
        >
          {capacity.max != null && (
            <ReviewerLoadMeter
              capacity={capacity}
              className="mt-2 [&>p]:sr-only"
            />
          )}
        </StatTile>
        <StatTile
          label={t('kpiCompleted')}
          value={String(stats.completed)}
          detail={t('kpiInvitations', { count: stats.invitations })}
        />
        <StatTile
          label={t('kpiAcceptance')}
          value={formatPercent(stats.acceptanceRate) ?? t('noData')}
          detail={
            stats.acceptanceRate == null
              ? undefined
              : t('kpiAcceptanceDetail', {
                  accepted: stats.accepted,
                  declined: stats.declined,
                })
          }
        />
        <StatTile
          label={t('kpiRespond')}
          value={days(stats.avgDaysToRespond)}
          detail={stats.avgDaysToRespond == null ? undefined : t('kpiAverage')}
        />
        <StatTile
          label={t('kpiComplete')}
          value={days(stats.avgDaysToComplete)}
          detail={stats.avgDaysToComplete == null ? undefined : t('kpiAverage')}
        />
        <StatTile
          label={t('kpiOnTime')}
          value={formatPercent(stats.onTimeRate) ?? t('noData')}
          detail={stats.onTimeRate == null ? undefined : t('kpiOnTimeDetail')}
        />
      </dl>

      <section aria-labelledby="reviewer-recs">
        <h3
          id="reviewer-recs"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/45"
        >
          {t('recommendationsTitle')}
        </h3>
        <RecommendationBars
          counts={reviewer.recommendations}
          emptyText={t('recommendationsEmpty')}
        />
      </section>

      <section aria-labelledby="reviewer-recent">
        <h3
          id="reviewer-recent"
          className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink/45"
        >
          {t('recentTitle')}
        </h3>
        {reviewer.recent.length === 0 ? (
          <p className="text-xs text-ink/50">{t('recentEmpty')}</p>
        ) : (
          <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.06]">
            {reviewer.recent.map((row) => (
              <RecentRow key={row.assignmentId} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reviewer-keywords">
        <h3
          id="reviewer-keywords"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/45"
        >
          {t('keywordsTitle')}
        </h3>
        {keywords.length === 0 ? (
          <p className="text-xs text-ink/50">{t('noKeywords')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <li
                key={k}
                dir="auto"
                className="rounded-md bg-ink/[0.05] px-2 py-0.5 text-[11px] text-ink/70 dark:bg-white/[0.06]"
              >
                {k}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * A reviewer's workload and track record. Opened from the reviewer browser
 * (stacked over it) and from the sidebar's assignment list; `onSelect` is
 * omitted where choosing makes no sense.
 */
export function ReviewerStatsDialog({
  slug,
  reviewerId,
  onOpenChange,
  onSelect,
  selectedId,
}: {
  slug: string;
  reviewerId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect?: (reviewerId: string) => void;
  selectedId?: string;
}) {
  const t = useTranslations('ReviewerBrowser');
  const detail = useReviewerDetail(slug, reviewerId);
  const reviewer = detail.data;
  const blocked = reviewer?.blockReason != null;

  return (
    <Dialog open={reviewerId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        title={reviewer ? undefined : t('viewProfile')}
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto"
        // The affiliation is the description when there is one; otherwise
        // opt out explicitly so Radix does not warn about a missing one.
        {...(reviewer?.affiliation ? {} : { 'aria-describedby': undefined })}
      >
        {detail.isPending ? (
          <div className="flex h-48 items-center justify-center gap-2 text-xs text-ink/60">
            <Spinner size="sm" />
            {t('statsLoading')}
          </div>
        ) : detail.isError || !reviewer ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-ink/70">{t('statsLoadFailed')}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void detail.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : (
          <>
            <DetailBody reviewer={reviewer} />
            <DialogFooter className="border-t border-ink/[0.06] pt-4 dark:border-white/[0.06]">
              {blocked && reviewer.blockReason && (
                <p className="me-auto text-[11px] text-ink/55">
                  {t(`blockHint_${reviewer.blockReason}`)}
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {t('close')}
              </Button>
              {onSelect && (
                <Button
                  size="sm"
                  variant={
                    blocked || selectedId === reviewer.id
                      ? 'secondary'
                      : 'primary'
                  }
                  disabled={blocked || selectedId === reviewer.id}
                  onClick={() => onSelect(reviewer.id)}
                >
                  {selectedId === reviewer.id ? t('selected') : t('selectThis')}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
