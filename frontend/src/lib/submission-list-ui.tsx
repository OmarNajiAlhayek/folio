'use client';

import type React from 'react';
import type { useTranslations } from 'next-intl';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonBusyRegion } from '@/components/ui/skeleton-loading-status';
import { PAGE_SHELL, EMPTY_STATE_CLS } from '@/lib/page-shell';
import { DisciplineBadges } from '@/components/discipline-badges';

export type SubmissionsListTranslator = ReturnType<
  typeof useTranslations<'Submissions'>
>;

export type AssignmentsListTranslator = ReturnType<
  typeof useTranslations<'Assignments'>
>;

/** Shared card styling for submission and assignment queue rows */
export const queueRowCardLinkCls =
  'group flex flex-col gap-2.5 rounded-xl border border-ink/10 dark:border-white/10 border-s-4 border-s-accent/25 bg-surface p-4 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-ink/15 hover:border-s-accent hover:shadow-md';

export function statusPillClass(status: string): string {
  const base =
    'inline-flex items-center shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border tabular-nums';
  switch (status) {
    case 'draft':
      return `${base} bg-slate-500/8 border-slate-500/15 text-slate-600 dark:text-slate-400`;
    case 'submitted':
      return `${base} bg-indigo-500/8 border-indigo-500/15 text-indigo-600 dark:text-indigo-400`;
    case 'under_review':
      return `${base} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
    case 'revisions_requested':
      return `${base} bg-orange-500/8 border-orange-500/15 text-orange-600 dark:text-orange-400`;
    case 'accepted':
      return `${base} bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
    case 'copyediting':
      return `${base} bg-purple-500/8 border-purple-500/15 text-purple-600 dark:text-purple-400`;
    case 'rejected':
      return `${base} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`;
    case 'published':
      return `${base} bg-teal-500/8 border-teal-500/15 text-teal-600 dark:text-teal-400`;
    default:
      return `${base} bg-ink/5 border-ink/10 text-ink/70 dark:bg-white/5 dark:border-white/10 dark:text-white/60`;
  }
}

export function assignmentStatusPillClass(status: string): string {
  const base =
    'inline-flex items-center shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border tabular-nums';
  switch (status) {
    case 'invited':
      return `${base} bg-sky-500/8 border-sky-500/15 text-sky-600 dark:text-sky-400`;
    case 'accepted':
      return `${base} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
    case 'completed':
      return `${base} bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
    case 'declined':
      return `${base} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`;
    default:
      return `${base} bg-ink/5 border-ink/10 text-ink/70 dark:bg-white/5 dark:border-white/10 dark:text-white/60`;
  }
}

/**
 * Revision severity is rendered as its own chip next to the status pill rather
 * than as a status variant, matching how it is modelled on the backend.
 */
