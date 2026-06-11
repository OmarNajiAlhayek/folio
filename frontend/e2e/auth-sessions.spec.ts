import { test, expect } from '@playwright/test';
import { request } from '@playwright/test';
import {
  apiV1Absolute,
  ensureUserExists,
  loginAndGetTokens,
  withApiContext,
  workerCredentials,
} from './helpers/e2e-api';

test('revoking one session leaves the other device signed in', async () => {
  const creds = workerCredentials(1);

  const deviceA = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
  const deviceB = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });

  try {
    await ensureUserExists(deviceA, creds);
    const sessionA = await loginAndGetTokens(deviceA, creds);
    const sessionB = await loginAndGetTokens(deviceB, creds);

    const sessionsRes = await deviceB.get(apiV1Absolute('auth/sessions'), {
      headers: { Authorization: `Bearer ${sessionB.accessToken}` },
    });
    expect(sessionsRes.ok()).toBeTruthy();
    const sessions = (await sessionsRes.json()) as Array<{
      id: string;
      isCurrent: boolean;
    }>;
    const remote = sessions.find((s) => !s.isCurrent);
    expect(remote?.id).toBeTruthy();

    const revokeRes = await deviceB.delete(
      apiV1Absolute(`auth/sessions/${remote!.id}`),
      {
        headers: { Authorization: `Bearer ${sessionB.accessToken}` },
      },
    );
    expect(revokeRes.ok()).toBeTruthy();

    const meA = await deviceA.get(apiV1Absolute('auth/me'), {
      headers: { Authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(meA.status()).toBe(401);

    const refreshA = await deviceA.post(apiV1Absolute('auth/refresh'));
    expect(refreshA.status()).toBe(401);

    const meB = await deviceB.get(apiV1Absolute('auth/me'), {
      headers: { Authorization: `Bearer ${sessionB.accessToken}` },
    });
    expect(meB.ok()).toBeTruthy();
  } finally {
    await deviceA.dispose();
    await deviceB.dispose();
  }
});

test('dashboard lists active sessions after cookie login', async ({ page }) => {
  const creds = workerCredentials(2);
  await withApiContext(async (api) => {
    await ensureUserExists(api, creds);
  });

  await page.goto('/en/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password', { exact: true }).fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });

  await expect(
    page.getByRole('heading', { name: 'Active sessions' }),
  ).toBeVisible();
  await expect(page.getByText('This device')).toBeVisible({ timeout: 15_000 });
});
