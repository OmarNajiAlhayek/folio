"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import { useMe } from "@/lib/queries/auth";

/** Redirects to login when `/auth/me` fails or returns unauthenticated. */
export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();

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

  return me;
}
