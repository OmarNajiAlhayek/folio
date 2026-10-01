'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  useReviewerDirectory,
  type ReviewerDirectoryEntry,
} from '@/lib/queries/reviewers';
import { reviewerInitials } from '@/lib/reviewer-directory';
import { ReviewerBrowserDialog } from './reviewer-browser-dialog';
import { ReviewerLoadMeter, ReviewerStatusPill } from './reviewer-status';
import { ReviewerStatsDialog } from './reviewer-stats-dialog';

/**
 * The directory row for the current pick, if the pool has loaded. The sidebar
 * uses it to hold the Assign button while the pick is blocked, so the editor
 * sees why before the server has to say so.
 */
export function useSelectedReviewer(
  slug: string,
  reviewerId: string,
): ReviewerDirectoryEntry | null {
  const directory = useReviewerDirectory(slug, !!reviewerId);
  if (!reviewerId) return null;
  return directory.data?.find((r) => r.id === reviewerId) ?? null;
}

export function ReviewerPickerField({
  slug,
  selectedId,
  onSelect,
  disabled,
}: {
  slug: string;
  selectedId: string;
  onSelect: (reviewerId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('ReviewerBrowser');
  const [browsing, setBrowsing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const selected = useSelectedReviewer(slug, selectedId);

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="rounded-lg border border-accent/25 bg-accent/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">
            {t('selectedLabel')}
          </p>
          <div className="mt-2 flex items-start gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback className="text-[10px]">
                {reviewerInitials(selected.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                className="block max-w-full truncate text-start text-xs font-semibold text-ink hover:text-accent hover:underline"
                title={t('viewProfile')}
                dir="auto"
              >
                {selected.displayName}
              </button>
              <ReviewerStatusPill
                availability={selected.availability}
                blockReason={selected.blockReason}
              />
              <ReviewerLoadMeter capacity={selected.capacity} />
            </div>
          </div>
          {selected.blockReason && (
            <p className="mt-2 text-[10px] text-rose-700 dark:text-rose-400">
              {t(`blockHint_${selected.blockReason}`)}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-center text-[11px] text-ink/50 dark:border-white/15">
          {t('noneSelected')}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => setBrowsing(true)}
        className="w-full text-xs"
      >
        <Users className="me-1.5 size-3.5" aria-hidden />
        {selected ? t('changeButton') : t('browseButton')}
      </Button>

      <ReviewerBrowserDialog
        slug={slug}
        open={browsing}
        onOpenChange={setBrowsing}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <ReviewerStatsDialog
        slug={slug}
        reviewerId={detailOpen && selected ? selected.id : null}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
