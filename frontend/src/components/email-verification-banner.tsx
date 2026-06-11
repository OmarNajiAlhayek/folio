'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMe } from '@/lib/queries/auth';

export function EmailVerificationBanner() {
  const t = useTranslations('VerifyEmail');
  const { data: me, isLoading } = useMe();

  if (isLoading || !me || me.emailVerified) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
        <span>{t('bannerMessage')}</span>
        <Link
          href="/verify-email"
          className="font-semibold text-accent underline decoration-offset-2 hover:opacity-90"
        >
          {t('bannerAction')}
        </Link>
      </div>
    </div>
  );
}
