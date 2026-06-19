'use client';

import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { ar as arLocale, enUS } from 'date-fns/locale';
import { CalendarDays, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

const calendarClassNames = {
  root: 'p-3 select-none',
  months: 'flex flex-col',
  month: 'space-y-2',
  month_caption: 'relative flex items-center justify-center px-8 py-0.5',
  caption_label: 'text-sm font-semibold text-ink',
  nav: 'absolute inset-x-0 top-0 flex items-center justify-between px-0.5 py-0.5',
  button_previous: [
    'flex size-7 items-center justify-center rounded-lg text-ink/50 transition',
    'hover:bg-ink/8 hover:text-ink',
    'disabled:pointer-events-none disabled:opacity-30',
  ].join(' '),
  button_next: [
    'flex size-7 items-center justify-center rounded-lg text-ink/50 transition',
    'hover:bg-ink/8 hover:text-ink',
    'disabled:pointer-events-none disabled:opacity-30',
  ].join(' '),
  month_grid: 'mt-1 w-full border-collapse',
  weekdays: 'flex',
  weekday: 'w-9 pb-1.5 text-center text-[11px] font-medium text-ink/35',
  week: 'mt-0.5 flex',
  day: 'relative p-0 text-center',
  day_button: [
    'size-9 rounded-lg text-sm font-medium text-ink/80 transition-all duration-100',
    'hover:bg-ink/8 hover:text-ink',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
  ].join(' '),
  selected:
    '[&>button]:!bg-accent [&>button]:!text-white [&>button]:hover:!brightness-110',
  today:
    '[&>button]:ring-[1.5px] [&>button]:ring-inset [&>button]:ring-accent/40 [&>button]:font-semibold',
  outside: 'opacity-35',
  disabled: 'pointer-events-none opacity-25',
  hidden: 'invisible',
};

type DatePickerProps = {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const dateLocale = locale === 'ar' ? arLocale : enUS;

  const displayValue = value
    ? format(value, 'PP', { locale: dateLocale })
    : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl border border-ink/15 bg-paper/50 px-3 py-2 text-sm outline-hidden transition',
              'hover:border-ink/25',
              'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15',
              displayValue ? 'text-ink' : 'text-ink/45',
              value ? 'pe-8' : '',
              disabled && 'cursor-not-allowed opacity-50',
              className,
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-ink/40" aria-hidden />
            <span className="flex-1 truncate text-start">
              {displayValue ?? placeholder}
            </span>
          </button>
        </Popover.Trigger>

        {value && !disabled ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink/35 transition hover:text-ink/70"
            aria-label="Clear date"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={4}
          className={cn(
            'z-[100] overflow-hidden rounded-xl border border-ink/12 bg-surface shadow-lg outline-none',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DayPicker
            mode="single"
            selected={value}
            onSelect={(date) => {
              onChange(date);
              if (date) setOpen(false);
            }}
            locale={dateLocale}
            showOutsideDays
            classNames={calendarClassNames}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
