'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { startOrcidAuth, type OrcidAuthMode } from '@/lib/orcid-auth';

type OrcidButtonProps = {
  mode?: OrcidAuthMode;
  next?: string;
  className?: string;
};

function OrcidIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 256 256" aria-hidden>
      <circle cx="128" cy="128" r="118" fill="#A6CE39" />
      <text
        x="128"
        y="148"
        textAnchor="middle"
        fill="#fff"
        fontSize="72"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        iD
      </text>
    </svg>
  );
}

export function OrcidButton({
  mode = 'login',
  next,
  className,
}: OrcidButtonProps) {
  const t = useTranslations('Orcid');
  const locale = useLocale();

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={() => startOrcidAuth({ mode, locale, next })}
    >
      <OrcidIcon />
      <span>
        {mode === 'link' ? t('linkWithOrcid') : t('continueWithOrcid')}
      </span>
    </Button>
  );
}

export function OrcidDivider() {
  const t = useTranslations('Orcid');
  return (
    <div className="relative my-1 flex items-center gap-3">
      <div className="h-px flex-1 bg-ink/10 dark:bg-white/10" aria-hidden />
      <span className="text-xs font-medium uppercase tracking-wider text-ink/45">
        {t('or')}
      </span>
      <div className="h-px flex-1 bg-ink/10 dark:bg-white/10" aria-hidden />
    </div>
  );
}
