'use client';

import { Search, X } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Clearing the box, when it should do more than `onChange('')` — typically to
   * apply immediately instead of waiting out a debounce, since pressing × is a
   * finished decision rather than a keystroke mid-thought.
   */
  onClear?: () => void;
  placeholder: string;
  /** Accessible name. Falls back to the placeholder. */
  label?: string;
  /** Accessible name for the clear button — required for a real label in both locales. */
  clearLabel: string;
  id?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** `aria-controls` target, when the input drives a results region. */
  controls?: string;
};

/**
 * The search box every listing page uses.
 *
 * Padding is logical (`ps-`/`pe-`), not left/right: the icon sits at the start
 * of the line and the clear button at the end, which swap under `dir="rtl"`.
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  label,
  clearLabel,
  id,
  className,
  inputClassName,
  autoFocus,
  controls,
}: SearchInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasValue = value.trim().length > 0;

  return (
    <div className={cn('relative flex flex-1 items-center', className)}>
      <label className="sr-only" htmlFor={inputId}>
        {label ?? placeholder}
      </label>
      <div
        className="pointer-events-none absolute start-3 z-10 text-ink/35"
        aria-hidden
      >
        <Search className="size-4" strokeWidth={2.5} aria-hidden />
      </div>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-controls={controls}
        dir="auto"
        className={cn(
          'w-full rounded-xl border border-ink/15 bg-surface/90 ps-9 py-2.5 text-sm text-ink outline-hidden transition',
          'focus:border-accent focus:ring-2 focus:ring-accent/15',
          'dark:border-white/15',
          hasValue ? 'pe-9' : 'pe-4',
          inputClassName,
        )}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(''))}
          aria-label={clearLabel}
          className="absolute end-2.5 z-10 rounded-md p-1 text-ink/40 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        >
          <X className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
