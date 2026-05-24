import type { Page } from "@playwright/test";

/** Hides Next.js dev `nextjs-portal` overlays that block clicks (internal devtools bugs). */
export async function hideNextJsDevPortals(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
  });
}
