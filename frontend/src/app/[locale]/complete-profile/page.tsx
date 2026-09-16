'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { apiJson } from '@/lib/api';
import { isValidOrcidId } from '@/lib/orcid';
import { useMe } from '@/lib/queries/auth';
import { queryKeys } from '@/lib/query-keys';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { OrcidButton, OrcidDivider } from '@/components/auth/orcid-button';

type CompleteProfileForm = {
  displayName: string;
  orcid: string;
  affiliation: string;
  reviewKeywords: string;
  willingToReview: boolean;
};

function fieldCls(err: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 ${
    err ? 'border-red-400' : 'border-ink/15 dark:border-white/15'
  }`;
}

/**
 * Where `AuthGate` holds an account whose profile is incomplete: an ORCID
 * sign-up still carrying its placeholder name, or any account without an ORCID
 * iD, which every participant must have.
 */
export default function CompleteProfilePage() {
  const t = useTranslations('CompleteProfile');
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const me = meQuery.data;
  const showApiError = useToastApiError();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompleteProfileForm>({
    defaultValues: {
      displayName: '',
      orcid: '',
      affiliation: '',
      reviewKeywords: '',
      willingToReview: false,
    },
  });

  const needsOrcid = !me?.orcid;

  useEffect(() => {
    if (!me) return;
    reset({
      displayName: me.displayName.startsWith('ORCID ') ? '' : me.displayName,
      orcid: me.orcid ?? '',
      affiliation: me.affiliation ?? '',
      reviewKeywords: me.reviewKeywords ?? '',
      willingToReview: me.willingToReview,
    });
  }, [me, reset]);

  useEffect(() => {
    if (meQuery.isLoading) return;
    if (!me) {
      router.replace('/login');
      return;
    }
    if (me.profileComplete) {
      router.replace('/dashboard');
    }
  }, [me, meQuery.isLoading, router]);

  async function onSubmit(data: CompleteProfileForm) {
    try {
      await apiJson('/auth/me/researcher-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: data.displayName.trim(),
          ...(needsOrcid ? { orcid: data.orcid.trim().toUpperCase() } : {}),
          affiliation: data.affiliation.trim() || null,
          reviewKeywords: data.reviewKeywords.trim() || null,
          willingToReview: data.willingToReview,
        }),
      });
      // AuthGate reads `profileComplete` from this query; a stale copy would
      // send the user straight back here.
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      showApiError(err, t('saveFailed'));
    }
  }

  if (meQuery.isLoading || !me || me.profileComplete) {
    return (
      <main className={PAGE_SHELL}>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="md" className="border-ink/20 border-t-accent" />
        </div>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      <div className="mx-auto max-w-lg rounded-2xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="font-serif text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink/70">{t('subtitle')}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <FormField label={t('displayName')} error={errors.displayName}>
            <input
              {...register('displayName', { required: true, minLength: 1 })}
              className={fieldCls(!!errors.displayName)}
              autoComplete="name"
            />
          </FormField>

          {needsOrcid ? (
            <div className="space-y-3 rounded-xl border border-[#A6CE39]/35 bg-[#A6CE39]/8 p-4">
              <p className="text-sm text-ink/80">{t('orcidRequiredNotice')}</p>
              <OrcidButton mode="link" className="w-full" />
              <OrcidDivider />
              <FormField
                label={t('orcid')}
                error={errors.orcid}
                hint={t('orcidHint')}
                required
              >
                <input
                  {...register('orcid', {
                    validate: (value) => {
                      const id = value.trim().toUpperCase();
                      if (id === '') return t('orcidRequired');
                      return isValidOrcidId(id) || t('orcidInvalid');
                    },
                  })}
                  dir="ltr"
                  placeholder="0000-0000-0000-0000"
                  className={`${fieldCls(!!errors.orcid)} font-mono`}
                />
              </FormField>
            </div>
          ) : null}

          <FormField label={t('affiliation')} hint={t('affiliationHint')}>
            <input
              {...register('affiliation')}
              className={fieldCls(false)}
              autoComplete="organization"
            />
          </FormField>

          <FormField label={t('reviewKeywords')} hint={t('reviewKeywordsHint')}>
            <textarea
              {...register('reviewKeywords')}
              rows={3}
              className={fieldCls(false)}
            />
          </FormField>

          <label className="flex items-start gap-3 text-sm text-ink/80">
            <input
              type="checkbox"
              {...register('willingToReview')}
              className="mt-1 size-4 rounded border-ink/20"
            />
            <span>{t('willingToReview')}</span>
          </label>

          <Button
            type="submit"
            loading={isSubmitting}
            className="w-full sm:w-auto"
          >
            {t('continue')}
          </Button>
        </form>
      </div>
    </main>
  );
}
