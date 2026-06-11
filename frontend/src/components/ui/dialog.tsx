'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-ink/38',
        'data-[state=open]:animate-[dialog-overlay-in_200ms_ease]',
        className,
      )}
    />
  );
}

export function DialogContent({
  children,
  className,
  showClose = false,
}: {
  children: ReactNode;
  className?: string;
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4',
          'data-[state=open]:animate-[dialog-content-in_200ms_ease]',
        )}
      >
        <div
          className={cn(
            'rounded-2xl border border-ink/15 bg-surface p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]',
            className,
          )}
        >
          {children}
          {showClose && (
            <DialogPrimitive.Close className="absolute end-4 top-4 rounded-lg p-1 text-ink/40 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Title
      className={cn('font-serif text-xl font-semibold text-ink', className)}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-2 text-sm leading-relaxed text-ink/75', className)}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

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
