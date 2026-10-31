'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export function Progress({
  className,
  value,
  ...props
}: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-ink/10 dark:bg-white/10',
        className,
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="absolute inset-y-0 start-0 h-full rounded-full bg-accent transition-all duration-500 ease-out"
        style={{ width: `${value ?? 0}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
