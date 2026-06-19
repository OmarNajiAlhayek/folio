'use client';

import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { selectTriggerClass } from '@/components/ui/select';

export type MultiSelectOption = { value: string; label: string };

export function MultiSelect({
  options,
  value,
  onChange,
  emptyLabel,
  manySelectedLabel,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Shown when nothing is selected (e.g. “all”) */
  emptyLabel: string;
  /** When more than two values are selected */
  manySelectedLabel: (count: number) => string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    if (value.length === 0) return emptyLabel;
    const labels = value
      .map((v) => options.find((o) => o.value === v)?.label)
      .filter(Boolean) as string[];
    if (labels.length <= 2) return labels.join(', ');
    return manySelectedLabel(value.length);
  }, [value, options, emptyLabel, manySelectedLabel]);

  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          disabled={disabled}
          className={cn(selectTriggerClass, className)}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 z-50 w-[var(--radix-popover-trigger-width)] min-w-[12rem] origin-[var(--radix-popover-content-transform-origin)] rounded-lg border border-ink/15 bg-surface p-1 text-ink shadow-lg outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
        >
          <ul
            className="max-h-[min(18rem,calc(100vh-6rem))] overflow-y-auto overscroll-contain py-0.5"
            role="listbox"
            aria-multiselectable
          >
            {options.map((o) => {
              const checked = value.includes(o.value);
              return (
                <li key={o.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(o.value)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-ink outline-none hover:bg-accent/10 focus-visible:bg-accent/10"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border border-ink/25 bg-surface',
                        checked && 'border-accent bg-accent text-white',
                      )}
                      aria-hidden
                    >
                      {checked && <Check className="size-2.5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
