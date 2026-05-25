import { test, expect } from "@playwright/test";
import { workerCredentials } from "./helpers/e2e-api";

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/en\/login/, { timeout: 30_000 });
}

test("unauthenticated submissions redirects to login with next, then returns after login", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/en/submissions");
  await expect(page).toHaveURL(/\/en\/login\?next=/, { timeout: 15_000 });
  const u = new URL(page.url());
  expect(u.searchParams.get("next")).toBe("/submissions");

  const creds = workerCredentials(0);
  await signIn(page, creds.email, creds.password);
  await page.goto("/en/submissions");
  await expect(page).toHaveURL(/\/en\/submissions(\?|$)/, { timeout: 30_000 });
});

test("logout in one tab redirects other tab off dashboard", async ({
  browser,
}) => {
  const creds = workerCredentials(0);
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  await signIn(page1, creds.email, creds.password);
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
