"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, ApiError } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { redirectToLogin } from "@/lib/auth-redirect";
import { canAccessPath } from "@/lib/route-permissions";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import type { MeProfile } from "@/lib/permissions";

type Props = { children: React.ReactNode };

type GateState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string; error: unknown };

/**
 * Client gate for cookie auth (Edge middleware cannot see session cookies).
 * Permission rules live in `@/lib/route-permissions`.
 */
export function PermissionRouteGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolve } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");
  const [gate, setGate] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setGate({ status: "loading" });
    apiJson<MeProfile>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        const set = new Set(me.permissions ?? []);
        if (!canAccessPath(set, pathname)) {
          router.replace("/dashboard");
          return;
        }
        setGate({ status: "ready" });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin(router, pathname);
          return;
        }
        setGate({
          status: "error",
          message: resolve(err, tApi("serverError")),
          error: err,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router, resolve, tApi]);

  if (gate.status === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-ink/70 sm:py-12">
        Loading…
      </div>
    );
  }

  if (gate.status === "error") {
    const kind = getApiErrorKind(gate.error);
    return (
      <ApiErrorState
        className="mx-auto max-w-lg px-4 py-10 sm:py-12"
        message={gate.message}
        hint={kind === "rateLimit" ? tApi("rateLimitHint") : undefined}
        error={gate.error}
        backHref="/dashboard"
        backLabel={tApi("goHome")}
        onRetry={() => router.refresh()}
        retryLabel={tApi("retry")}
      />
    );
  }

  return <>{children}</>;
}
