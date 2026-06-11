'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '@/lib/utils';

type CheckboxProps = {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function Checkbox({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
}: CheckboxProps) {
  const checkboxId =
    id ?? `checkbox-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'relative flex cursor-pointer items-start gap-3 rounded-xl border border-ink/10 bg-paper/30 p-3.5 transition',
        'hover:bg-ink/[0.02] dark:border-white/10 dark:hover:bg-white/[0.02]',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <CheckboxPrimitive.Root
        id={checkboxId}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-md border border-ink/25 bg-paper',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
          disabled && 'opacity-60',
        )}
      >
        <CheckboxPrimitive.Indicator>
          <svg
            className="size-3 text-white"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M2.5 6l2.5 2.5 4.5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="select-none">
        <span className="text-xs font-medium leading-normal text-ink/85">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-[10px] leading-tight text-ink/55">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
