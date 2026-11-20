import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must point to a disposable PostgreSQL database for E2E tests.");
}

const apiPort = "33101";
const clientPort = "35174";
const apiUrl = `http://localhost:${apiPort}`;
const clientUrl = `http://localhost:${clientPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: clientUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm run dev -w server",
      url: `${apiUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        JWT_SECRET: "playwright-test-secret-only",
        CLIENT_ORIGIN: clientUrl,
        API_PORT: apiPort,
        LOGIN_RATE_LIMIT: "100"
      }
    },
    {
      command: `npm run dev -w client -- --port ${clientPort} --strictPort`,
      url: clientUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_URL: apiUrl
      }
    }
  ]
});
