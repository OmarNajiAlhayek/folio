'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterChip<K extends string = string> = {
  key: K;
  /** Already-localized, already-formatted, e.g. "Journal: Engineering". */
  label: string;
};

type FilterChipsProps<K extends string> = {
  chips: readonly FilterChip<K>[];
  onRemove: (key: K) => void;
  /** Names the list, e.g. "Active filters". */
  label: string;
  /** `(chipLabel) => "Remove Journal: Engineering"`. */
  removeLabel: (chipLabel: string) => string;
  className?: string;
};

/**
 * The removable pills showing what is currently filtering a list.
 *
 * Chips are the only place a user can see *and undo* an individual filter
 * without opening the advanced panel, so each one is a real button rather than
 * a label with an icon beside it.
 */
export function FilterChips<K extends string>({
  chips,
  onRemove,
  label,
  removeLabel,
  className,
}: FilterChipsProps<K>) {
  if (chips.length === 0) return null;

  return (
    <ul
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            aria-label={removeLabel(chip.label)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/8 px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent/40 hover:bg-accent/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          >
            <span className="truncate" dir="auto" title={chip.label}>
              {chip.label}
            </span>
            <X className="size-3 shrink-0 opacity-70" strokeWidth={2.5} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
