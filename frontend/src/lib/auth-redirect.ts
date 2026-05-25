import { routing } from "@/i18n/routing";

const PLACEHOLDER_BASE = "https://placeholder.invalid";

import { normalizePathname } from "@/lib/route-permissions";

/** Locale-stripped pathnames that never require auth sync redirect to login. */
const PUBLIC_PATHNAMES = new Set(["/", "/login", "/register"]);

export function isPublicPathname(pathname: string): boolean {
  const norm = normalizePathname(pathname);
  if (PUBLIC_PATHNAMES.has(norm)) return true;
  if (norm === "/publications" || norm.startsWith("/publications/")) return true;
  return false;
}

export function requiresAuthPathname(pathname: string): boolean {
  return !isPublicPathname(pathname);
}

/**
 * Validates `next` query param for post-login redirect. Returns a locale-stripped
 * path like `/submissions?x=1#y`, or null if unsafe / disallowed.
 *
 * Security: single WHATWG URL parse — do not decodeURIComponent the full string first.
 */
export function sanitizeNextParam(raw: string | null): string | null {
  if (raw == null) return null;

  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 2048) return null;

  if (trimmed.startsWith("//")) return null;
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) return null;

  const pathEnd = trimmed.indexOf("?");
  const pathPortion = pathEnd === -1 ? trimmed : trimmed.slice(0, pathEnd);

  if (pathPortion.includes("\\")) return null;

  if (pathPortion.toLowerCase().includes("%2e")) return null;
  if (pathPortion.toLowerCase().includes("%2f")) return null;

  const segments = pathPortion.split("/");
  for (const seg of segments) {
    if (seg === "..") return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed, PLACEHOLDER_BASE);
  } catch {
    return null;
  }

  if (url.origin !== PLACEHOLDER_BASE) return null;

  if (url.pathname.startsWith("//")) return null;

  const pathOnly = url.pathname;
  if (pathOnly === "/login" || pathOnly === "/register") return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPathWithNext(nextPath: string | null): string {
  const safe = sanitizeNextParam(nextPath);
  if (!safe) return "/login";
  return `/login?next=${encodeURIComponent(safe)}`;
}

function localePrefixFromWindow(): string {
  if (typeof window === "undefined") return "";
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  const locales = routing.locales as readonly string[];
  return locales.includes(seg) ? `/${seg}` : `/${routing.defaultLocale}`;
}

/**
 * Sends the user to login, preserving `next` when appropriate.
 *
 * Uses a full navigation in the browser so redirects still work when
 * `next-intl`'s client `router.replace` does not update the document (e.g. some
 * App Router + client effect timings).
 */
export function redirectToLogin(
  router: { replace: (href: string) => void },
  pathnameWithoutLocale: string,
): void {
  if (typeof window !== "undefined") {
    const prefix = localePrefixFromWindow();
    if (pathnameWithoutLocale === "/login" || pathnameWithoutLocale === "/register") {
      window.location.assign(`${prefix}/login`);
      return;
    }
    window.location.assign(`${prefix}${loginPathWithNext(pathnameWithoutLocale)}`);
    return;
  }
  if (pathnameWithoutLocale === "/login" || pathnameWithoutLocale === "/register") {
    router.replace("/login");
    return;
  }
  router.replace(loginPathWithNext(pathnameWithoutLocale));
}
