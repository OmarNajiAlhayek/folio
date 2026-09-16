import { test, expect } from '@playwright/test';
import { workerCredentials } from './helpers/e2e-api';
import { orcidForSeed } from './helpers/e2e-orcid';
import { latestVerificationOtp } from './helpers/e2e-outbox';

test.describe('auth email flows', () => {
  test('register then verify email via OTP on verify-email page', async ({
    page,
  }) => {
    const email = `verify-otp-ui-${Date.now()}@test.local`;
    await page.goto('/en/register');
    await page.getByLabel('Display name').fill('Verify OTP UI');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password (min 8)').fill('WorkerPass123!');
    await page.getByLabel('ORCID iD').fill(orcidForSeed(email));
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/verify-email/, { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: /verify your email/i }),
    ).toBeVisible();

    const otp = await latestVerificationOtp(email);
    await page.getByLabel('Verification code').fill(otp);
    await page.getByRole('button', { name: 'Verify email' }).click();

    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(/verify your email to submit/i)).toHaveCount(0);
  });

  test('register redirects to verify-email page', async ({ page }) => {
    const email = `verify-ui-${Date.now()}@test.local`;
    await page.goto('/en/register');
    await page.getByLabel('Display name').fill('Verify UI');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password (min 8)').fill('WorkerPass123!');
    await page.getByLabel('ORCID iD').fill(orcidForSeed(email));
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/verify-email/, { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: /verify your email/i }),
    ).toBeVisible();
  });

  test('login page links to forgot password', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/en\/forgot-password/);
    await expect(
      page.getByRole('heading', { name: /reset your password/i }),
    ).toBeVisible();
  });

  test('verified worker user sees dashboard without verify banner', async ({
    page,
  }) => {
    const { email, password } = workerCredentials(0);
    await page.goto('/en/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(/verify your email to submit/i)).toHaveCount(0);
  });
});
