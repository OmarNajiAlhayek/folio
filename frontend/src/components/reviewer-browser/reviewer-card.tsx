'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { ReviewerDirectoryEntry } from '@/lib/queries/reviewers';
import {
  formatPercent,
  reviewerInitials,
  reviewerKeywordList,
} from '@/lib/reviewer-directory';
import { cn } from '@/lib/utils';
import { ReviewerLoadMeter, ReviewerStatusPill } from './reviewer-status';

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] text-ink/50">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function ReviewerCard({
  reviewer,
  selected,
  onSelect,
  onDetails,
}: {
  reviewer: ReviewerDirectoryEntry;
  selected: boolean;
  onSelect: () => void;
  onDetails: () => void;
}) {
  const t = useTranslations('ReviewerBrowser');
  const blocked = reviewer.blockReason !== null;
  const hintId = `reviewer-${reviewer.id}-block`;
  const keywords = reviewerKeywordList(reviewer.reviewKeywords);
  const { stats } = reviewer;
  const history =
    reviewer.thisSubmissionStatus === 'declined'
      ? t('declinedThisBefore')
      : reviewer.thisSubmissionStatus === 'completed'
        ? t('reviewedThisBefore')
        : null;

  return (
    <li
      className={cn(
        'min-w-0 rounded-xl border bg-paper/60 p-4 transition-colors',
        selected
          ? 'border-accent/50 ring-2 ring-accent/20'
          : 'border-ink/10 hover:border-ink/20 dark:border-white/10 dark:hover:border-white/20',
        blocked && !selected && 'bg-paper/30',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarFallback className="text-xs">
            {reviewerInitials(reviewer.displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-ink" dir="auto">
              {reviewer.displayName}
            </p>
            <ReviewerStatusPill
              availability={reviewer.availability}
              blockReason={reviewer.blockReason}
            />
          </div>
          {reviewer.affiliation && (
            <p
              className="truncate text-xs text-ink/55"
              dir="auto"
              title={reviewer.affiliation}
            >
              {reviewer.affiliation}
            </p>
          )}
          {/* Always shown: two reviewers can share a name and an institution,
              and the address tells them apart. Its own line, isolated with
              <bdi>, so an English address cannot reorder an Arabic affiliation. */}
          <p
            className="truncate text-[11px] text-ink/45"
            title={reviewer.email}
          >
            <bdi>{reviewer.email}</bdi>
          </p>
          {keywords.length > 0 && (
            <ul className="flex flex-wrap gap-1 pt-0.5">
              {keywords.map((k) => (
                <li
                  key={k}
                  dir="auto"
                  className="max-w-[12rem] truncate rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[10px] text-ink/65 dark:bg-white/[0.06]"
                >
                  {k}
                </li>
              ))}
            </ul>
          )}
          {history && (
            <p className="text-[10px] italic text-ink/50">{history}</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink/[0.06] pt-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] dark:border-white/[0.06]">
        <ReviewerLoadMeter
          capacity={reviewer.capacity}
          className="col-span-2 self-center sm:col-span-1"
        />
        <dl className="contents">
          <MiniStat
            label={t('statCompleted')}
            value={String(stats.completed)}
          />
          <MiniStat
            label={t('statAcceptance')}
            value={formatPercent(stats.acceptanceRate) ?? t('noData')}
          />
          <MiniStat
            label={t('statTurnaround')}
            value={
              stats.avgDaysToComplete == null
                ? t('noData')
                : t('days', { days: stats.avgDaysToComplete })
            }
          />
        </dl>
      </div>

      {blocked && (
        <p id={hintId} className="mt-3 text-[11px] leading-snug text-ink/55">
          {t(`blockHint_${reviewer.blockReason!}`)}
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDetails}>
          {t('details')}
        </Button>
        <Button
          size="sm"
          // A faded primary still reads as clickable; a blocked reviewer
          // gets the quiet variant so the card says "not an option" at once.
          variant={selected || blocked ? 'secondary' : 'primary'}
          disabled={blocked}
          aria-describedby={blocked ? hintId : undefined}
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? (
            <>
              <Check className="me-1 size-3.5" aria-hidden />
              {t('selected')}
            </>
          ) : (
            t('select')
          )}
        </Button>
      </div>
    </li>
  );
}
