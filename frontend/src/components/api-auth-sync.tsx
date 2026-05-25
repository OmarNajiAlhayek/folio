"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setApiUnauthorizedHandler } from "@/lib/api";
import { isPublicPathname, redirectToLogin } from "@/lib/auth-redirect";

/**
 * Registers a global 401 handler so API helpers can redirect to login
 * without importing the router into `api.ts`.
 */
export function ApiAuthSync() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setApiUnauthorizedHandler(() => {
      if (isPublicPathname(pathname)) return;
      redirectToLogin(router, pathname);
    });
    return () => setApiUnauthorizedHandler(null);
  }, [pathname, router]);

  return null;
}
