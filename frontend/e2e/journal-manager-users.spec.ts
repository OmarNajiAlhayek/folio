import { test, expect } from "@playwright/test";

/**
 * Opt-in UI smoke for `/journal-manager/users`.
 * Requires seeded journal manager (`npm run seed` in backend).
 *
 * Run: `E2E_JM_USERS_UI=1 npm run test:e2e` from `frontend/`
 * Optional: `E2E_EDITOR_EMAIL`, `E2E_EDITOR_PASSWORD` (defaults: manager@folio.local / Manager123!)
 */
const runUsersUi =
  process.env.E2E_JM_USERS_UI === "1" ||
  process.env.E2E_JM_USERS_UI === "true";

const managerEmail =
  process.env.E2E_EDITOR_EMAIL ?? "manager@folio.local";
const managerPassword =
  process.env.E2E_EDITOR_PASSWORD ?? "Manager123!";

test.describe("Journal manager users (opt-in)", () => {
  test.beforeEach(() => {
    test.skip(
      !runUsersUi,
      "Set E2E_JM_USERS_UI=1 with seeded journal manager (see backend seed / docs)",
    );
  });

  test("loads user management and shows search results", async ({ page }) => {
    await page.goto("/en/login");
    await page.locator('input[inputMode="email"]').fill(managerEmail);
    await page.locator('input[type="password"]').fill(managerPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });

    await page.goto("/en/journal-manager/users");
    await expect(
      page.getByRole("heading", { name: "User management" }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Search users").fill("author@");
    await expect(
      page.getByText(/author@folio\.local/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
