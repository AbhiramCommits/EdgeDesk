import { defineConfig, devices } from "@playwright/test";

const API_URL = "http://127.0.0.1:8787";
const WEB_URL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Recreates local D1 state, applies both migrations, seeds 6 users / 60
      // requests, then serves the Worker with real local D1/KV/DO bindings.
      command: "bash e2e/start-api.sh",
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Production-shaped static bundle served by Vite preview, with /api
      // proxied to the Worker exactly like the Pages _redirects rule.
      command:
        "pnpm --filter web build && pnpm --filter web exec vite preview --port 4173 --host 127.0.0.1 --strictPort",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
