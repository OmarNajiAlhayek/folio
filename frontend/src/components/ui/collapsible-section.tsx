'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CollapsibleSectionProps = {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
  contentClassName?: string;
  /** Subtle vertical slide on open/close. Use `false` for tight nested layouts. */
  slide?: boolean;
};

/** Smooth height + fade expand/collapse (grid 0fr → 1fr). Keeps children mounted. */
export function CollapsibleSection({
  open,
  children,
  id,
  className,
  contentClassName,
  slide = true,
}: CollapsibleSectionProps) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          inert={!open}
          className={cn(
            'transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
            slide
              ? open
                ? 'translate-y-0 opacity-100'
                : '-translate-y-2 opacity-0'
              : open
                ? 'opacity-100'
                : 'opacity-0',
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
