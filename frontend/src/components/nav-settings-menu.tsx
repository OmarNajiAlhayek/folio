'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings } from 'lucide-react';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Collapses the theme toggle and locale switcher into one header control.
 *
 * Beyond reclaiming ~150px of the nav row, this is what finally puts the locale switcher on
 * mobile — the mobile bar previously rendered only the theme toggle.
 */
export function NavSettingsMenu({ className }: { className?: string }) {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('settingsAria')}
          className={cn(
            'settings-icon-container inline-flex shrink-0 items-center justify-center rounded-md border border-ink/15 bg-surface px-2 py-1 text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            open && 'bg-ink/5',
            className,
          )}
        >
          <Settings className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
          {t('settings')}
        </p>
        {/*
          Tooltips are suppressed on both controls: this popover auto-focuses its first child on
          open, and a Radix tooltip opens on focus — so they would fire every time the menu opens
          and render outside it. The row labels plus `showLabel` carry the same information.
        */}
        <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
          <span className="text-sm font-medium text-ink/75">{t('theme')}</span>
          <ThemeToggle showLabel showTooltip={false} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
          <span className="text-sm font-medium text-ink/75">
            {t('language')}
          </span>
          {/* Switching locale navigates and flips direction, so dismiss the menu with it. */}
          <LocaleSwitcher showTooltip={false} onSwitch={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
