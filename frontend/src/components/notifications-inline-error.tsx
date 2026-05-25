"use client";

import { useTranslations } from "next-intl";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { cn } from "@/lib/utils";

type Props = {
  error: unknown;
  onRetry: () => void;
  className?: string;
};

/** Compact error + retry for notification bell panel and similar surfaces. */
export function NotificationsInlineError({
  error,
  onRetry,
  className,
}: Props) {
  const t = useTranslations("Notifications");
  const { resolve } = useApiErrorMessages();

  return (
    <div
      className={cn(
        "rounded-md border border-red-200 bg-red-50/80 px-3 py-3",
        className,
      )}
      role="alert"
    >
      <p className="text-sm text-red-900">
        {resolve(error, t("loadError"))}
      </p>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-red-900 underline hover:no-underline"
        onClick={onRetry}
      >
        {t("retryLoad")}
      </button>
    </div>
  );
}
