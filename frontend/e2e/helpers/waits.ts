import type { Page, Response } from '@playwright/test';

/** Nav bar logout — not per-session "Log out" buttons on the dashboard. */
export function navLogoutButton(page: Page) {
  return page
    .getByRole('banner')
    .getByRole('button', { name: 'Log out', exact: true });
}

function isSuccessfulAutosaveResponse(response: Response): boolean {
  if (response.request().method() !== 'PATCH') return false;
  if (response.status() !== 200) return false;
  return /\/api\/v1\/submissions\/[^/?]+$/.test(response.url());
}

export async function waitForAutosave(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    isSuccessfulAutosaveResponse(response),
  );
}
