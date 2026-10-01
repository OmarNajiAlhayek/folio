'use client';

import {
  CalendarOff,
  CircleCheck,
  Gauge,
  ShieldAlert,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMediumDate } from '@/lib/format-date';
import type {
  ReviewerAvailability,
  ReviewerBlockReason,
} from '@/lib/queries/reviewers';
import { reviewerLoadLevel } from '@/lib/reviewer-directory';
import { cn } from '@/lib/utils';

type Tone = 'good' | 'warning' | 'critical' | 'neutral';

const TONE_CLS: Record<Tone, string> = {
  good: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400',
  warning:
    'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  critical: 'border-rose-500/20 bg-rose-500/8 text-rose-700 dark:text-rose-400',
  neutral:
    'border-ink/10 bg-ink/[0.04] text-ink/70 dark:border-white/10 dark:bg-white/[0.04]',
};

const BLOCK_VISUAL: Record<
  ReviewerBlockReason,
  { tone: Tone; icon: LucideIcon }
> = {
  conflict_of_interest: { tone: 'critical', icon: ShieldAlert },
  already_assigned: { tone: 'neutral', icon: UserCheck },
  unavailable: { tone: 'warning', icon: CalendarOff },
  at_capacity: { tone: 'critical', icon: Gauge },
};

function Pill({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: Tone;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        TONE_CLS[tone],
        className,
      )}
    >
      <Icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * One pill saying whether this reviewer can take this manuscript, and if not,
 * why. Status colours always travel with an icon and a word — never colour
 * alone.
 */
export function ReviewerStatusPill({
  availability,
  blockReason,
  className,
}: {
  availability: ReviewerAvailability;
  blockReason: ReviewerBlockReason | null;
  className?: string;
}) {
  const t = useTranslations('ReviewerBrowser');
  const locale = useLocale();

  if (
    blockReason === 'unavailable' ||
    (!blockReason && !availability.available)
  ) {
    return (
      <Pill tone="warning" icon={CalendarOff} className={className}>
        {availability.unavailableUntil
          ? t('status_unavailableUntil', {
              date: formatMediumDate(availability.unavailableUntil, locale),
            })
          : t('status_unavailable')}
      </Pill>
    );
  }
  if (blockReason) {
    const { tone, icon } = BLOCK_VISUAL[blockReason];
    return (
      <Pill tone={tone} icon={icon} className={className}>
        {t(`block_${blockReason}`)}
      </Pill>
    );
  }
  return (
    <Pill tone="good" icon={CircleCheck} className={className}>
      {t('status_available')}
    </Pill>
  );
}

const METER_FILL: Record<'ok' | 'high' | 'full', string> = {
  ok: 'bg-accent',
  high: 'bg-amber-500',
  full: 'bg-rose-500',
};

const METER_TRACK: Record<'ok' | 'high' | 'full', string> = {
  ok: 'bg-accent/15',
  high: 'bg-amber-500/20',
  full: 'bg-rose-500/20',
};

/**
 * Active reviews against the reviewer's own limit. The fill carries severity
 * and the track is a lighter step of the same hue, so state reads across the
 * whole bar. A reviewer without a limit gets the count alone — there is
 * nothing to fill.
 */
export function ReviewerLoadMeter({
  capacity,
  className,
}: {
  capacity: { active: number; max: number | null };
  className?: string;
}) {
  const t = useTranslations('ReviewerBrowser');
  const level = reviewerLoadLevel(capacity);
  const label =
    capacity.max == null
      ? t('loadUnlimited', { active: capacity.active })
      : t('load', { active: capacity.active, max: capacity.max });

  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10px] font-medium text-ink/60">{label}</p>
      {level && capacity.max != null ? (
        <div
          role="meter"
          aria-label={t('loadLabel')}
          aria-valuemin={0}
          aria-valuemax={capacity.max}
          aria-valuenow={Math.min(capacity.active, capacity.max)}
          aria-valuetext={label}
          className={cn(
            'mt-1 h-1.5 w-full overflow-hidden rounded-full',
            METER_TRACK[level],
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              METER_FILL[level],
            )}
            style={{
              width: `${Math.min(100, (capacity.active / capacity.max) * 100)}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
