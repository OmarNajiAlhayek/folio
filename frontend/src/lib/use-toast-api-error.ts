"use client";

import { useCallback } from "react";
import { toastApiError, type ToastApiErrorOptions } from "@/lib/toast";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";

/** Toast helper with translated API error mapping (429, 404, …). */
export function useToastApiError() {
  const { messages } = useApiErrorMessages();

  return useCallback(
    (err: unknown, fallback: string, options?: ToastApiErrorOptions) => {
      toastApiError(err, fallback, { ...options, messages });
    },
    [messages],
  );
}
