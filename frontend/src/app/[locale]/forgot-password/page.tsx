'use client';

import { Suspense, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { Mail } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema, translatedZodResolver } from '@/lib/validation';
import { toast } from 'sonner';

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
            icon={<Mail className="size-4" aria-hidden />}
          >
            <Input
              {...register('email')}
              type="text"
              inputMode="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              error={!!errors.email}
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
