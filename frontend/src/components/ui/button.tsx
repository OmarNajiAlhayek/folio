'use client';

import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
};

const variantCls: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-xs hover:brightness-105 active:scale-[0.98] disabled:opacity-60',
  secondary:
    'border border-ink/20 bg-paper text-ink shadow-xs hover:bg-ink/8 disabled:opacity-60',
  outline:
    'border border-ink/20 bg-paper text-ink shadow-xs hover:bg-ink/8 disabled:opacity-60',
  ghost: 'text-ink/75 hover:bg-ink/6 hover:text-ink disabled:opacity-50',
  danger:
    'bg-danger text-white shadow-xs hover:brightness-105 active:scale-[0.98] disabled:opacity-60',
  'danger-soft':
    'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40',
};

const sizeCls: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

const buttonStyles =
  'inline-flex min-w-[5rem] items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      asChild = false,
      className,
      children,
      ...props
    },
    ref,
  ) {
    const isLight =
      variant === 'secondary' ||
      variant === 'outline' ||
      variant === 'ghost' ||
      variant === 'danger-soft';
    const classes = cn(
      buttonStyles,
      variantCls[variant],
      sizeCls[size],
      className,
    );

    if (asChild) {
      return (
        <Slot
          ref={ref}
          aria-busy={loading || undefined}
          className={classes}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={classes}
        {...props}
      >
        {loading ? (
          <Spinner
            size="sm"
            className={cn(
              'me-2 shrink-0',
              isLight
                ? 'border-ink/20 border-t-ink/60'
                : 'border-ink/30 border-t-white',
            )}
          />
        ) : null}
        {children}
      </button>
    );
  },
);
