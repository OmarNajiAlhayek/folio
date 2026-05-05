const TOKEN_KEY = "folio_token";

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5243";
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  /**
   * The full parsed response body (when JSON). Useful for endpoints that
   * return structured details alongside the human-readable message — e.g. the
   * Word Constructor submit endpoint returns
   * `{ message, code: 'CONSTRUCTOR_VALIDATION_FAILED', errors: [...] }`.
   * Always optional; existing callers continue to work unchanged.
   */
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code?: string,
    status?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  code?: string;
  status?: number;
}

export async function apiJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${getApiBase()}/api/v1${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data: { message?: string; code?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || res.statusText };
  }

  if (!res.ok) {
    throw new ApiError(
      typeof data.message === "string" ? data.message : res.statusText,
      data.code,
      res.status,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

export async function apiUpload(
  path: string,
  file: File,
  options?: { kind?: string },
): Promise<unknown> {
  const token = getStoredToken();
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const q =
    options?.kind != null && options.kind !== ""
      ? `?kind=${encodeURIComponent(options.kind)}`
      : "";

  const res = await fetch(`${getApiBase()}/api/v1${path}${q}`, {
    method: "POST",
    headers,
    body: form,
  });

  const text = await res.text();
  let data: { message?: string; code?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || res.statusText };
  }

  if (!res.ok) {
    throw new ApiError(
      typeof data.message === "string" ? data.message : res.statusText,
      data.code,
      res.status,
    );
  }
  return data;
}
