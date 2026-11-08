import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env.test.local", override: true });

const port = process.env["PORT"] ?? "3001";
const host = "127.0.0.1";
const baseURL =
  process.env["PLAYWRIGHT_BASE_URL"] ??
  `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global.setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --hostname ${host} --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180 * 1000,
  },
});
