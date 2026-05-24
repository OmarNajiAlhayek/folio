"use client";

import { Toaster } from "sonner";

type Props = { locale: string };

/**
 * Toast stacking policy (single source of truth — do not duplicate in lib/toast.ts):
 * - visibleToasts={3}: at most three toasts visible at once (explicit; avoids silent default changes).
 * - Parallel identical API errors: pass a stable `id` via toastApiError(..., { id }) so Sonner
 *   replaces the same toast instead of flooding the stack.
 */
export function AppToaster({ locale }: Props) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    <Toaster
      dir={dir}
      visibleToasts={3}
      richColors
      closeButton
      position={dir === "rtl" ? "top-left" : "top-right"}
    />
  );
}
