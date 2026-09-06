'use client';

import { useTranslations } from 'next-intl';
import {
  reviewerProgressLabel,
  revisionSeverityLabel,
  revisionSeverityPillClass,
} from '@/lib/submission-list-ui';
import type {
  AuthorReviewerProgress,
  AuthorReviewProgressSummary,
  RevisionSeverity,
} from '@/lib/queries/submissions';

type Props = {
  status: string;
  revisionSeverity?: RevisionSeverity | null;
  revisionRound?: number;
  reviewProgress?: AuthorReviewerProgress[];
  reviewProgressSummary?: AuthorReviewProgressSummary;
  locale: string;
};

const RAIL =
  'relative ps-6 space-y-6 before:absolute before:start-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink/[0.06] dark:before:bg-white/[0.06]';

const DOT =
  'absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold';

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * Author-facing progress rail. Step 2 is driven by `reviewProgress`, the
 * anonymized per-reviewer feed from the backend — it carries no reviewer
 * identity and no per-reviewer recommendation, so nothing here can leak either.
 */
export function SubmissionStatusTimeline({
  status,
  revisionSeverity,
  revisionRound = 0,
  reviewProgress,
  reviewProgressSummary,
  locale,
}: Props) {
  const t = useTranslations('SubmissionDetail');
  const rows = reviewProgress ?? [];
  // "N of M" counts reviewers who actually took the work on; a decline means
  // there is no review left to wait for.
  const expected = rows.filter((r) => r.status !== 'declined').length;
  const done = reviewProgressSummary?.completed ?? 0;

  return (
    <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-5">
      <h3 className="font-serif text-base font-semibold text-ink border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
        {t('workflowProgress')}
      </h3>

      <div className={RAIL}>
        {/* Step 1: Submitted */}
        <div className="relative">
          <span className={`${DOT} bg-emerald-500 text-white`}>✓</span>
          <p className="text-xs font-bold text-ink">{t('workflowSubmitted')}</p>
          <p className="text-[10px] text-ink/50">
            {t('workflowSubmittedHint')}
          </p>
        </div>

        {/* Step 2: Peer review */}
        <div className="relative">
          <span
            className={`${DOT} border ${
              status === 'under_review' || status === 'revisions_requested'
                ? 'border-blue-500 bg-blue-500 text-white animate-pulse'
                : status === 'accepted' || status === 'published'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-ink/20 dark:border-white/20 bg-paper text-ink/40'
            }`}
          >
            {status === 'accepted' || status === 'published' ? '✓' : '2'}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p
              className={`text-xs font-bold ${
                status === 'under_review'
                  ? 'text-blue-600 dark:text-blue-400'
                  : status === 'revisions_requested'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-ink'
              }`}
            >
              {t('workflowPeerReview')}
            </p>
            {expected > 0 && (
              <p className="text-[10px] font-semibold tabular-nums text-ink/45">
                {t('workflowReviewerProgress', { done, total: expected })}
              </p>
            )}
          </div>

          {rows.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {rows.map((r) => {
                const date = formatDate(
                  r.reviewSubmittedAt ?? r.respondedAt ?? r.invitedAt,
                  locale,
                );
                const due =
                  r.status === 'accepted'
                    ? formatDate(r.reviewDueAt, locale)
                    : null;
                return (
                  <li
                    key={r.index}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px]"
                  >
                    <span className="font-semibold text-ink/70">
                      {t('workflowReviewer', { index: r.index })}
                    </span>
                    <span
                      className={
                        r.status === 'completed'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : r.status === 'declined'
                            ? 'text-ink/40'
                            : 'text-ink/60'
                      }
                    >
                      {reviewerProgressLabel(r.status, t)}
                    </span>
                    {date && (
                      <span className="text-ink/40 tabular-nums">{date}</span>
                    )}
                    {due && (
                      <span className="text-ink/40 tabular-nums">
                        {t('workflowReviewerDue', { date: due })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[10px] text-ink/50">
              {status === 'under_review'
                ? t('workflowPeerReviewActive')
                : status === 'revisions_requested'
                  ? t('workflowPeerReviewRevisions')
                  : status === 'accepted' || status === 'published'
                    ? t('workflowPeerReviewDone')
                    : t('workflowPeerReviewWaiting')}
            </p>
          )}
        </div>

        {/* Step 3: Editorial decision */}
        <div className="relative">
          <span
            className={`${DOT} border ${
              status === 'accepted'
                ? 'border-emerald-500 bg-emerald-500 text-white animate-pulse'
                : status === 'published'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : status === 'rejected'
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-ink/20 dark:border-white/20 bg-paper text-ink/40'
            }`}
          >
            {status === 'published' ? '✓' : status === 'rejected' ? '✕' : '3'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`text-xs font-bold ${
                status === 'rejected'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-ink'
              }`}
            >
              {t('workflowDecision')}
            </p>
            {status === 'revisions_requested' && revisionSeverity && (
              <span className={revisionSeverityPillClass(revisionSeverity)}>
                {revisionSeverityLabel(revisionSeverity, t)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-ink/50">
            {status === 'accepted'
              ? t('workflowDecisionAccepted')
              : status === 'published'
                ? t('workflowDecisionPublished')
                : status === 'rejected'
                  ? t('workflowDecisionRejected')
                  : status === 'revisions_requested'
                    ? t('workflowDecisionRevisions')
                    : t('workflowDecisionWaiting')}
          </p>
          {revisionRound > 0 && (
            <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-ink/45">
              {t('workflowRevisionRound', { round: revisionRound })}
            </p>
          )}
        </div>

        {/* Step 4: Published */}
        {status !== 'rejected' && (
          <div className="relative">
            <span
              className={`${DOT} border ${
                status === 'published'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-ink/20 dark:border-white/20 bg-paper text-ink/40'
              }`}
            >
              {status === 'published' ? '✓' : '4'}
            </span>
            <p
              className={`text-xs font-bold ${
                status === 'published'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-ink'
              }`}
            >
              {t('workflowPublished')}
            </p>
            <p className="text-[10px] text-ink/50">
              {status === 'published'
                ? t('workflowPublishedLive')
                : t('workflowPublishedPending')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
