"use client";

import { Link } from "@/i18n/navigation";
import { getApiErrorKind } from "@/lib/api-error-message";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";
import { ApiError } from "@/lib/api-response";

type Props = {
  message: string;
  title?: string;
  /** Shown under the message for rate limits. */
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** When true, hides the retry button (e.g. rate limit). */
  disableRetry?: boolean;
  backHref?: string;
  backLabel?: string;
  error?: unknown;
  className?: string;
};

export function ApiErrorState({
  message,
  title,
  hint,
  onRetry,
  retryLabel,
  disableRetry = false,
  backHref,
  backLabel,
  error,
  className = PAGE_SHELL_NARROW,
}: Props) {
  const kind =
    error != null ? getApiErrorKind(error) : "generic";
  const isRateLimit = kind === "rateLimit";
  const isNotFound = kind === "notFound";

  const panelCls = isRateLimit
    ? "rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-amber-950"
    : isNotFound
      ? "rounded-xl border border-ink/15 bg-surface/80 px-4 py-4 text-ink"
      : "rounded-xl border border-red-200 bg-red-50/80 px-4 py-4 text-red-900";

  const showRetry =
    onRetry != null && retryLabel != null && !disableRetry && !isRateLimit;

  return (
    <main className={className}>
      {backHref && backLabel ? (
        <Link
          href={backHref}
          className="text-sm font-medium text-accent hover:underline"
        >
          {backLabel}
        </Link>
      ) : null}
      <div className={backHref ? "mt-6" : ""}>
        <div className={panelCls} role="alert">
          {title ? (
            <p className="font-serif text-lg font-semibold">{title}</p>
          ) : null}
          <p className={title ? "mt-2 text-sm leading-relaxed" : "text-sm leading-relaxed"}>
            {message}
          </p>
          {hint ? (
            <p className="mt-2 text-sm opacity-80">{hint}</p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {showRetry ? (
            <button
              type="button"
              className="rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5"
              onClick={onRetry}
            >
              {retryLabel}
            </button>
          ) : null}
          {isRateLimit && onRetry && retryLabel ? (
            <button
              type="button"
              className="rounded-lg border border-amber-300/80 bg-paper px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-50/80"
              onClick={onRetry}
            >
              {retryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Map query/load errors to `ApiErrorState` props. */
export function apiErrorFromUnknown(
  err: unknown,
  resolve: (err: unknown, fallback: string) => string,
  fallback: string,
): { message: string; error: unknown } {
  return {
    message: resolve(err, fallback),
    error: err,
  };
}

export function isApiErrorStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}
