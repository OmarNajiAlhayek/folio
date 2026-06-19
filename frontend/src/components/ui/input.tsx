'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export function inputFieldClass(
  error = false,
  extraCls?: string,
  className?: string,
) {
  return cn(
    'w-full rounded-xl border ps-10 pe-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60',
    'focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20',
    error
      ? 'border-red-400 focus:border-red-400 focus:ring-red-500/15'
      : 'border-ink/15 dark:border-white/15',
    extraCls,
    className,
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
  extraCls?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, extraCls, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={inputFieldClass(error, extraCls, className)}
      {...props}
    />
  );
});
