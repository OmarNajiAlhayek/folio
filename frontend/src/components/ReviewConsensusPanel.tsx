'use client';

import { useTranslations } from 'next-intl';

export type ConsensusAssignment = {
  id: string;
  reviewerId: string;
  status: string;
  reviewer?: { displayName?: string; email?: string };
};

export type ConsensusReview = {
  assignmentId: string;
  recommendation: string;
};

function recommendationLabel(
  r: string,
  tCommon: (key: string) => string,
): string {
  switch (r) {
    case 'accept':
      return tCommon('recAccept');
    case 'reject':
      return tCommon('recReject');
    case 'minor_revisions':
      return tCommon('recMinorRevisions');
    case 'major_revisions':
      return tCommon('recMajorRevisions');
    case 'revisions':
      return tCommon('recRevisions');
    case 'resubmit_for_review':
      return tCommon('recResubmitForReview');
    case 'resubmit_elsewhere':
      return tCommon('recResubmitElsewhere');
    case 'see_comments':
      return tCommon('recSeeComments');
    default:
      return tCommon('recRevisions');
  }
}

function recommendationPillClass(r: string): string {
  const base =
    'inline-flex items-center shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border tabular-nums';
  switch (r) {
    case 'accept':
      return `${base} bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
    case 'reject':
      return `${base} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`;
    case 'major_revisions':
    case 'resubmit_for_review':
      return `${base} bg-orange-500/8 border-orange-500/15 text-orange-600 dark:text-orange-400`;
    case 'minor_revisions':
    case 'revisions':
      return `${base} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
    default:
      return `${base} bg-ink/5 border-ink/10 text-ink/70 dark:bg-white/5 dark:border-white/10 dark:text-white/60`;
  }
}

/**
 * Editor-only tally of reviewer recommendations vs. pending/completed
 * assignments for a submission. Purely derived from data the detail page
 * already fetches (assignments + reviews) — no extra backend call.
 */
export function ReviewConsensusPanel({
  assignments,
  reviews,
}: {
  assignments: ConsensusAssignment[];
  reviews: ConsensusReview[];
}) {
  const t = useTranslations('SubmissionDetail');
  const tCommon = useTranslations('Common');

  if (assignments.length === 0) {
    return <p className="text-sm text-ink/65">{t('consensusNoAssignments')}</p>;
  }

  const completedCount = assignments.filter(
    (a) => a.status === 'completed',
  ).length;
  const pendingCount = assignments.length - completedCount;
  const recommendationByAssignment = new Map(
    reviews.map((r) => [r.assignmentId, r.recommendation]),
  );

  /**
   * Advisory only — the editor still chooses. Any reviewer asking for major
   * revisions (or a full resubmission) outweighs the ones asking for minor:
   * the heavier ask sets the amount of work the author actually faces.
   */
  const revisionRecs = reviews.filter((r) =>
    ['minor_revisions', 'major_revisions', 'revisions'].includes(
      r.recommendation,
    ),
  );
  const suggestedSeverity =
    revisionRecs.length === 0
      ? null
      : revisionRecs.some((r) => r.recommendation === 'major_revisions') ||
          reviews.some((r) => r.recommendation === 'resubmit_for_review')
        ? 'major'
        : 'minor';

  return (
    <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
          {t('consensusPanelTitle')}
        </h3>
        <span className="text-[10px] text-ink/50">
          {t('consensusAssignmentsTotal', { count: assignments.length })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
        <span className="rounded-full bg-emerald-500/8 border border-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
          {t('consensusCompleted', { count: completedCount })}
        </span>
        <span className="rounded-full bg-ink/5 border border-ink/10 px-2 py-0.5 text-ink/60 dark:bg-white/5 dark:border-white/10 dark:text-white/60">
          {t('consensusPending', { count: pendingCount })}
        </span>
      </div>
      {suggestedSeverity && (
        <p className="text-[10px] text-ink/50">
          {t('consensusSuggestedSeverity', {
            severity:
              suggestedSeverity === 'major'
                ? t('severityMajor')
                : t('severityMinor'),
          })}
        </p>
      )}
      <ul className="flex flex-wrap gap-1.5">
        {assignments.map((a) => {
          const name =
            a.reviewer?.displayName?.trim() ||
            a.reviewer?.email?.trim() ||
            a.reviewerId;
          const recommendation = recommendationByAssignment.get(a.id);
          if (!recommendation) return null;
          return (
            <li key={a.id} className={recommendationPillClass(recommendation)}>
              {t('consensusReviewerPill', {
                name,
                recommendation: recommendationLabel(recommendation, tCommon),
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
