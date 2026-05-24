import { test, expect } from "@playwright/test";
import {
  loginAndGetToken,
  withApiContext,
  workerCredentials,
} from "./helpers/e2e-api";

test("unauthenticated submissions redirects to login with next, then returns after login", async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("folio_token");
      window.sessionStorage.removeItem("folio_token");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/en/submissions");
  await expect(page).toHaveURL(/\/en\/login\?next=/, { timeout: 15_000 });
  const u = new URL(page.url());
  expect(u.searchParams.get("next")).toBe("/submissions");

  const creds = workerCredentials(0);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/submissions(\?|$)/, { timeout: 30_000 });
});

test("logout in one tab redirects other tab off dashboard", async ({
  browser,
}) => {
  const token = await withApiContext(async (api) =>
    loginAndGetToken(api, workerCredentials(0)),
  );
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  await page1.addInitScript((t: string) => {
    window.localStorage.setItem("folio_token", t);
  }, token);
  await page2.addInitScript((t: string) => {
    window.localStorage.setItem("folio_token", t);
  }, token);

  await page1.goto("/en/dashboard");
  await page2.goto("/en/dashboard");
  await expect(page1.getByRole("button", { name: /log out/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page2.getByRole("button", { name: /log out/i })).toBeVisible({
    timeout: 30_000,
  });

  await page1.getByRole("button", { name: /log out/i }).click();
  await page1.getByRole("button", { name: "Sign out" }).click();
  await expect(page1).toHaveURL(/\/en\/login/);

  await expect(page2).toHaveURL(/\/en\/login/, { timeout: 15_000 });

  await context.close();
});
