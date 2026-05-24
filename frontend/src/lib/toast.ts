"use client";

import { toast as sonnerToast } from "sonner";
import { ApiError } from "@/lib/api";

export { toast } from "sonner";

export type ToastApiErrorOptions = { id?: string };

export function toastApiError(
  err: unknown,
  fallback: string,
  options?: ToastApiErrorOptions,
): void {
  const message =
    err instanceof ApiError && err.message.trim() !== ""
      ? err.message
      : fallback;
  if (options?.id) {
    sonnerToast.error(message, { id: options.id });
  } else {
    sonnerToast.error(message);
  }
}
