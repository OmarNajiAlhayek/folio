'use client';

import { Suspense, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { apiJson } from '@/lib/api';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { forgotPasswordSchema, translatedZodResolver } from '@/lib/validation';
import { toast } from 'sonner';

function inputCls(err: boolean) {
  return `w-full rounded-xl border ps-10 pe-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20 ${
    err
      ? 'border-red-400 focus:border-red-400 focus:ring-red-500/15'
      : 'border-ink/15 dark:border-white/15'
  }`;
}

type ForgotFormData = { email: string };

function ForgotPasswordForm() {
  const t = useTranslations('ForgotPassword');
  const tv = useTranslations('Validation');
  const showApiError = useToastApiError();
  const resolver = useMemo(
    () => translatedZodResolver(forgotPasswordSchema, tv),
    [tv],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({
    resolver,
    defaultValues: { email: '' },
  });

  async function onSubmit(data: ForgotFormData) {
    try {
      await apiJson('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast.success(t('sentMessage'), { id: 'forgot-sent' });
    } catch (err) {
      showApiError(err, t('sendFailed'), { id: 'forgot-failed' });
    }
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
          <FormField
            label={t('email')}
            error={errors.email}
            icon={
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            }
          >
            <input
              {...register('email')}
              type="text"
              inputMode="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              className={inputCls(!!errors.email)}
            />
          </FormField>

          <Button type="submit" loading={isSubmitting}>
            {t('sendLink')}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink/75">
          <Link
            href="/login"
            className="font-semibold text-accent hover:underline"
          >
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </main>
  );
}

function ForgotFallback() {
  const t = useTranslations('ForgotPassword');
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t('title')}…</span>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotFallback />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
