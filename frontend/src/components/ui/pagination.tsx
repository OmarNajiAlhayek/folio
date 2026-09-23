'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaginationLabels = {
  /** Names the <nav>, e.g. "Pagination". */
  nav: string;
  previous: string;
  next: string;
  /** `(page, total) => "Page 2 of 7"` — the small-screen summary. */
  pageOf: (page: number, total: number) => string;
  /** `(page) => "Go to page 3"` — accessible name for a numbered button. */
  goToPage: (page: number) => string;
};

type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  labels: PaginationLabels;
  /** How many numbered buttons to show before collapsing to ellipses. */
  maxButtons?: number;
  className?: string;
  disabled?: boolean;
};

type Slot = number | 'gap-start' | 'gap-end';

/**
 * Page numbers to render: always the first, the last, and a window around the
 * current page, with gaps standing in for the rest.
 */
export function paginationSlots(
  page: number,
  pageCount: number,
  maxButtons = 7,
): Slot[] {
  if (pageCount <= maxButtons) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  // First and last are always shown, and each gap costs one slot.
  const windowSize = Math.max(1, maxButtons - 4);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, page - half);
  let end = start + windowSize - 1;
  if (end >= pageCount) {
    end = pageCount - 1;
    start = Math.max(2, end - windowSize + 1);
  }

  const slots: Slot[] = [1];
  if (start > 2) slots.push('gap-start');
  for (let p = start; p <= end; p += 1) slots.push(p);
  if (end < pageCount - 1) slots.push('gap-end');
  slots.push(pageCount);
  return slots;
}

const buttonBase =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-45';

/**
 * Numbered pagination with prev/next.
 *
 * The chevrons are flipped under RTL: "previous" always points back along the
 * reading direction, which in Arabic is to the right.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  labels,
  maxButtons = 7,
  className,
  disabled = false,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(1, page), pageCount);
  const slots = paginationSlots(current, pageCount, maxButtons);

  return (
    <nav
      aria-label={labels.nav}
      className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}
    >
      <button
        type="button"
        onClick={() => onPageChange(current - 1)}
        disabled={disabled || current <= 1}
        aria-label={labels.previous}
        className={cn(buttonBase, 'border-ink/15 text-ink/75 hover:bg-ink/5 hover:text-ink dark:border-white/15')}
      >
        <ChevronLeft className="size-4 rtl:rotate-180" strokeWidth={2.5} aria-hidden />
      </button>

      {/* Numbered buttons are decoration on a phone; the summary below carries the meaning. */}
      <ul className="hidden items-center gap-1.5 sm:flex">
        {slots.map((slot, i) =>
          typeof slot === 'number' ? (
            <li key={slot}>
              <button
                type="button"
                onClick={() => onPageChange(slot)}
                disabled={disabled}
                aria-label={labels.goToPage(slot)}
                aria-current={slot === current ? 'page' : undefined}
                className={cn(
                  buttonBase,
                  slot === current
                    ? 'border-accent bg-accent text-white shadow-xs'
                    : 'border-ink/15 text-ink/75 hover:bg-ink/5 hover:text-ink dark:border-white/15',
                )}
              >
                {slot}
              </button>
            </li>
          ) : (
            <li
              key={`${slot}-${i}`}
              aria-hidden
              className="px-1 text-xs font-semibold text-ink/35"
            >
              &hellip;
            </li>
          ),
        )}
      </ul>

      <span className="px-2 text-xs font-semibold text-ink/55 sm:hidden">
        {labels.pageOf(current, pageCount)}
      </span>

      <button
        type="button"
        onClick={() => onPageChange(current + 1)}
        disabled={disabled || current >= pageCount}
        aria-label={labels.next}
        className={cn(buttonBase, 'border-ink/15 text-ink/75 hover:bg-ink/5 hover:text-ink dark:border-white/15')}
      >
        <ChevronRight className="size-4 rtl:rotate-180" strokeWidth={2.5} aria-hidden />
      </button>
    </nav>
  );
}
