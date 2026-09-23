import { cn } from '@/lib/utils';

type ResultCountProps = {
  /** Already-localized and pluralized, e.g. "12 results". */
  label: string;
  /** Dims the chip while a refetch is in flight. */
  stale?: boolean;
  /** Extra note beside the count, e.g. a cap on semantic results. */
  note?: string;
  className?: string;
};

/**
 * The small "N results" chip above a list.
 *
 * `aria-live="polite"` so a screen reader hears the count change after a search
 * without the list itself being re-announced row by row.
 */
export function ResultCount({ label, stale = false, note, className }: ResultCountProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 transition-opacity duration-200',
        stale && 'opacity-70',
        className,
      )}
    >
      <p
        aria-live="polite"
        className="flex max-w-fit items-center gap-2 rounded-full border border-ink/[0.05] bg-ink/[0.03] px-3.5 py-1 text-xs font-semibold text-ink/55 dark:bg-white/[0.03]"
      >
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-75 motion-reduce:animate-none" />
          <span className="relative size-1.5 rounded-full bg-accent" />
        </span>
        {label}
      </p>
      {note ? (
        <p className="max-w-md text-[11px] leading-snug text-ink/50">{note}</p>
      ) : null}
    </div>
  );
}
