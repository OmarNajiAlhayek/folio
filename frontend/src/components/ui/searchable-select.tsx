"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { selectTriggerClass } from "@/components/ui/select";

const ChevronDown = () => (
  <svg
    className="size-4 shrink-0 opacity-60"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra strings to match when searching (e.g. email) */
  keywords?: string[];
};

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  function optionSearchValue(o: SearchableSelectOption): string {
    const email = o.keywords?.find((k) => k.includes("@")) ?? "";
    return email ? `${o.label} — ${email}` : o.label;
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          disabled={disabled}
          className={cn(selectTriggerClass, className)}
        >
          <span
            className={cn("truncate", !selected && "text-ink/45")}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={4}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 z-[100] w-[var(--radix-popover-trigger-width)] min-w-[12rem] origin-[var(--radix-popover-content-transform-origin)] overflow-hidden rounded-lg border border-ink/15 bg-surface text-ink shadow-lg outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command
            className="flex max-h-[min(20rem,calc(100vh-6rem))] flex-col"
            label={searchPlaceholder}
            shouldFilter={options.length > 0}
            filter={(searchValue, query) => {
              if (!query.trim()) return 1;
              const haystack = searchValue.toLowerCase();
              const needle = query.trim().toLowerCase();
              return haystack.includes(needle) ? 1 : 0;
            }}
          >
            <Command.Input
              placeholder={searchPlaceholder}
              className="border-b border-ink/10 bg-surface px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink/40"
            />
            <Command.List
              id={listId}
              className="max-h-[min(16rem,calc(100vh-8rem))] overflow-y-auto overscroll-contain p-1"
            >
              <Command.Empty className="px-3 py-6 text-center text-sm text-ink/50">
                {emptyText}
              </Command.Empty>
              <Command.Group>
                {options.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={optionSearchValue(o)}
                    keywords={[o.label, ...(o.keywords ?? [])]}
                    onSelect={() => {
                      onValueChange(o.value);
                      setOpen(false);
                    }}
                    className="cursor-pointer rounded-md px-3 py-2 text-sm text-ink outline-none aria-selected:bg-accent/10 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50"
                  >
                    {o.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
