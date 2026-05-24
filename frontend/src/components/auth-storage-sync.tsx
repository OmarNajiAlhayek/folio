"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { getStoredToken } from "@/lib/api";
import { isPublicPathname, redirectToLogin } from "@/lib/auth-redirect";

const TOKEN_KEY = "folio_token";

/**
 * Sync auth state across browser tabs when `localStorage` changes in another tab.
 *
 * - `key === null`: another tab called `localStorage.clear()` — treat as logout.
 * - `folio_token` removed: treat as logout.
 * - `folio_token` set in another tab: **no-op** (do not `router.refresh()`). Tab A
 *   may hold in-flight forms; the user can navigate. Optional future: refresh only
 *   when pathname is `/login` or `/register`.
 *
 * Note: `storage` does **not** fire in the tab that performed `removeItem` / `clear`
 * (e.g. DevTools `localStorage.clear()` in *this* tab is expected to skip this listener).
 */
export function AuthStorageSync() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;

      const fullClear = e.key === null;
      const tokenTouched = e.key === TOKEN_KEY;
      if (!fullClear && !tokenTouched) return;

      if (getStoredToken()) return;

      if (isPublicPathname(pathname)) return;

      redirectToLogin(router, pathname);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [pathname, router]);

  return null;
}
