import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SkeletonLoadingStatusProps = {
  label: string;
};

/**
 * Screen-reader announcement for skeleton loading UI.
 * Pair with `aria-busy="true"` on the same container or a parent region.
 */
export function SkeletonLoadingStatus({ label }: SkeletonLoadingStatusProps) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {label}
    </p>
  );
}

type SkeletonBusyRegionProps = {
  label: string;
  children: ReactNode;
  className?: string;
  /** Hide decorative skeleton markup from assistive tech. Default true. */
  decorative?: boolean;
};

/**
 * Partial-page loading region: announces status, marks busy, optionally hides skeleton chrome.
 */
export function SkeletonBusyRegion({
  label,
  children,
  className,
  decorative = true,
}: SkeletonBusyRegionProps) {
  return (
    <div className={cn(className)} aria-busy="true">
      <SkeletonLoadingStatus label={label} />
      {decorative ? <div aria-hidden>{children}</div> : children}
    </div>
  );
}
