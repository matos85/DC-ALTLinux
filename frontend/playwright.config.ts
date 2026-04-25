import { defineConfig, devices } from "@playwright/test";

const headed = process.env.CI ? false : process.env.PLAYWRIGHT_HEADLESS !== "1";
const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3100";
const defaultBase = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  timeout: 120_000,
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? defaultBase,
    trace: "on-first-retry",
    headless: !headed,
    launchOptions: headed ? { slowMo: 420 } : {},
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium" }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `npx next dev -p ${e2ePort}`,
        url: defaultBase,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
