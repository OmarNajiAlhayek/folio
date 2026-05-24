import { request, type APIRequestContext } from "@playwright/test";

export interface E2EUserCredentials {
  email: string;
  password: string;
  displayName: string;
}

/**
 * Base URL for Playwright `request` contexts. **Must end with `/api/v1/`**
 * (trailing slash) so paths like `auth/register` resolve under `/api/v1/`.
 * A leading `/` on the request path (e.g. `/auth/register`) would replace the
 * entire path per RFC 3986 and drop `api/v1`, producing 404 on Nest.
 */
export function getApiV1Base(): string {
  const fallback = "http://127.0.0.1:5243/api/v1/";
  const raw = process.env.E2E_API_URL?.trim();
  if (!raw) return fallback;
  let base = raw.replace(/\/+$/, "");
  if (!/\/api\/v1$/i.test(base)) {
    base = `${base}/api/v1`;
  }
  return `${base}/`;
}

/** Absolute Nest URL; `path` must be like `auth/register` or `submissions` (no leading `/`). */
export function apiV1Absolute(path: string): string {
  const rel = path.replace(/^\/+/, "");
  return new URL(rel, getApiV1Base()).href;
}

export function workerCredentials(workerIndex: number): E2EUserCredentials {
  return {
    email: `e2e-worker-${workerIndex}@test.local`,
    password: "WorkerPass123!",
    displayName: `E2E Worker ${workerIndex}`,
  };
}

/** Playwright context without `baseURL`; use {@link apiV1Absolute} for every Nest URL. */
export async function withApiContext<T>(
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const api = await request.newContext({
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  });
  try {
    return await fn(api);
  } finally {
    await api.dispose();
  }
}

export async function ensureUserExists(
  api: APIRequestContext,
  creds: E2EUserCredentials,
): Promise<void> {
  const res = await api.post(apiV1Absolute("auth/register"), {
    data: {
      email: creds.email,
      password: creds.password,
      displayName: creds.displayName,
      willingToReview: false,
    },
  });
  if (res.ok()) return;
  if (res.status() !== 409) {
    throw new Error(
      `Failed to ensure test user ${creds.email}: ${res.status()} ${await res.text()}`,
    );
  }
}

export async function loginAndGetToken(
  api: APIRequestContext,
  creds: E2EUserCredentials,
): Promise<string> {
  const res = await api.post(apiV1Absolute("auth/login"), {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed login for ${creds.email}: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new Error(`Missing accessToken in login response for ${creds.email}`);
  }
  return body.accessToken;
}

export function uniqueSubmissionTitle(prefix: string): string {
  const u =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix} ${u}`;
}

export async function createSubmission(
  api: APIRequestContext,
  token: string,
  payload: { title: string; abstract: string },
): Promise<{ slug: string }> {
  const res = await api.post(apiV1Absolute("submissions"), {
    data: payload,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok()) {
    throw new Error(
      `Failed create submission: ${res.status()} ${text}`,
    );
  }
  try {
    return JSON.parse(text) as { slug: string };
  } catch {
    throw new Error(
      `Expected JSON from POST submissions, got: ${text.slice(0, 240)}`,
    );
  }
}
