import { test as base } from "@playwright/test";
import {
  ensureUserExists,
  loginAndGetToken,
  withApiContext,
  workerCredentials,
} from "../helpers/e2e-api";

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
    { scope: "worker" },
  ],
  page: async ({ page, authToken }, runWithPage) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("folio_token", token);
    }, authToken);
    await runWithPage(page);
  },
});

export { expect } from "@playwright/test";
