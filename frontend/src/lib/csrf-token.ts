const CSRF_COOKIE = "folio_csrf";

/** Authoritative CSRF for `X-CSRF-Token` (avoids document.cookie / Set-Cookie races). */
let inMemoryCsrf: string | null = null;

export function setCsrfToken(token: string): void {
  inMemoryCsrf = token;
}

export function clearCsrfToken(): void {
  inMemoryCsrf = null;
}

function readCsrfFromDocumentCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`),
  );
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

/** Token to send as `X-CSRF-Token` (in-memory first, then cookie fallback). */
export function getCsrfToken(): string | null {
  return inMemoryCsrf ?? readCsrfFromDocumentCookie();
}

const CSRF_CAPTURE_PATHS = ["/auth/me", "/auth/login", "/auth/register"];

export function captureCsrfFromApiResponse(
  path: string,
  data: Record<string, unknown>,
): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    !CSRF_CAPTURE_PATHS.some(
      (p) => normalized === p || normalized.startsWith(`${p}/`),
    )
  ) {
    return;
  }
  if (typeof data.csrfToken === "string" && data.csrfToken.length > 0) {
    setCsrfToken(data.csrfToken);
  }
}
