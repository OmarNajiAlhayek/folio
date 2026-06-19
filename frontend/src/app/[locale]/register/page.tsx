'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Controller, useForm } from 'react-hook-form';
import { Building2, Lock, Mail, User } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { sanitizeNextParam } from '@/lib/auth-redirect';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { PasswordInputWithToggle } from '@/components/password-input-with-toggle';
import { notifyKeywordAddFailure } from '@/components/submission-keyword-suggest';
import { KeywordTagsInput } from '@/components/ui/keyword-tags-input';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input, inputFieldClass } from '@/components/ui/input';
import { type KeywordAddFailure, serializeKeywords } from '@/lib/keywords';
import { type z } from 'zod';
import { registerSchema, translatedZodResolver } from '@/lib/validation';
import { OrcidButton, OrcidDivider } from '@/components/auth/orcid-button';

const REGISTER_KEYWORD_TOAST_ID = 'register-keyword-add';

type RegisterFormData = z.infer<typeof registerSchema>;

function RegisterForm() {
  const t = useTranslations('Register');
  const tMarketing = useTranslations('AuthMarketing');
  const tNav = useTranslations('Nav');
  const tv = useTranslations('Validation');
  const tWf = useTranslations('SubmissionWorkflow');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reviewKeywordTags, setReviewKeywordTags] = useState<string[]>([]);
  const [reviewKeywordDraft, setReviewKeywordDraft] = useState('');
  const showApiError = useToastApiError();

  const serializeReviewKeywords = useCallback(() => {
    const draft = reviewKeywordDraft.trim();
    if (!draft) return serializeKeywords(reviewKeywordTags);
    const lower = draft.toLowerCase();
    if (reviewKeywordTags.some((x) => x.toLowerCase() === lower)) {
      return serializeKeywords(reviewKeywordTags);
    }
    return serializeKeywords([...reviewKeywordTags, draft]);
  }, [reviewKeywordTags, reviewKeywordDraft]);

  const resolver = useMemo(
    () =>
      translatedZodResolver(registerSchema, tv, (values) => {
        const v = values as Record<string, unknown>;
        return {
          ...v,
          affiliation: v.affiliation === '' ? undefined : v.affiliation,
          orcid: v.orcid === '' ? undefined : v.orcid,
          reviewKeywords: serializeReviewKeywords(),
        };
      }),
    [tv, serializeReviewKeywords],
  );

  const {
    register,
    control,
    handleSubmit,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver,
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      willingToReview: false,
    },
  });

  const keywordAddMessages = useMemo(
    () => ({
      max: tWf('keywordSuggestMax'),
      duplicate: tWf('keywordSuggestDuplicate'),
      tooLong: tWf('keywordSuggestTooLong'),
      addAllNone: tWf('keywordSuggestAddAllNone'),
    }),
    [tWf],
  );

  const onReviewKeywordCommitFailure = useCallback(
    (failure: KeywordAddFailure) => {
      if (failure === 'max') return;
      notifyKeywordAddFailure(
        failure,
        keywordAddMessages,
        REGISTER_KEYWORD_TOAST_ID,
      );
    },
    [keywordAddMessages],
  );

  async function onSubmit(data: RegisterFormData) {
    try {
      const body: Record<string, unknown> = {
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        willingToReview: data.willingToReview ?? false,
      };
      if (data.affiliation) body.affiliation = data.affiliation;
      if (data.orcid) body.orcid = data.orcid;
      if (data.reviewKeywords) body.reviewKeywords = data.reviewKeywords;

      await apiJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(t('registrationSuccess'), { id: 'register-success' });
      const next = sanitizeNextParam(searchParams.get('next'));
      const verifyNext = next
        ? `/verify-email?next=${encodeURIComponent(next)}`
        : '/verify-email';
      router.push(verifyNext);
      router.refresh();
    } catch (err) {
      showApiError(err, t('registrationFailed'), { id: 'register-failed' });
    }
  }

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
        <div className="hidden flex-col gap-6 md:flex md:col-span-5 lg:col-span-6">
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

          <p className="max-w-md text-xs leading-relaxed text-ink/60 bg-ink/[0.02] dark:bg-white/[0.02] border border-ink/[0.06] dark:border-white/[0.06] rounded-2xl p-4">
            {t('hint')}
          </p>

          {/* Interactive Feature checklist to maintain cohesive visual with login page */}
          <div className="rounded-2xl border border-accent-2/15 bg-surface/65 backdrop-blur-md px-5 py-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-3.5">
              {tMarketing('pillarsHeading')}
            </h3>
            <ul className="space-y-3.5 text-xs text-ink/70">
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                  1
                </span>
                <div>
                  <strong className="text-ink">
                    {tMarketing('pillar1Title')}
                  </strong>{' '}
                  {tMarketing('pillar1Body')}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  2
                </span>
                <div>
                  <strong className="text-ink">
                    {tMarketing('pillar2Title')}
                  </strong>{' '}
                  {tMarketing('pillar2Body')}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent font-bold">
                  3
                </span>
                <div>
                  <strong className="text-ink">
                    {tMarketing('pillar3Title')}
                  </strong>{' '}
                  {tMarketing('pillar3Body')}
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Sleek Form Card */}
        <div className="md:col-span-7 lg:col-span-6 relative group rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)] backdrop-blur-md sm:p-8">
          <div className="flex flex-col md:hidden mb-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              {tNav('brand')}
            </span>
            <h1 className="font-serif text-2xl font-bold text-ink">
              {t('title')}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-ink/65 bg-ink/5 dark:bg-white/5 rounded-xl p-3">
              {t('hint')}
            </p>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {/* Section 1: Account Essentials */}
            <div>
              <h3 className="font-serif text-sm font-semibold text-accent mb-3.5 flex items-center gap-1.5 pb-1 border-b border-ink/[0.06] dark:border-white/[0.06]">
                <span className="text-accent">👤</span>
                {t('sectionCoreAccount')}
              </h3>
              <div className="space-y-3.5">
                <FormField
                  label={t('displayName')}
                  error={errors.displayName}
                  icon={<User className="size-4" aria-hidden />}
                >
                  <Input
                    {...register('displayName')}
                    autoComplete="name"
                    aria-invalid={!!errors.displayName}
                    error={!!errors.displayName}
                  />
                </FormField>

                <FormField
                  label={t('email')}
                  error={errors.email}
                  hint={t('emailInstitutionalHint')}
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

                <FormField
                  label={t('passwordMin')}
                  error={errors.password}
                  icon={<Lock className="size-4" aria-hidden />}
                >
                  <PasswordInputWithToggle
                    {...register('password')}
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    inputClassName={inputFieldClass(!!errors.password)}
                    showLabel={t('showPassword')}
                    hideLabel={t('hidePassword')}
                  />
                </FormField>
              </div>
            </div>

            {/* Section 2: Academic Profile Details */}
            <div className="mt-4 pt-4 border-t border-ink/[0.08] dark:border-white/[0.08]">
              <h3 className="font-serif text-sm font-semibold text-accent mb-3.5 flex items-center gap-1.5 pb-1 border-b border-ink/[0.06] dark:border-white/[0.06]">
                <span className="text-accent">🎓</span>
                {t('sectionAcademicProfile')}
              </h3>
              <div className="space-y-3.5">
                <FormField
                  label={t('affiliation')}
                  error={errors.affiliation}
                  icon={<Building2 className="size-4" aria-hidden />}
                >
                  <Input
                    {...register('affiliation')}
                    placeholder={t('affiliationPlaceholder')}
                    aria-invalid={!!errors.affiliation}
                    error={!!errors.affiliation}
                    extraCls="placeholder:text-ink/35"
                  />
                </FormField>

                <FormField
                  label={t('orcid')}
                  error={errors.orcid}
                  hint={t('orcidHint')}
                  icon={
                    <div className="flex size-4 items-center justify-center rounded-full bg-[#A6C307] text-[8px] font-bold tracking-tighter text-white">
                      iD
                    </div>
                  }
                >
                  <Input
                    {...register('orcid')}
                    placeholder="0000-0000-0000-0000"
                    aria-invalid={!!errors.orcid}
                    error={!!errors.orcid}
                    extraCls="font-mono text-sm placeholder:text-ink/35"
                  />
                </FormField>

                {/* Review interests (tag input) */}
                <div className="flex flex-col gap-1 text-sm">
                  <span
                    id="register-review-keywords-label"
                    className="font-semibold text-ink/85"
                  >
                    {t('reviewKeywords')}
                  </span>
                  <div
                    className={
                      errors.reviewKeywords
                        ? 'rounded-md ring-2 ring-red-400/80 ring-offset-1 ring-offset-surface'
                        : undefined
                    }
                  >
                    <KeywordTagsInput
                      tags={reviewKeywordTags}
                      onChange={(next) => {
                        setReviewKeywordTags(next);
                        clearErrors('reviewKeywords');
                      }}
                      inputValue={reviewKeywordDraft}
                      onInputChange={setReviewKeywordDraft}
                      placeholder={t('reviewKeywordsPlaceholder')}
                      id="register-review-keywords"
                      aria-labelledby="register-review-keywords-label"
                      aria-describedby="register-review-keywords-hint"
                      maxTags={50}
                      maxSerializedLength={2000}
                      locale={locale === 'ar' ? 'ar' : 'en'}
                      onCommitFailure={onReviewKeywordCommitFailure}
                    />
                  </div>
                  <span
                    id="register-review-keywords-hint"
                    className="text-[10px] text-ink/50 leading-tight"
                  >
                    {t('reviewKeywordsHint', {
                      count: reviewKeywordTags.length,
                    })}
                  </span>
                  {errors.reviewKeywords && (
                    <span className="text-xs text-red-600 mt-0.5">
                      {errors.reviewKeywords.message}
                    </span>
                  )}
                </div>

                <Controller
                  name="willingToReview"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      label={t('willingToReview')}
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              aria-label={isSubmitting ? t('creating') : undefined}
              className="mt-3 min-w-[7rem]"
            >
              {t('createAccount')}
            </Button>

            <OrcidDivider />
            <OrcidButton
              mode="login"
              next={sanitizeNextParam(searchParams.get('next')) ?? undefined}
              className="w-full"
            />
          </form>

          {/* Login Redirect Link */}
          <div className="mt-6 pt-5 border-t border-ink/[0.08] dark:border-white/[0.08] text-center text-sm text-ink/75">
            {t('hasAccount')}{' '}
            <Link
              href="/login"
              className="font-semibold text-accent hover:underline decoration-offset-2"
            >
              {t('loginLink')}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function RegisterFallback() {
  const t = useTranslations('Register');
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t('title')}…</span>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
