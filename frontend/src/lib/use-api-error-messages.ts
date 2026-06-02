"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  apiErrorBundleFromTranslations,
  resolveApiErrorMessage,
  type ApiErrorMessageBundle,
} from "@/lib/api-error-message";
import {
  SUBMISSION_API_ERROR_CODES,
  submissionApiErrorMessageKey,
} from "@/lib/submission-api-error-codes";

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
  const t = useTranslations("ApiErrors");
  const tSubmission = useTranslations("SubmissionWorkflow");
  const messages = useMemo(
    () => apiErrorBundleFromTranslations(t),
    [t],
  );
  const codeMessages = useMemo(
    () => submissionCodeMessagesFromTranslations(tSubmission),
    [tSubmission],
  );

  const resolve = useCallback(
    (err: unknown, fallback: string) =>
      resolveApiErrorMessage(err, fallback, messages, codeMessages),
    [messages, codeMessages],
  );

  return { messages, resolve, codeMessages };
}

export type { ApiErrorMessageBundle };
