'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CalendarOff, CircleCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { ReviewerLoadMeter } from '@/components/reviewer-browser/reviewer-status';
import { apiJson } from '@/lib/api';
import { formatMediumDate } from '@/lib/format-date';
import type { MeProfile } from '@/lib/permissions';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { cn } from '@/lib/utils';

type Draft = {
  available: boolean;
  /** `YYYY-MM-DD` or empty for open-ended. */
  until: string;
  note: string;
  /** Raw input; empty is no limit. */
  max: string;
};

function draftFrom(me: MeProfile): Draft {
  const a = me.reviewerAvailability;
  return {
    available: a?.available ?? true,
    until: a?.unavailableUntil ?? '',
    note: a?.note ?? '',
    max: a?.maxActiveReviews != null ? String(a.maxActiveReviews) : '',
  };
}

/** The calendar day the reviewer picked, not the UTC instant of its midnight. */
function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromIsoDay(day: string): Date | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseMax(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const n = Number(trimmed);
  return n >= 1 && n <= 50 ? n : 'invalid';
}

/**
 * Where a reviewer says whether they are taking new invitations and how many
 * reviews they will carry at once. Editors see both in the reviewer browser,
 * and the invitation endpoint enforces them.
 */
export function ReviewerAvailabilityCard({
  me,
  activeLoad,
}: {
  me: MeProfile;
  /** Invited + accepted assignments, from the rows the inbox already has. */
  activeLoad: number;
}) {
  const t = useTranslations('ReviewerAvailability');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const showApiError = useToastApiError();
  const ids = { until: useId(), note: useId(), max: useId(), status: useId() };
  const [draft, setDraft] = useState<Draft>(() => draftFrom(me));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = me.reviewerAvailability;
  useEffect(() => {
    setDraft(draftFrom(me));
    // Re-sync only when the stored values change, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    saved?.available,
    saved?.unavailableUntil,
    saved?.note,
    saved?.maxActiveReviews,
  ]);

  const initial = draftFrom(me);
  const dirty =
    draft.available !== initial.available ||
    draft.max.trim() !== initial.max ||
    (!draft.available &&
      (draft.until !== initial.until || draft.note.trim() !== initial.note));

  const savedMax = saved?.maxActiveReviews ?? null;
  const atCapacity = savedMax != null && activeLoad >= savedMax;

  async function save() {
    const max = parseMax(draft.max);
    if (max === 'invalid') {
      setError(t('invalidMax'));
      return;
    }
    const today = toIsoDay(new Date());
    if (!draft.available && draft.until && draft.until <= today) {
      setError(t('invalidUntil'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiJson('/auth/me/researcher-profile', {
        method: 'PATCH',
        body: JSON.stringify(
          draft.available
            ? { reviewerAvailable: true, reviewerMaxActiveReviews: max }
            : {
                reviewerAvailable: false,
                reviewerUnavailableUntil: draft.until || null,
                reviewerUnavailableNote: draft.note.trim() || null,
                reviewerMaxActiveReviews: max,
              },
        ),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(t('saved'), { id: 'reviewer-availability-saved' });
    } catch (err) {
      showApiError(err, t('saveFailed'), { id: 'reviewer-availability' });
    } finally {
      setSaving(false);
    }
  }

  const segment = (value: boolean, label: string, Icon: typeof CircleCheck) => (
    <button
      type="button"
      role="radio"
      aria-checked={draft.available === value}
      onClick={() => setDraft((d) => ({ ...d, available: value }))}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
        draft.available === value
          ? value
            ? 'bg-emerald-500/12 text-emerald-700 shadow-xs dark:text-emerald-400'
            : 'bg-amber-500/15 text-amber-800 shadow-xs dark:text-amber-300'
          : 'text-ink/60 hover:text-ink',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );

  const fieldCls =
    'w-full rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm text-ink outline-hidden transition focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/15';

  return (
    <section
      aria-labelledby="reviewer-availability-title"
      className="mt-6 rounded-2xl border border-ink/8 bg-surface/50 p-4 sm:p-5 dark:border-white/8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2
            id="reviewer-availability-title"
            className="font-serif text-lg font-semibold text-ink"
          >
            {t('title')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink/60">
            {t('hint')}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby={ids.status}
          className="flex gap-1 rounded-xl bg-ink/[0.04] p-1 dark:bg-white/[0.04]"
        >
          <span id={ids.status} className="sr-only">
            {t('statusLabel')}
          </span>
          {segment(true, t('available'), CircleCheck)}
          {segment(false, t('unavailable'), CalendarOff)}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {!draft.available && (
          <>
            <div className="space-y-1">
              <label
                htmlFor={ids.until}
                className="block text-xs font-semibold text-ink/70"
              >
                {t('untilLabel')}
              </label>
              <DatePicker
                id={ids.until}
                value={fromIsoDay(draft.until)}
                onChange={(date) =>
                  setDraft((d) => ({ ...d, until: date ? toIsoDay(date) : '' }))
                }
                placeholder={t('untilPlaceholder')}
              />
              <p className="text-[11px] text-ink/50">{t('untilHint')}</p>
            </div>
            <div className="space-y-1">
              <label
                htmlFor={ids.note}
                className="block text-xs font-semibold text-ink/70"
              >
                {t('noteLabel')}
              </label>
              <input
                id={ids.note}
                type="text"
                maxLength={500}
                value={draft.note}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, note: e.target.value }))
                }
                placeholder={t('notePlaceholder')}
                dir="auto"
                className={fieldCls}
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <label
            htmlFor={ids.max}
            className="block text-xs font-semibold text-ink/70"
          >
            {t('maxLabel')}
          </label>
          <input
            id={ids.max}
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step={1}
            value={draft.max}
            onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
            placeholder={t('maxPlaceholder')}
            className={cn(fieldCls, 'sm:max-w-40')}
          />
          <p className="text-[11px] text-ink/50">{t('maxHint')}</p>
        </div>

        <div className="space-y-2 self-end">
          <ReviewerLoadMeter
            capacity={{ active: activeLoad, max: savedMax }}
            className="[&>p]:sr-only"
          />
          <p className="text-xs text-ink/70">
            {savedMax == null
              ? t('loadLineUnlimited', { active: activeLoad })
              : t('loadLine', { active: activeLoad, max: savedMax })}
          </p>
          {saved && !saved.available && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {saved.unavailableUntil
                ? t('awayUntil', {
                    date: formatMediumDate(saved.unavailableUntil, locale),
                  })
                : t('awayOpenEnded')}
            </p>
          )}
          {atCapacity && (
            <p className="text-xs text-rose-700 dark:text-rose-400">
              {t('atCapacity')}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {error && (
          <p role="alert" className="me-auto text-xs text-red-600">
            {error}
          </p>
        )}
        <Button
          size="sm"
          loading={saving}
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {t('save')}
        </Button>
      </div>
    </section>
  );
}
