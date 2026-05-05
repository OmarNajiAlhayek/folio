import { request, type APIRequestContext } from "@playwright/test";

export interface E2EUserCredentials {
  email: string;
  password: string;
  displayName: string;
}

export function getApiV1Base(): string {
  return process.env.E2E_API_URL ?? "http://127.0.0.1:5243/api/v1";
}

export function workerCredentials(workerIndex: number): E2EUserCredentials {
  return {
    email: `e2e-worker-${workerIndex}@test.local`,
    password: "WorkerPass123!",
    displayName: `E2E Worker ${workerIndex}`,
  };
}

export async function withApiContext<T>(
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const api = await request.newContext({
    baseURL: getApiV1Base(),
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
  const res = await api.post("/auth/register", {
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
  const res = await api.post("/auth/login", {
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

export async function createSubmission(
  api: APIRequestContext,
  token: string,
  payload: { title: string; abstract: string },
): Promise<{ slug: string }> {
  const res = await api.post("/submissions", {
    data: payload,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed create submission: ${res.status()} ${await res.text()}`,
    );
  }
  return (await res.json()) as { slug: string };
}
