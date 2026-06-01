import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Load .env into process.env so the webServer subprocess and auth setup can
// see VITE_* vars. Playwright doesn't auto-load .env files.
const dotenvPath = join(process.cwd(), ".env");
if (existsSync(dotenvPath)) {
  for (const line of readFileSync(dotenvPath, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) {
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}

// Ensure the auth state directory exists so storageState never throws.
const authDir = join(process.cwd(), "playwright", ".auth");
mkdirSync(authDir, { recursive: true });
const authFile = join(authDir, "user.json");

/**
 * Playwright config for Kōda smoke tests.
 *
 * Runs against http://localhost:5173 by default. The webServer block starts
 * `npm run dev` automatically, so `npm run test:e2e` Just Works on a dev machine.
 *
 * Point at a deployed environment:
 *   BASE_URL=https://kodatrade.co.uk npx playwright test
 *
 * To run E2E tests that need auth, add to .env:
 *   TEST_EMAIL=your@email.com
 *   TEST_PASSWORD=yourpassword
 * Auth is skipped automatically when these are not set.
 */
const isCI = !!process.env.CI;
const baseURL = process.env.BASE_URL ?? "http://localhost:5173";
const isLocalhost = /localhost|127\.0\.0\.1/.test(baseURL);

// Vars to forward into the Vite dev server subprocess.
const viteEnv: Record<string, string> = {};
if (process.env.VITE_SUPABASE_URL)    viteEnv.VITE_SUPABASE_URL    = process.env.VITE_SUPABASE_URL;
if (process.env.VITE_SUPABASE_ANON_KEY) viteEnv.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const hasAuth = !!(process.env.TEST_EMAIL && process.env.TEST_PASSWORD);

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "github" : "list",

  webServer: isLocalhost ? {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
    // Explicitly forward Supabase vars so Vite injects them into import.meta.env.
    env: viteEnv,
  } : undefined,

  use: {
    baseURL,
    headless: true,
    viewport: { width: 390, height: 844 },
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    // Use saved auth state when available.
    storageState: existsSync(authFile) ? authFile : undefined,
  },

  projects: [
    // Step 1 (optional): sign in and save cookies/localStorage.
    // Only runs when TEST_EMAIL + TEST_PASSWORD are in the environment.
    ...(hasAuth ? [{
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    }] : []),

    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      dependencies: hasAuth ? ["auth-setup"] : [],
    },
  ],
});
