'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ children, ...props }: TooltipPrimitive.TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={400} {...props}>
      {children}
    </TooltipPrimitive.Root>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  children,
  className,
  sideOffset = 4,
}: {
  children: ReactNode;
  className?: string;
  sideOffset?: number;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-paper shadow-md',
          className,
        )}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-ink" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Wraps a trigger element with a tooltip label. */
export function SimpleTooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}
