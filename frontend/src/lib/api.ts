import { isCsrfApiError } from "@/lib/api-error-message";
import {
  ApiError,
  parseApiJsonBody,
  readResponseText,
  setApiUnauthorizedHandler,
} from "@/lib/api-response";
import {
  captureCsrfFromApiResponse,
  getCsrfToken,
} from "@/lib/csrf-token";

export { ApiError, setApiUnauthorizedHandler } from "@/lib/api-response";

const CSRF_HEADER = "X-CSRF-Token";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Pre-auth routes: backend skips CSRF; do not bootstrap via /auth/me before these. */
const CSRF_SKIP_API_PATHS = ["/auth/login", "/auth/register"];

function normalizeApiPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function needsCsrfForRequest(path: string, method: string): boolean {
  if (!MUTATING_METHODS.has(method)) return false;
  const p = normalizeApiPath(path);
  return !CSRF_SKIP_API_PATHS.some((skip) => p === skip || p.startsWith(`${skip}/`));
}

export function getApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw == null || raw.trim() === "") return "";
  return raw.replace(/\/+$/, "");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  if (base === "") return `/api/v1${normalized}`;
  return `${base}/api/v1${normalized}`;
}

let csrfBootstrapPromise: Promise<void> | null = null;

/** Sync in-memory CSRF from `GET /auth/me` response body (not document.cookie). */
async function fetchCsrfCookie(): Promise<void> {
  const res = await fetch(apiUrl("/auth/me"), {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 401) return;
  const text = await readResponseText(res);
  const data = parseApiJsonBody(res, text);
  captureCsrfFromApiResponse("/auth/me", data);
}

/**
 * Ensures a CSRF token is available before mutating requests.
 * `forceRefresh` always re-fetches `/auth/me` so header and cookie stay aligned.
 */
export async function ensureCsrfToken(forceRefresh = false): Promise<void> {
  if (!forceRefresh && getCsrfToken()) return;
  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetchCsrfCookie().finally(() => {
      csrfBootstrapPromise = null;
    });
  }
  await csrfBootstrapPromise;
}

async function withAuthFetchInitAsync(
  path: string,
  options: RequestInit = {},
): Promise<RequestInit> {
  const method = (options.method ?? "GET").toUpperCase();
  if (needsCsrfForRequest(path, method)) {
    await ensureCsrfToken();
  }
  return withAuthFetchInit(path, options);
}

function withAuthFetchInit(
  path: string,
  options: RequestInit = {},
): RequestInit {
  const headers = new Headers(options.headers);
  const method = (options.method ?? "GET").toUpperCase();
  if (needsCsrfForRequest(path, method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }
  return {
    ...options,
    headers,
    credentials: "include",
  };
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const init = await withAuthFetchInitAsync(path, options);
  return fetch(apiUrl(path), init);
}

export async function apiJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const init = await withAuthFetchInitAsync(path, options);
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), { ...init, headers });
  const text = await readResponseText(res);
  const data = parseApiJsonBody(res, text);
  captureCsrfFromApiResponse(path, data);
  return data as T;
}

export async function apiUpload(
  path: string,
  file: File,
  options?: { kind?: string; signal?: AbortSignal },
): Promise<unknown> {
  await ensureCsrfToken();
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  const csrf = getCsrfToken();
  if (csrf) headers.set(CSRF_HEADER, csrf);

  const q =
    options?.kind != null && options.kind !== ""
      ? `?kind=${encodeURIComponent(options.kind)}`
      : "";

  const res = await fetch(`${apiUrl(path)}${q}`, {
    method: "POST",
    headers,
    body: form,
    signal: options?.signal,
    credentials: "include",
  });

  const text = await readResponseText(res);
  return parseApiJsonBody(res, text);
}

export async function apiBlob(
  path: string,
  options: RequestInit = {},
): Promise<Blob> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const text = await readResponseText(res);
    parseApiJsonBody(res, text);
  }
  return res.blob();
}

export type ApiPostJsonOrBlobResult<T> =
  | { kind: "json"; data: T }
  | { kind: "blob"; data: Blob };

/**
 * POST JSON body; response is JSON (e.g. attach=true) or binary (download).
 */
export async function apiPostJsonOrBlob<T>(
  path: string,
  body: unknown,
  options: RequestInit = {},
): Promise<ApiPostJsonOrBlobResult<T>> {
  if (needsCsrfForRequest(path, "POST")) {
    await ensureCsrfToken(true);
  }

  const run = async (): Promise<ApiPostJsonOrBlobResult<T>> => {
    const init = await withAuthFetchInitAsync(path, options);
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    const csrf = getCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);

    const res = await fetch(apiUrl(path), {
      method: "POST",
      ...init,
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await readResponseText(res);
      parseApiJsonBody(res, text);
    }

    const contentType = res.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      const text = await readResponseText(res);
      const data = parseApiJsonBody(res, text) as T;
      return { kind: "json", data };
    }

    return { kind: "blob", data: await res.blob() };
  };

  try {
    return await run();
  } catch (err) {
    if (!isCsrfApiError(err)) throw err;
    await ensureCsrfToken(true);
    return run();
  }
}

/** Unauthenticated fetch for public routes. */
export async function publicFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(apiUrl(path), { ...options, credentials: "include" });
}
