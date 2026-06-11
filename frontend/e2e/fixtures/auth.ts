import { test as base } from '@playwright/test';
import {
  ensureUserExists,
  loginAndGetToken,
  loginStorageState,
  withApiContext,
  workerCredentials,
} from '../helpers/e2e-api';

type AuthFixtures = {
  authToken: string;
};

export const test = base.extend<object, AuthFixtures>({
  authToken: [
    async ({}, use, testInfo) => {
      const creds = workerCredentials(testInfo.parallelIndex);
      const token = await withApiContext(async (api) => {
        await ensureUserExists(api, creds);
        return loginAndGetToken(api, creds);
      });
      await use(token);
    },
    { scope: 'worker' },
  ],
  page: async ({ page }, runWithPage, testInfo) => {
    const creds = workerCredentials(testInfo.parallelIndex);
    const state = await loginStorageState(creds);
    await page.context().addCookies(state.cookies);
    await runWithPage(page);
  },
});

export { expect } from '@playwright/test';
