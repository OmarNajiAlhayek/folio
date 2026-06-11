'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import type { MeProfile } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PasswordInputWithToggle } from '@/components/password-input-with-toggle';
import { OrcidButton } from '@/components/auth/orcid-button';

type OrcidAccountCardProps = {
  me: MeProfile;
};

export function OrcidAccountCard({ me }: OrcidAccountCardProps) {
  const t = useTranslations('Orcid');
  const queryClient = useQueryClient();
  const showApiError = useToastApiError();
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function unlink() {
    setUnlinkBusy(true);
    try {
      await apiJson('/auth/orcid/unlink', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(t('unlinkSuccess'));
    } catch (err) {
      showApiError(err, t('unlinkFailed'));
    } finally {
      setUnlinkBusy(false);
    }
  }

  async function setAccountPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return;
    setPasswordBusy(true);
    try {
      await apiJson('/auth/me/password', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(t('passwordSetSuccess'));
    } catch (err) {
      showApiError(err, t('passwordSetFailed'));
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-sm"
      aria-labelledby="orcid-account-heading"
    >
      <h2
        id="orcid-account-heading"
        className="font-serif text-lg font-semibold text-ink"
      >
        {t('accountHeading')}
      </h2>
      <p className="mt-1 text-sm text-ink/65">{t('accountBlurb')}</p>

      <div className="mt-4 space-y-4">
        {me.orcidLinked && me.orcid ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#A6CE39]/30 bg-[#A6CE39]/8 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
                {t('linkedOrcid')}
              </p>
              <p className="mt-0.5 font-mono text-sm text-ink">{me.orcid}</p>
            </div>
            {me.hasPassword ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={unlinkBusy}
                onClick={() => void unlink()}
              >
                {t('unlink')}
              </Button>
            ) : (
              <p className="text-xs text-ink/60 max-w-xs">
                {t('unlinkNeedsPassword')}
              </p>
            )}
          </div>
        ) : (
          <OrcidButton mode="link" className="w-full sm:w-auto" />
        )}

        {!me.hasPassword && (
          <form
            onSubmit={setAccountPassword}
            className="space-y-3 border-t border-ink/8 pt-4"
          >
            <p className="text-sm text-ink/70">{t('setPasswordBlurb')}</p>
            <FormField label={t('newPassword')}>
              <PasswordInputWithToggle
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                inputClassName="w-full rounded-xl border border-ink/15 bg-paper/60 px-3 py-2.5 text-sm"
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            </FormField>
            <Button
              type="submit"
              size="sm"
              loading={passwordBusy}
              disabled={password.length < 8}
            >
              {t('setPassword')}
            </Button>
          </form>
        )}

        {!me.orcidLinked && me.orcid && (
          <p className="text-xs text-ink/55">{t('manualOrcidHint')}</p>
        )}
      </div>
    </section>
  );
}
