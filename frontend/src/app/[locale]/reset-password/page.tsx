'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { apiJson } from '@/lib/api';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { PasswordInputWithToggle } from '@/components/password-input-with-toggle';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { resetPasswordSchema, translatedZodResolver } from '@/lib/validation';
import { toast } from 'sonner';

function fieldCls(err: boolean) {
  return `w-full rounded-xl border ps-10 pe-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20 ${
    err
      ? 'border-red-400 focus:border-red-400 focus:ring-red-500/15'
      : 'border-ink/15 dark:border-white/15'
  }`;
}

type ResetFormData = { password: string; confirmPassword: string };

function ResetPasswordForm() {
  const t = useTranslations('ResetPassword');
  const tv = useTranslations('Validation');
  const router = useRouter();
  const searchParams = useSearchParams();
  const showApiError = useToastApiError();
  const token = searchParams.get('token')?.trim() ?? '';
  const [tokenState, setTokenState] = useState<'loading' | 'valid' | 'invalid'>(
    token ? 'loading' : 'invalid',
  );

  const resolver = useMemo(
    () => translatedZodResolver(resetPasswordSchema, tv),
    [tv],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({
    resolver,
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        await apiJson<{ valid: true }>(
          `/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
        );
        if (!cancelled) setTokenState('valid');
      } catch {
        if (!cancelled) setTokenState('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(data: ResetFormData) {
    try {
      await apiJson('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: data.password }),
      });
      toast.success(t('resetSuccess'), { id: 'reset-success' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      showApiError(err, t('resetFailed'), { id: 'reset-failed' });
    }
  }

  if (tokenState === 'loading') {
    return (
      <main className={PAGE_SHELL}>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="md" className="border-ink/20 border-t-accent" />
        </div>
      </main>
    );
  }

  if (tokenState === 'invalid') {
    return (
      <main className={PAGE_SHELL}>
        <div className="mx-auto max-w-md rounded-2xl border border-ink/10 bg-paper/80 p-8 text-center shadow-sm dark:border-white/10">
          <h1 className="font-serif text-2xl font-bold text-ink">
            {t('invalidTitle')}
          </h1>
          <p className="mt-4 text-sm text-ink/75">{t('invalidBody')}</p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-block font-semibold text-accent hover:underline"
          >
            {t('requestNewLink')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      <div className="mx-auto max-w-md rounded-2xl border border-ink/10 bg-paper/80 p-6 shadow-sm dark:border-white/10 sm:p-8">
        <h1 className="font-serif text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink/75">{t('subtitle')}</p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 flex flex-col gap-4"
        >
          <FormField label={t('newPassword')} error={errors.password}>
            <PasswordInputWithToggle
              {...register('password')}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              inputClassName={fieldCls(!!errors.password)}
              showLabel={t('showPassword')}
              hideLabel={t('hidePassword')}
            />
          </FormField>

          <FormField
            label={t('confirmPassword')}
            error={errors.confirmPassword}
          >
            <PasswordInputWithToggle
              {...register('confirmPassword')}
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              inputClassName={fieldCls(!!errors.confirmPassword)}
              showLabel={t('showPassword')}
              hideLabel={t('hidePassword')}
            />
          </FormField>

          <Button type="submit" loading={isSubmitting}>
            {t('resetPassword')}
          </Button>
        </form>
      </div>
    </main>
  );
}

function ResetFallback() {
  const t = useTranslations('ResetPassword');
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t('title')}…</span>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
