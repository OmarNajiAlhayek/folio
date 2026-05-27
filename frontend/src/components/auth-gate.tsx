"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { AuthGateFallback } from "@/components/auth-gate-fallback";
import { getApiErrorKind } from "@/lib/api-error-message";
import { redirectToLogin } from "@/lib/auth-redirect";
import { useMe } from "@/lib/queries/auth";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";

type Props = { children: React.ReactNode };

/**
 * Withholds children until `/auth/me` succeeds. Cookie auth cannot be checked at the Edge.
 */
export function AuthGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const { resolve } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");
  const tCommon = useTranslations("Common");

  useEffect(() => {
    if (me.isPending) return;
    if (me.isError) {
      if (me.error instanceof ApiError && me.error.status === 401) {
        redirectToLogin(router, pathname);
      }
      return;
    }
    if (!me.data) {
      redirectToLogin(router, pathname);
    }
  }, [me.isPending, me.isError, me.error, me.data, router, pathname]);

  if (me.isPending && !me.isSuccess) {
    return <AuthGateFallback label={tCommon("loading")} />;
  }

  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return null;
    }
    const kind = getApiErrorKind(me.error);
    return (
      <ApiErrorState
        className="mx-auto max-w-lg px-4 py-10 sm:py-12"
        message={resolve(me.error, tApi("serverError"))}
        hint={kind === "rateLimit" ? tApi("rateLimitHint") : undefined}
        error={me.error}
        backHref="/dashboard"
        backLabel={tApi("goHome")}
        onRetry={() => void me.refetch()}
        retryLabel={tApi("retry")}
      />
    );
  }

  if (!me.data) {
    return null;
  }

  return <>{children}</>;
}
