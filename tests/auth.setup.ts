import { test as setup, expect } from "@playwright/test";
import { join } from "path";

const authFile = join(process.cwd(), "playwright", ".auth", "user.json");

/**
 * Sign in with TEST_EMAIL + TEST_PASSWORD and save the auth state so all
 * subsequent Playwright tests start already logged in.
 *
 * Add to your .env:
 *   TEST_EMAIL=your@email.com
 *   TEST_PASSWORD=yourpassword
 */
setup("sign in", async ({ page }) => {
  const email = process.env.TEST_EMAIL!;
  const password = process.env.TEST_PASSWORD!;

  await page.goto("/");

  // Wait for the auth screen — Kōda shows email + password inputs.
  await page.waitForSelector('input[type="email"], input[placeholder*="mail" i]', { timeout: 15_000 });

  await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(email);
  await page.locator('input[type="password"], input[placeholder*="assword" i]').first().fill(password);
  await page.getByRole("button", { name: /sign.?in|log.?in|continue/i }).click();

  // Wait until the main app UI is visible (not the auth screen).
  await expect(page.locator('input[type="email"]')).not.toBeVisible({ timeout: 15_000 });

  // Save auth cookies + localStorage so other tests reuse this session.
  await page.context().storageState({ path: authFile });
});
