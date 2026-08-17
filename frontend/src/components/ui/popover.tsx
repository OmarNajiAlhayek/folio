'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

/**
 * Menu-style popover. Styling mirrors the inline Radix popovers already used by
 * `searchable-select.tsx` / `multi-select.tsx` so surfaces stay consistent, minus the
 * `--radix-popover-trigger-width` constraint those need for select-style widgets.
 *
 * Direction (LTR/RTL) is handled globally by `DirectionProvider` in
 * `components/locale-direction-provider.tsx`, so `align="start" | "end"` flips for Arabic.
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'end',
  side = 'bottom',
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2',
          'z-[100] min-w-[12rem] max-w-[min(20rem,calc(100vw-2rem))] origin-[var(--radix-popover-content-transform-origin)]',
          'overflow-hidden rounded-lg border border-ink/15 bg-surface p-1 text-ink shadow-lg outline-none',
          'data-[state=closed]:animate-out data-[state=open]:animate-in',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
