'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  apiErrorBundleFromTranslations,
  resolveApiErrorMessage,
  type ApiErrorMessageBundle,
} from '@/lib/api-error-message';
import {
  SUBMISSION_API_ERROR_CODES,
  submissionApiErrorMessageKey,
} from '@/lib/submission-api-error-codes';

function submissionCodeMessagesFromTranslations(
  t: (key: ReturnType<typeof submissionApiErrorMessageKey>) => string,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const code of SUBMISSION_API_ERROR_CODES) {
    map[code] = t(submissionApiErrorMessageKey(code));
  }
  return map;
}

/** Translated API error strings + `resolve(err, fallback)`. */
export function useApiErrorMessages() {
  const t = useTranslations('ApiErrors');
  const tSubmission = useTranslations('SubmissionWorkflow');
  const messages = useMemo(() => apiErrorBundleFromTranslations(t), [t]);
  const codeMessages = useMemo(
    () => ({
      ...submissionCodeMessagesFromTranslations(tSubmission),
      // Raised by role and journal-scope checks on many screens; the API's own
      // English text would otherwise show in an Arabic interface.
      JOURNAL_OUT_OF_SCOPE: t('journalOutOfScope'),
      SELF_ROLE_ELEVATION: t('selfRoleElevation'),
      INVITATION_EXPIRED: t('invitationExpired'),
    }),
    [tSubmission, t],
  );

  const resolve = useCallback(
    (err: unknown, fallback: string) =>
      resolveApiErrorMessage(err, fallback, messages, codeMessages),
    [messages, codeMessages],
  );

  return { messages, resolve, codeMessages };
}

export type { ApiErrorMessageBundle };
