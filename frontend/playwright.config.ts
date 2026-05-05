import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const frontendPort = process.env.E2E_FRONTEND_PORT ?? "5240";
const backendPort = process.env.E2E_BACKEND_PORT ?? "5243";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: isCI ? 2 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start:dev",
      cwd: "../backend",
      url: `http://127.0.0.1:${backendPort}/api/v1/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
