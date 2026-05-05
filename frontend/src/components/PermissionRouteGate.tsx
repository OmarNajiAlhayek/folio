"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
import { canAccessPath } from "@/lib/route-permissions";
import type { MeProfile } from "@/lib/permissions";

type Props = { children: React.ReactNode };

/**
 * Client gate when the token lives in sessionStorage (Edge middleware cannot see it).
 */
export function PermissionRouteGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    apiJson<MeProfile>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        const set = new Set(me.permissions ?? []);
        if (!canAccessPath(set, pathname)) {
          router.replace("/dashboard");
          return;
        }
        setOk(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        router.replace("/dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ok) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-ink/70 sm:py-12">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
