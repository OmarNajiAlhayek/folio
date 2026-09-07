import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';
import { latestVerificationOtp } from './e2e-outbox';

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
  const fallback = 'http://127.0.0.1:5243/api/v1/';
  const raw = process.env.E2E_API_URL?.trim();
  if (!raw) return fallback;
  let base = raw.replace(/\/+$/, '');
  if (!/\/api\/v1$/i.test(base)) {
    base = `${base}/api/v1`;
  }
  return `${base}/`;
}

/** Absolute Nest URL; `path` must be like `auth/register` or `submissions` (no leading `/`). */
export function apiV1Absolute(path: string): string {
  const rel = path.replace(/^\/+/, '');
  return new URL(rel, getApiV1Base()).href;
}

export function workerCredentials(workerIndex: number): E2EUserCredentials {
  return {
    email: `e2e-worker-${workerIndex}@test.local`,
    password: 'WorkerPass123!',
    displayName: `E2E Worker ${workerIndex}`,
  };
}

/** Playwright context without `baseURL`; use {@link apiV1Absolute} for every Nest URL. */
export async function withApiContext<T>(
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const api = await request.newContext({
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  });
  try {
    return await fn(api);
  } finally {
    await api.dispose();
  }
}

async function verifyUserEmailIfNeeded(
  api: APIRequestContext,
  creds: E2EUserCredentials,
): Promise<void> {
  const { accessToken } = await loginAndGetTokens(api, creds);
  const meRes = await api.get(apiV1Absolute('auth/me'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok()) {
    throw new Error(
      `Failed to read profile for ${creds.email}: ${meRes.status()} ${await meRes.text()}`,
    );
  }
  const me = (await meRes.json()) as { emailVerified?: boolean };
  if (me.emailVerified === true) {
    return;
  }

  let otp: string | undefined;
  try {
    otp = await latestVerificationOtp(creds.email);
  } catch {
    otp = undefined;
  }

  if (!otp) {
    const sendRes = await api.post(apiV1Absolute('auth/verify-email/send'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!sendRes.ok() && sendRes.status() !== 429) {
      throw new Error(
        `Failed to send verification for ${creds.email}: ${sendRes.status()} ${await sendRes.text()}`,
      );
    }
    otp = await latestVerificationOtp(creds.email);
  }
  const verifyRes = await api.post(apiV1Absolute('auth/verify-email'), {
    data: { code: otp },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!verifyRes.ok()) {
    throw new Error(
      `Failed to verify email for ${creds.email}: ${verifyRes.status()} ${await verifyRes.text()}`,
    );
  }
}

export async function ensureUserExists(
  api: APIRequestContext,
  creds: E2EUserCredentials,
): Promise<void> {
  const res = await api.post(apiV1Absolute('auth/register'), {
    data: {
      email: creds.email,
      password: creds.password,
      displayName: creds.displayName,
      willingToReview: false,
    },
  });
  if (res.ok() || res.status() === 409 || res.status() === 429) {
    await verifyUserEmailIfNeeded(api, creds);
    return;
  }
  throw new Error(
    `Failed to ensure test user ${creds.email}: ${res.status()} ${await res.text()}`,
  );
}

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export async function loginAndGetTokens(
  api: APIRequestContext,
  creds: E2EUserCredentials,
): Promise<AuthTokens> {
  const res = await api.post(apiV1Absolute('auth/login'), {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed login for ${creds.email}: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  if (!body.accessToken || !body.refreshToken) {
    throw new Error(
      `Missing accessToken/refreshToken in login response for ${creds.email} (set AUTH_RETURN_BEARER=true on backend for E2E)`,
    );
  }
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

export async function loginAndGetToken(
  api: APIRequestContext,
  creds: E2EUserCredentials,
): Promise<string> {
  const tokens = await loginAndGetTokens(api, creds);
  return tokens.accessToken;
}

/** Cookie jar after login — inject into a browser context via `addCookies`. */
export async function loginStorageState(creds: E2EUserCredentials) {
  const api = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
  try {
    await ensureUserExists(api, creds);
    const res = await api.post(apiV1Absolute('auth/login'), {
      data: { email: creds.email, password: creds.password },
    });
    if (!res.ok()) {
      throw new Error(
        `Failed login for ${creds.email}: ${res.status()} ${await res.text()}`,
      );
    }
    return api.storageState();
  } finally {
    await api.dispose();
  }
}

export function uniqueSubmissionTitle(prefix: string): string {
  const u =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix} ${u}`;
}

/**
 * Journals accepting submissions. `journalId` is required on create since
 * slice 6, and specs that do not care which journal simply take the first.
 */
export async function firstJournalId(
  api: APIRequestContext,
  token: string,
): Promise<string> {
  const res = await api.get(apiV1Absolute('submissions/journal-options'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to list journals: ${res.status()}`);
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  if (rows.length === 0) {
    throw new Error('No journals seeded; run `npm run seed:fresh`');
  }
  return rows[0].id;
}

export async function createSubmission(
  api: APIRequestContext,
  token: string,
  payload: { title: string; abstract: string; journalId?: string },
): Promise<{ slug: string }> {
  const journalId = payload.journalId ?? (await firstJournalId(api, token));
  const res = await api.post(apiV1Absolute('submissions'), {
    data: { ...payload, journalId },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok()) {
    throw new Error(`Failed create submission: ${res.status()} ${text}`);
  }
  try {
    return JSON.parse(text) as { slug: string };
  } catch {
    throw new Error(
      `Expected JSON from POST submissions, got: ${text.slice(0, 240)}`,
    );
  }
}

const E2E_FIXTURE_DOCX = join(
  process.cwd(),
  'e2e',
  'fixtures',
  'minimal-import.docx',
);

export async function uploadManuscriptFile(
  api: APIRequestContext,
  token: string,
  slug: string,
  filePath: string = E2E_FIXTURE_DOCX,
): Promise<void> {
  const buffer = readFileSync(filePath);
  const res = await api.post(
    apiV1Absolute(`submissions/${encodeURIComponent(slug)}/files`),
    {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'minimal-import.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer,
        },
        kind: 'manuscript',
      },
    },
  );
  if (!res.ok()) {
    throw new Error(
      `Failed upload manuscript for ${slug}: ${res.status()} ${await res.text()}`,
    );
  }
}
