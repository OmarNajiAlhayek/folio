'use client';

import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const noOpSubscribe = () => () => {};

/** True on client, false on server — avoids setState in an effect (react-hooks/set-state-in-effect). */
function useClientMounted() {
  return useSyncExternalStore(
    noOpSubscribe,
    () => true,
    () => false,
  );
}

const ORDER = ['light', 'dark', 'system'] as const;

function cycleTheme(current: string | undefined): (typeof ORDER)[number] {
  const c = (current ?? 'system') as (typeof ORDER)[number];
  const i = ORDER.includes(c) ? ORDER.indexOf(c) : 2;
  return ORDER[(i + 1) % ORDER.length];
}

/**
 * `showTooltip={false}` is for menus that already label this control: `Popover.Content`
 * auto-focuses its first child on open, and a Radix tooltip opens on focus, so a tooltip here
 * would fire every time the containing menu is opened. `showLabel` replaces what it said.
 */
export function ThemeToggle({
  className,
  showLabel = false,
  showTooltip = true,
}: {
  className?: string;
  showLabel?: boolean;
  showTooltip?: boolean;
}) {
  const t = useTranslations('Nav');
  const { theme, setTheme } = useTheme();
  const mounted = useClientMounted();

  const activeTheme = mounted ? (theme ?? 'system') : 'system';
  const currentLabel =
    activeTheme === 'light'
      ? t('themeLight')
      : activeTheme === 'dark'
        ? t('themeDark')
        : t('themeSystem');

  const tooltipLabel = t('themeToggleTitle', { current: currentLabel });

  const button = (
    <button
      type="button"
      onClick={() => setTheme(cycleTheme(theme))}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-ink/15 bg-surface px-2 py-1 text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface theme-icon-container',
        showLabel && 'gap-1.5 px-2.5 text-xs font-medium',
        className,
      )}
      aria-label={t('themeToggleAria', { current: currentLabel })}
    >
      <span className="size-4">
        {!mounted ? (
          <Monitor
            className="size-4 opacity-40"
            aria-hidden
            suppressHydrationWarning
          />
        ) : activeTheme === 'light' ? (
          <Sun className="size-4" aria-hidden />
        ) : activeTheme === 'dark' ? (
          <Moon className="size-4" aria-hidden />
        ) : (
          <Monitor className="size-4" aria-hidden />
        )}
      </span>
      {showLabel && (
        <span suppressHydrationWarning>{mounted ? currentLabel : ''}</span>
      )}
    </button>
  );

  if (!showTooltip) return button;
  return <SimpleTooltip content={tooltipLabel}>{button}</SimpleTooltip>;
}
