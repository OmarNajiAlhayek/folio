'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { SimpleTooltip } from '@/components/ui/tooltip';

/**
 * `onSwitch` lets a containing menu dismiss itself when the locale changes.
 * `showTooltip={false}` is for menus that already label this control — see `ThemeToggle`.
 */
export function LocaleSwitcher({
  onSwitch,
  showTooltip = true,
}: { onSwitch?: () => void; showTooltip?: boolean } = {}) {
  const t = useTranslations('Nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const other = locale === 'en' ? 'ar' : 'en';
  const label = other === 'ar' ? t('localeAr') : t('localeEn');
  const currentLabel = locale === 'en' ? t('localeEn') : t('localeAr');

  const button = (
    <button
      type="button"
      onClick={() => {
        onSwitch?.();
        router.replace(pathname, { locale: other });
      }}
      className="group inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      lang={other}
      aria-label={t('localeToggleAria', { current: currentLabel })}
    >
      <Globe
        className="size-3.5 text-ink/60 transition-transform duration-700 group-hover:rotate-180"
        aria-hidden
      />
      <span>{label}</span>
    </button>
  );

  if (!showTooltip) return button;
  return (
    <SimpleTooltip content={t('localeToggleTitle', { current: currentLabel })}>
      {button}
    </SimpleTooltip>
  );
}
