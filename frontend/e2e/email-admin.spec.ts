import { test, expect } from "@playwright/test";

/**
 * Opt-in UI smoke for `/journal-manager/email-settings`.
 * Requires seeded journal manager (`npm run seed` in backend) or env overrides.
 *
 * Run: `E2E_EMAIL_ADMIN_UI=1 npm run test:e2e` from `frontend/`
 * Optional: `E2E_EDITOR_EMAIL`, `E2E_EDITOR_PASSWORD` (defaults: manager@folio.local / Manager123!)
 */
const runAdminUi =
  process.env.E2E_EMAIL_ADMIN_UI === "1" ||
  process.env.E2E_EMAIL_ADMIN_UI === "true";

const editorEmail =
  process.env.E2E_EDITOR_EMAIL ?? "manager@folio.local";
const editorPassword =
  process.env.E2E_EDITOR_PASSWORD ?? "Manager123!";

test.describe("Journal manager email settings (opt-in)", () => {
  test.beforeEach(() => {
    test.skip(
      !runAdminUi,
      "Set E2E_EMAIL_ADMIN_UI=1 with seeded journal manager (see backend seed / docs)",
    );
  });

  test("loads email settings after journal manager login", async ({ page }) => {
    await page.goto("/en/login");
    await page.locator('input[inputMode="email"]').fill(editorEmail);
    await page.locator('input[type="password"]').fill(editorPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });

    await page.goto("/en/journal-manager/email-settings");
    await expect(
      page.getByRole("heading", { name: "Email templates & reminders" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Reminder policy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Copyediting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Copyeditor assignment" }),
    ).toBeVisible();
  });
});
