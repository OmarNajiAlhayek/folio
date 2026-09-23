import type { LucideIcon } from 'lucide-react';
import { SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  /** Shown when filters are what emptied the list — e.g. "Clear filters". */
  action?: { label: string; onClick: () => void };
  className?: string;
};

/**
 * The empty panel a list shows when it has nothing to render.
 *
 * Callers pick the copy based on *why* it is empty: a list with no rows at all
 * reads differently from a search that matched nothing, and only the second one
 * should offer to clear the filters.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = SearchX,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-linear-to-b from-surface/50 to-surface-muted/20 p-8 text-center dark:border-white/15',
        className,
      )}
    >
      <div className="relative mb-5 flex size-16 items-center justify-center rounded-full border border-accent/15 bg-accent/8 text-accent">
        <span className="absolute inset-0 animate-pulse rounded-full bg-accent/8 motion-reduce:animate-none" />
        <Icon className="size-8" strokeWidth={2} aria-hidden />
      </div>

      <h2 className="font-serif text-lg font-bold text-ink" dir="auto">
        {title}
      </h2>
      {hint ? (
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink/60" dir="auto">
          {hint}
        </p>
      ) : null}

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-lg border border-accent px-4 py-2 text-xs font-semibold text-accent transition-all duration-200 hover:bg-accent/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
