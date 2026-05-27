"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ApiErrorState } from "@/components/api-error-state";
import { AuthGateFallback } from "@/components/auth-gate-fallback";
import { getApiErrorKind } from "@/lib/api-error-message";
import { canAccessPath } from "@/lib/route-permissions";
import { useMe } from "@/lib/queries/auth";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";

type Props = { children: React.ReactNode };

/**
 * Client gate for permission checks (auth is handled by {@link AuthGate}).
 * Permission rules live in `@/lib/route-permissions`.
 */
export function PermissionRouteGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const { resolve } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");
  const tCommon = useTranslations("Common");

  useEffect(() => {
    if (!me.isSuccess || !me.data) return;
    const set = new Set(me.data.permissions ?? []);
    if (!canAccessPath(set, pathname)) {
      router.replace("/dashboard");
    }
  }, [me.isSuccess, me.data, pathname, router]);

  if (me.isPending && !me.isSuccess) {
    return <AuthGateFallback label={tCommon("loading")} />;
  }

  if (me.isError) {
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

  const set = new Set(me.data.permissions ?? []);
  if (!canAccessPath(set, pathname)) {
    return null;
  }

  return <>{children}</>;
}
