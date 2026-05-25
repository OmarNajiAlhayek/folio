"use client";

import { toast as sonnerToast } from "sonner";
import {
  DEFAULT_API_ERROR_MESSAGES,
  resolveApiErrorMessage,
  type ApiErrorMessageBundle,
} from "@/lib/api-error-message";

export { toast } from "sonner";

export type ToastApiErrorOptions = {
  id?: string;
  messages?: ApiErrorMessageBundle;
};

export function toastApiError(
  err: unknown,
  fallback: string,
  options?: ToastApiErrorOptions,
): void {
  const message = resolveApiErrorMessage(
    err,
    fallback,
    options?.messages ?? DEFAULT_API_ERROR_MESSAGES,
  );
  if (options?.id) {
    sonnerToast.error(message, { id: options.id });
  } else {
    sonnerToast.error(message);
  }
}
