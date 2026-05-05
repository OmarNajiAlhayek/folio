import type { FullConfig } from "@playwright/test";
import { ensureUserExists, withApiContext, workerCredentials } from "./helpers/e2e-api";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const workers =
    typeof config.workers === "number" ? Math.max(1, config.workers) : 4;

  await withApiContext(async (api) => {
    for (let i = 0; i < workers; i += 1) {
      await ensureUserExists(api, workerCredentials(i));
    }
  });
}
