import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const frontendPort = process.env.E2E_FRONTEND_PORT ?? "5240";
const backendPort = process.env.E2E_BACKEND_PORT ?? "5243";

const e2eWorkers =
  process.env.E2E_WORKERS != null && process.env.E2E_WORKERS !== ""
    ? Number.parseInt(process.env.E2E_WORKERS, 10) || 2
    : isCI
      ? 4
      : 1;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: e2eWorkers,
  retries: isCI ? 2 : 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start:dev",
      cwd: "../backend",
      url: `http://localhost:${backendPort}/api/v1/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: `http://localhost:${frontendPort}`,
      /** Fresh server picks up `env` below. Set `REUSE_DEV_SERVER=1` only if you already run `next dev` with the same env. */
      reuseExistingServer: isCI ? false : process.env.REUSE_DEV_SERVER === "1",
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${backendPort}`,
        PLAYWRIGHT_WEB_SERVER: "1",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
