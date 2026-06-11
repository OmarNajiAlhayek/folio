'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { sanitizeNextParam } from '@/lib/auth-redirect';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { queryKeys } from '@/lib/query-keys';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { verifyEmailSchema, translatedZodResolver } from '@/lib/validation';
import { useMe } from '@/lib/queries/auth';
import { toast } from 'sonner';

function inputCls(err: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20 tracking-[0.3em] text-center font-mono text-lg ${
    err
      ? 'border-red-400 focus:border-red-400 focus:ring-red-500/15'
      : 'border-ink/15 dark:border-white/15'
  }`;
}

type VerifyFormData = { code: string };

const RESEND_COOLDOWN_SEC = 60;

function VerifyEmailForm() {
  const t = useTranslations('VerifyEmail');
  const tv = useTranslations('Validation');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showApiError = useToastApiError();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const resolver = useMemo(
    () => translatedZodResolver(verifyEmailSchema, tv),
    [tv],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyFormData>({
    resolver,
    defaultValues: { code: '' },
  });

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SEC);
    const id = window.setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  async function onResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      await apiJson('/auth/verify-email/send', { method: 'POST' });
      toast.success(t('resendSuccess'), { id: 'verify-resend' });
      startCooldown();
    } catch (err) {
      showApiError(err, t('resendFailed'), { id: 'verify-resend-failed' });
    } finally {
      setResending(false);
    }
  }

  async function onSubmit(data: VerifyFormData) {
    try {
      await apiJson('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: data.code }),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(t('verifySuccess'), { id: 'verify-success' });
      const next = sanitizeNextParam(searchParams.get('next'));
      router.push(next ?? '/dashboard');
      router.refresh();
    } catch (err) {
      showApiError(err, t('verifyFailed'), { id: 'verify-failed' });
    }
  }

  const isAr = locale === 'ar';

  if (meLoading) {
    return (
      <main className={PAGE_SHELL}>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="md" className="border-ink/20 border-t-accent" />
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className={PAGE_SHELL}>
        <div className="mx-auto max-w-md rounded-2xl border border-ink/10 bg-paper/80 p-8 text-center shadow-sm dark:border-white/10">
          <h1 className="font-serif text-2xl font-bold text-ink">
            {t('title')}
          </h1>
          <p className="mt-4 text-sm text-ink/75">{t('loginRequired')}</p>
          <Link
            href="/login"
            className="mt-6 inline-block font-semibold text-accent hover:underline"
          >
            {t('loginLink')}
          </Link>
        </div>
      </main>
    );
  }

  if (me.emailVerified) {
    return (
      <main className={PAGE_SHELL}>
        <div className="mx-auto max-w-md rounded-2xl border border-ink/10 bg-paper/80 p-8 text-center shadow-sm dark:border-white/10">
          <h1 className="font-serif text-2xl font-bold text-ink">
            {t('alreadyVerifiedTitle')}
          </h1>
          <p className="mt-4 text-sm text-ink/75">{t('alreadyVerifiedBody')}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block font-semibold text-accent hover:underline"
          >
            {t('goToDashboard')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      <div className="relative mx-auto max-w-md">
        <div className="rounded-2xl border border-ink/10 bg-paper/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 sm:p-8">
          <h1 className="font-serif text-2xl font-bold text-ink">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-ink/75">
            {t('subtitle', { email: me.email })}
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-6 flex flex-col gap-4"
          >
            <FormField label={t('codeLabel')} error={errors.code}>
              <input
                {...register('code')}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-invalid={!!errors.code}
                className={inputCls(!!errors.code)}
                dir="ltr"
              />
            </FormField>

            <Button
              type="submit"
              loading={isSubmitting}
              className="min-w-[7rem]"
            >
              {t('verify')}
            </Button>
          </form>

          <div className="mt-5 flex flex-col gap-3 border-t border-ink/[0.08] pt-5 text-sm dark:border-white/[0.08]">
            <p className="text-ink/75">{t('resendHint')}</p>
            <Button
              type="button"
              variant="secondary"
              loading={resending}
              disabled={resendCooldown > 0}
              onClick={() => void onResend()}
            >
              {resendCooldown > 0
                ? t('resendCooldown', { seconds: resendCooldown })
                : t('resend')}
            </Button>
            <Link
              href="/dashboard"
              className={`text-center font-medium text-accent hover:underline ${isAr ? '' : ''}`}
            >
              {t('skipToDashboard')}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function VerifyFallback() {
  const t = useTranslations('VerifyEmail');
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t('title')}…</span>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyEmailForm />
    </Suspense>
  );
}
