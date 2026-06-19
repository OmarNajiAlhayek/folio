'use client';

import { cn } from '@/lib/utils';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'shrink-0 rounded-lg bg-ink/10 dark:bg-white/10 motion-safe:animate-pulse [animation-delay:var(--sk-delay,0ms)]',
        className,
      )}
      {...props}
    />
  );
}
