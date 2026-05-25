"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  apiErrorBundleFromTranslations,
  resolveApiErrorMessage,
  type ApiErrorMessageBundle,
} from "@/lib/api-error-message";

/** Translated API error strings + `resolve(err, fallback)`. */
export function useApiErrorMessages() {
  const t = useTranslations("ApiErrors");
  const messages = useMemo(
    () => apiErrorBundleFromTranslations(t),
    [t],
  );

  const resolve = useCallback(
    (err: unknown, fallback: string) =>
      resolveApiErrorMessage(err, fallback, messages),
    [messages],
  );

  return { messages, resolve };
}

export type { ApiErrorMessageBundle };
