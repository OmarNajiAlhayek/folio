'use client';

import { useDisciplineLabel } from '@/lib/use-discipline-label';
import { cn } from '@/lib/utils';

type Props = {
  labels: string[];
  className?: string;
  size?: 'sm' | 'md';
};

export function DisciplineBadges({ labels, className, size = 'md' }: Props) {
  const { format } = useDisciplineLabel();
  const visible = labels.filter((label) => label.trim().length > 0);
  if (visible.length === 0) {
    return null;
  }

  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2.5 py-0.5';

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {visible.map((label) => (
        <span
          key={label}
          className={cn(
            'inline-flex items-center rounded-full bg-emerald-500/8 dark:bg-emerald-500/18 border border-emerald-500/20 font-semibold text-emerald-600 dark:text-emerald-400',
            textSize,
            padding,
          )}
          dir="auto"
          title={format(label)}
        >
          <span className="size-1.5 rounded-full bg-emerald-500 me-1 rtl:ms-1 rtl:me-0 animate-pulse" />
          {format(label)}
        </span>
      ))}
    </div>
  );
}
