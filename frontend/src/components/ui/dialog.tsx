'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/50',
        'data-[state=open]:animate-[dialog-overlay-in_200ms_ease]',
        className,
      )}
    />
  );
}

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean;
    /** Visually hidden title rendered as the first Content child for Radix a11y. */
    title?: string;
  }
>(({ className, children, showClose = false, title, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
        'rounded-2xl border border-ink/15 bg-surface p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]',
        'data-[state=open]:animate-[dialog-content-in_200ms_ease]',
        'focus:outline-none',
        // No `relative` for the close button: `fixed` already anchors its
        // absolute children, and tailwind-merge would let `relative` replace
        // `fixed`, dropping the dialog into the page flow.
        className,
      )}
      {...props}
    >
      {title ? (
        <DialogPrimitive.Title className="sr-only">
          {title}
        </DialogPrimitive.Title>
      ) : null}
      {children}
      {showClose && (
        <DialogPrimitive.Close className="absolute end-4 top-4 rounded-lg p-1 text-ink/40 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-serif text-xl font-semibold text-ink', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-2 text-sm leading-relaxed text-ink/75', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-wrap items-center justify-end gap-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