export function revisionSeverityPillClass(severity: string): string {
  const base =
    'inline-flex items-center shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border tabular-nums';
  return severity === 'major'
    ? `${base} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`
    : `${base} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
}

export function revisionSeverityLabel(
  severity: string,
  t: (key: 'severityMinor' | 'severityMajor') => string,
): string {
  return severity === 'major' ? t('severityMajor') : t('severityMinor');
}

/**
 * Author-facing wording for one anonymized reviewer's state. Deliberately
 * distinct from `assignmentStatusLabel`, which is editor-facing.
 */
export function reviewerProgressLabel(
  status: string,
  t: (
    key:
      | 'workflowReviewerInvited'
      | 'workflowReviewerAccepted'
      | 'workflowReviewerDeclined'
      | 'workflowReviewerCompleted',
  ) => string,
): string {
  switch (status) {
    case 'accepted':
      return t('workflowReviewerAccepted');
    case 'declined':
      return t('workflowReviewerDeclined');
    case 'completed':
      return t('workflowReviewerCompleted');
    default:
      return t('workflowReviewerInvited');
  }
}

export function assignmentStatusLabel(
  status: string,
  t: (
    key:
      | 'stAssignInvited'
      | 'stAssignAccepted'
      | 'stAssignCompleted'
      | 'stAssignDeclined',
  ) => string,
): string {
  switch (status) {
    case 'invited':
      return t('stAssignInvited');
    case 'accepted':
      return t('stAssignAccepted');
    case 'completed':
      return t('stAssignCompleted');
    case 'declined':
      return t('stAssignDeclined');
    default:
      return status;
  }
}

export function submissionStatusLabel(
  status: string,
  t: (
    key:
      | 'stDraft'
      | 'stSubmitted'
      | 'stUnderReview'
      | 'stRevisions'
      | 'stAccepted'
      | 'stRejected'
      | 'stCopyediting'
      | 'stPublished'
      | 'stRetracted',
  ) => string,
): string {
  switch (status) {
    case 'draft':
      return t('stDraft');
    case 'submitted':
      return t('stSubmitted');
    case 'under_review':
      return t('stUnderReview');
    case 'revisions_requested':
      return t('stRevisions');
    case 'accepted':
      return t('stAccepted');
    case 'rejected':
      return t('stRejected');
    case 'copyediting':
      return t('stCopyediting');
    case 'published':
      return t('stPublished');
    case 'retracted':
      return t('stRetracted');
    default:
      return status;
  }
}

export function formatSubmissionUpdatedAt(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export { EMPTY_STATE_CLS };

type SubmissionListSkeletonProps = {
  /** Omit when a parent `<main aria-busy>` already announces loading. */
  loadingLabel?: string;
};

export function SubmissionListSkeleton({
  loadingLabel,
}: SubmissionListSkeletonProps = {}) {
  const list = (
    <ul className="mt-6 space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          style={{ '--sk-delay': `${i * 75}ms` } as React.CSSProperties}
          className="rounded-xl border border-ink/10 dark:border-white/10 border-s-4 border-s-accent/15 bg-surface p-4 shadow-xs"
        >
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-3/5 max-w-md" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-2">
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
        </li>
      ))}
    </ul>
  );

  if (!loadingLabel) {
    return <div aria-hidden>{list}</div>;
  }

  return <SkeletonBusyRegion label={loadingLabel}>{list}</SkeletonBusyRegion>;
}

type SubmissionQueueRowProps = {
  href: string;
  title: string;
  status: string;
  updatedAt: string;
  locale: string;
  t: SubmissionsListTranslator;
  disciplineSuggestedLabels?: string[] | null;
  disciplines?: string[] | null;
};

export function SubmissionQueueRow({
  href,
  title,
  status,
  updatedAt,
  locale,
  t,
  disciplineSuggestedLabels,
  disciplines,
}: SubmissionQueueRowProps) {
  const label = submissionStatusLabel(status, t);
  const dateStr = formatSubmissionUpdatedAt(updatedAt, locale);
  const badgeLabels =
    (disciplineSuggestedLabels?.length
      ? disciplineSuggestedLabels
      : disciplines) ?? [];
  return (
    <li>
      <Link href={href} className={queueRowCardLinkCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span
            className="min-w-0 flex-1 text-base font-serif font-bold text-ink group-hover:text-accent transition-colors duration-200"
            dir="auto"
          >
            {title}
          </span>
          <span className={statusPillClass(status)}>{label}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55 dark:text-white/55">
          <div className="flex flex-col gap-1 min-w-0">
            {dateStr ? (
              <span className="flex items-center gap-1">
                <CalendarDays
                  className="size-3.5 text-accent opacity-75"
                  strokeWidth={2.5}
                  aria-hidden
                />
                {t('updatedLabel', { date: dateStr })}
              </span>
            ) : null}

            {badgeLabels.length > 0 ? (
              <DisciplineBadges
                labels={badgeLabels}
                size="sm"
                className="max-w-xs"
              />
            ) : null}
          </div>

          <span className="inline-flex items-center gap-1 font-semibold text-accent opacity-80 transition group-hover:opacity-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 select-none">
            <span className="text-xs tracking-wide">{t('view')}</span>
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}

type AssignmentQueueRowProps = {
  slug: string | null | undefined;
  title: string;
  assignmentStatus: string;
  submissionStatus: string;
  assignedAt?: string;
  locale: string;
  tAssign: AssignmentsListTranslator;
  tSub: SubmissionsListTranslator;
};

function AssignmentQueueRowInner({
  title,
  assignmentStatus,
  submissionStatus,
  assignedAt,
  locale,
  tAssign,
  tSub,
  ctaLabelKey,
  showRowCta,
}: Omit<AssignmentQueueRowProps, 'slug'> & {
  showRowCta: boolean;
  ctaLabelKey: 'openReview' | 'respondToInvite';
}) {
  const assignLabel = assignmentStatusLabel(assignmentStatus, tAssign);
  const subLabel = submissionStatus.trim()
    ? submissionStatusLabel(submissionStatus, tSub)
    : '';
  const dateStr = assignedAt
    ? formatSubmissionUpdatedAt(assignedAt, locale)
    : '';
  const ctaText =
    ctaLabelKey === 'respondToInvite'
      ? tAssign('respondToInvite')
      : tAssign('openReview');
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className="min-w-0 flex-1 text-base font-serif font-bold text-ink group-hover:text-accent transition-colors duration-200"
          dir="auto"
        >
          {title}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={assignmentStatusPillClass(assignmentStatus)}>
            {assignLabel}
          </span>
          {submissionStatus.trim() ? (
            <span className={statusPillClass(submissionStatus)}>
              {subLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55 dark:text-white/55">
        {dateStr ? (
          <span className="flex items-center gap-1">
            <CalendarDays
              className="size-3.5 text-accent opacity-75"
              strokeWidth={2.5}
              aria-hidden
            />
            {tAssign('assignedLabel', { date: dateStr })}
          </span>
        ) : (
          <span />
        )}
        {showRowCta ? (
          <span className="inline-flex items-center gap-1 font-semibold text-accent opacity-80 transition group-hover:opacity-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 select-none">
            <span className="text-xs tracking-wide">{ctaText}</span>
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </span>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}

function assignmentRowLinkPart(status: string): 'invite' | 'review' | null {
  if (status === 'invited') return 'invite';
  if (status === 'accepted') return 'review';
  return null;
}

export function AssignmentQueueRow({
  slug,
  title,
  assignmentStatus,
  submissionStatus,
  assignedAt,
  locale,
  tAssign,
  tSub,
}: AssignmentQueueRowProps) {
  const part = assignmentRowLinkPart(assignmentStatus);
  const rowHref =
    slug?.trim() && part
      ? `/assignments/${encodeURIComponent(slug.trim())}/${part}`
      : null;
  const inner = (
    <AssignmentQueueRowInner
      title={title}
      assignmentStatus={assignmentStatus}
      submissionStatus={submissionStatus}
      assignedAt={assignedAt}
      locale={locale}
      tAssign={tAssign}
      tSub={tSub}
      showRowCta={Boolean(rowHref)}
      ctaLabelKey={part === 'invite' ? 'respondToInvite' : 'openReview'}
    />
  );

  if (rowHref) {
    return (
      <li>
        <Link href={rowHref} className={queueRowCardLinkCls}>
          {inner}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div
        className="flex flex-col gap-3 rounded-xl border border-ink/10 dark:border-white/10 border-s-4 border-s-accent/25 bg-surface p-4 shadow-xs"
        aria-disabled
      >
        {inner}
      </div>
    </li>
  );
}

export const submissionQueueShellCls = PAGE_SHELL;
