import {
  ApiError,
  parseApiJsonBody,
  readResponseText,
  setApiUnauthorizedHandler,
} from "@/lib/api-response";

export { ApiError, setApiUnauthorizedHandler } from "@/lib/api-response";

const TOKEN_KEY = "folio_token";

/** REMOVE_BY: 2026-08-01 — delete sessionStorage migration branch in getStoredToken. */
function migrateSessionTokenToLocal(): void {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage.getItem(TOKEN_KEY)) {
      const legacy = window.sessionStorage.getItem(TOKEN_KEY);
      if (legacy) {
        window.localStorage.setItem(TOKEN_KEY, legacy);
        window.sessionStorage.removeItem(TOKEN_KEY);
      }
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5243";
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBase()}/api/v1${normalized}`;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  migrateSessionTokenToLocal();
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = authHeaders(options.headers);
  return fetch(apiUrl(path), { ...options, headers });
}

export async function apiJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = authHeaders(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), { ...options, headers });
  const text = await readResponseText(res);
  const data = parseApiJsonBody(res, text);
  return data as T;
}

export async function apiUpload(
  path: string,
  file: File,
  options?: { kind?: string; signal?: AbortSignal },
): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  const headers = authHeaders();

  const q =
    options?.kind != null && options.kind !== ""
      ? `?kind=${encodeURIComponent(options.kind)}`
      : "";

  const res = await fetch(`${apiUrl(path)}${q}`, {
    method: "POST",
    headers,
    body: form,
    signal: options?.signal,
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
  const headers = authHeaders(options.headers);
  headers.set("Content-Type", "application/json");

  const res = await fetch(apiUrl(path), {
    method: "POST",
    ...options,
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
}

/** Unauthenticated fetch for public routes (no Bearer token). */
export async function publicFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(apiUrl(path), options);
}
