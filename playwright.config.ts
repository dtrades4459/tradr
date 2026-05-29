import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for TRADR smoke tests.
 *
 * Tests run against the live production URL by default.
 * Set BASE_URL to a Vercel preview URL to test a specific deployment.
 *
 * Required env vars (set as GitHub secrets or local .env.test):
 *   TEST_EMAIL    — email of the dedicated smoke-test Supabase account
 *   TEST_PASSWORD — password for that account
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.BASE_URL ?? "https://kodatrade.co.uk",
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14 — TRADR is mobile-first
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
