import { test, expect } from '@playwright/test';
import {
  apiV1Absolute,
  ensureUserExists,
  loginAndGetTokens,
  withApiContext,
  workerCredentials,
} from './helpers/e2e-api';

test('POST /auth/refresh renews access for the same API cookie jar', async () => {
  const creds = workerCredentials(0);
  await withApiContext(async (api) => {
    await ensureUserExists(api, creds);
    const first = await loginAndGetTokens(api, creds);

    const meBefore = await api.get(apiV1Absolute('auth/me'), {
      headers: { Authorization: `Bearer ${first.accessToken}` },
    });
    expect(meBefore.ok()).toBeTruthy();

    const refreshRes = await api.post(apiV1Absolute('auth/refresh'));
    expect(refreshRes.ok()).toBeTruthy();
    const refreshed = (await refreshRes.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).toBeTruthy();
    expect(refreshed.accessToken).not.toBe(first.accessToken);

    const meAfter = await api.get(apiV1Absolute('auth/me'), {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    });
    expect(meAfter.ok()).toBeTruthy();
  });
});
