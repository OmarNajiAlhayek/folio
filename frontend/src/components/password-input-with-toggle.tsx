'use client';

import { forwardRef, useState, type ComponentPropsWithoutRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PasswordInputWithToggleProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'className' | 'autoComplete'
> & {
  /** Tailwind / utility classes for the `<input>` (border, padding, focus ring, etc.). */
  inputClassName: string;
  /** Optional classes merged onto the outer `relative w-full` wrapper. */
  className?: string;
  autoComplete: 'current-password' | 'new-password';
  showLabel: string;
  hideLabel: string;
};

export const PasswordInputWithToggle = forwardRef<
  HTMLInputElement,
  PasswordInputWithToggleProps
>(function PasswordInputWithToggle(
  { inputClassName, className, showLabel, hideLabel, autoComplete, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn('relative w-full', className)}>
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        className={cn('w-full pe-10', inputClassName)}
        {...rest}
      />
      <button
        type="button"
        className="absolute inset-y-0 end-0 flex items-center px-2.5 text-ink/55 outline-none transition hover:text-ink/80 focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-e-lg"
        aria-pressed={visible}
        aria-label={visible ? hideLabel : showLabel}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff className="size-5 shrink-0" aria-hidden />
        ) : (
          <Eye className="size-5 shrink-0" aria-hidden />
        )}
      </button>
    </div>
  );
});
