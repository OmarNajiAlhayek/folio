import { test, expect } from "@playwright/test";

/**
 * Opt-in UI smoke for `/editor/email-settings`.
 * Requires seeded editor (`npm run seed` in backend) or matching env overrides.
 *
 * Run: `E2E_EMAIL_ADMIN_UI=1 npm run test:e2e` from `frontend/`
 * Optional: `E2E_EDITOR_EMAIL`, `E2E_EDITOR_PASSWORD` (defaults: editor@folio.local / Editor123!)
 */
const runAdminUi =
  process.env.E2E_EMAIL_ADMIN_UI === "1" ||
  process.env.E2E_EMAIL_ADMIN_UI === "true";

const editorEmail =
  process.env.E2E_EDITOR_EMAIL ?? "editor@folio.local";
const editorPassword =
  process.env.E2E_EDITOR_PASSWORD ?? "Editor123!";

test.describe("Editor email settings (opt-in)", () => {
  test.beforeEach(() => {
    test.skip(
      !runAdminUi,
      "Set E2E_EMAIL_ADMIN_UI=1 with seeded editor (see backend seed / docs)",
    );
  });

  test("loads email settings after editor login", async ({ page }) => {
    await page.goto("/en/login");
    await page.locator('input[inputMode="email"]').fill(editorEmail);
    await page.locator('input[type="password"]').fill(editorPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });

    await page.goto("/en/editor/email-settings");
    await expect(
      page.getByRole("heading", { name: "Email templates & reminders" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Reminder policy" }),
    ).toBeVisible();
  });
});
