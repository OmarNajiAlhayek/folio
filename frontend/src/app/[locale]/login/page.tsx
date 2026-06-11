'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { apiJson } from '@/lib/api';
import { sanitizeNextParam } from '@/lib/auth-redirect';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { PasswordInputWithToggle } from '@/components/password-input-with-toggle';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { loginSchema, translatedZodResolver } from '@/lib/validation';
import { OrcidButton, OrcidDivider } from '@/components/auth/orcid-button';
import { parseOrcidAuthError } from '@/lib/orcid-auth';
import { toast } from '@/lib/toast';

function inputCls(err: boolean) {
  return `w-full rounded-xl border ps-10 pe-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20 ${
    err
      ? 'border-red-400 focus:border-red-400 focus:ring-red-500/15'
      : 'border-ink/15 dark:border-white/15'
  }`;
}

type LoginFormData = { email: string; password: string };

function LoginForm() {
  const t = useTranslations('Login');
  const tOrcid = useTranslations('Orcid');
  const tNav = useTranslations('Nav');
  const tv = useTranslations('Validation');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showApiError = useToastApiError();
  const resolver = useMemo(() => translatedZodResolver(loginSchema, tv), [tv]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver,
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const code = parseOrcidAuthError(searchParams.get('orcid_error'));
    if (!code) return;
    const key = `errors.${code}` as const;
    toast.error(tOrcid(key), { id: `orcid-error-${code}` });
  }, [searchParams, tOrcid]);

  async function onSubmit(data: LoginFormData) {
    try {
      await apiJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const next = sanitizeNextParam(searchParams.get('next'));
      router.push(next ?? '/dashboard');
      router.refresh();
    } catch (err) {
      showApiError(err, t('loginFailed'), { id: 'login-failed' });
    }
  }

  const isAr = locale === 'ar';

  return (
    <main className={PAGE_SHELL}>
      {/* Background Canvas Grid Texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.01]"
        style={{
          backgroundImage: `linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <div className="relative grid gap-8 md:grid-cols-12 md:items-start max-w-5xl mx-auto">
        {/* Left Column: Visual Presentation Column */}
        <div className="hidden flex-col gap-6 md:flex md:col-span-6 lg:col-span-7">
          <div>
            <span className="inline-flex items-center rounded-full bg-accent/8 dark:bg-accent/18 px-3.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {tNav('brand')}
            </span>
            <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {t('title')}
            </h1>
            <div
              className="h-1 w-16 bg-linear-to-r from-accent to-accent-2/60 mt-3"
              aria-hidden
            />
          </div>

          <p className="max-w-md text-sm leading-relaxed text-ink/75">
            {t('sideBlurb')}
          </p>

          {/* Interactive Feature list representing the system */}
          <div className="rounded-2xl border border-accent-2/15 bg-surface/65 backdrop-blur-md px-5 py-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-3.5">
              {isAr
                ? 'مميزات البوابة الأكاديمية'
                : 'Scholarly Portal Key Pillars'}
            </h3>
            <ul className="space-y-3.5 text-xs text-ink/70">
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                  1
                </span>
                <div>
                  <strong className="text-ink">
                    {isAr ? 'منشئ النصوص العلمي' : 'Word Constructor:'}
                  </strong>{' '}
                  {isAr
                    ? 'ابنِ بحثك ونسّقه تلقائياً قسماً بقسم.'
                    : 'Create formatted, journal-compliant drafts block-by-block.'}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  2
                </span>
                <div>
                  <strong className="text-ink">
                    {isAr ? 'تحكيم أقران معمي' : 'Double-Blind Review:'}
                  </strong>{' '}
                  {isAr
                    ? 'تدفقات عمل سرية وآمنة بالكامل لحفظ الرصانة العلمية.'
                    : 'Secure review queues and anonymized evaluation packages.'}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent font-bold">
                  3
                </span>
                <div>
                  <strong className="text-ink">
                    {isAr ? 'كتالوج النشر المفتوح' : 'Open Access Indexing:'}
                  </strong>{' '}
                  {isAr
                    ? 'فهرسة شاملة وأرشفة دائمة للمقالات المقبولة.'
                    : 'Stable links, indexing, and discoverability for published papers.'}
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Sleek Form Card */}
        <div className="md:col-span-6 lg:col-span-5 relative group rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)] backdrop-blur-md sm:p-8">
          <div className="flex flex-col md:hidden mb-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              {tNav('brand')}
            </span>
            <h1 className="font-serif text-2xl font-bold text-ink">
              {t('title')}
            </h1>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
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

            <FormField
              label={t('password')}
              error={errors.password}
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
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              }
            >
              <PasswordInputWithToggle
                {...register('password')}
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                inputClassName={inputCls(!!errors.password)}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            </FormField>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-accent hover:underline decoration-offset-2"
              >
                {t('forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              aria-label={isSubmitting ? t('signingIn') : undefined}
              className="mt-1 min-w-[7rem]"
            >
              {t('signIn')}
            </Button>

            <OrcidDivider />
            <OrcidButton
              mode="login"
              next={sanitizeNextParam(searchParams.get('next')) ?? undefined}
              className="w-full"
            />
          </form>

          {/* Registration Redirect Link */}
          <div className="mt-6 pt-5 border-t border-ink/[0.08] dark:border-white/[0.08] text-center text-sm text-ink/75">
            {t('noAccount')}{' '}
            <Link
              href="/register"
              className="font-semibold text-accent hover:underline decoration-offset-2"
            >
              {t('registerLink')}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoginFallback() {
  const t = useTranslations('Login');
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t('title')}…</span>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
