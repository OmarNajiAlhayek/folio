import { test, expect } from '@playwright/test';
import { workerCredentials } from './helpers/e2e-api';
import { navLogoutButton } from './helpers/waits';

test('logout cancel closes dialog', async ({ page }) => {
  const creds = workerCredentials(0);
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password', { exact: true }).fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/en\/login/, { timeout: 30_000 });

  await navLogoutButton(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
});
