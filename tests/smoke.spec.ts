import { test, expect } from "@playwright/test";

/**
 * TRADR smoke test — sign in → log trade → verify it appears in the journal.
 *
 * Requires env vars:
 *   TEST_EMAIL    — smoke-test account username (the part before @tradr.local)
 *   TEST_PASSWORD — password for that account
 *
 * The test account should be a real Supabase account on tradrjournal.xyz
 * that exists purely for CI verification. Trades it logs are left in place
 * (small noise in a test account is acceptable).
 *
 * Auth note: TRADR uses username-based login (not email input). The username
 * field is input[type="text"] and the submit button has no type attribute —
 * it is identified by text content.
 */

const EMAIL = process.env.TEST_EMAIL ?? "";
const PASSWORD = process.env.TEST_PASSWORD ?? "";

test.describe("TRADR smoke", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_EMAIL / TEST_PASSWORD not set — skipping E2E smoke");

  test("app loads without blank screen", async ({ page }) => {
    await page.goto("/");
    // The root div should have rendered content (not an empty white page)
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty({ timeout: 10_000 });
    // Either the auth form or the main nav should be visible
    // Auth uses input[type="text"] for username (not email)
    const authOrApp = page.locator(
      'input[type="text"], input[type="email"], nav, [data-testid="home-tab"]'
    );
    await expect(authOrApp.first()).toBeVisible({ timeout: 10_000 });
  });

  test("sign in → log trade → trade appears in journal", async ({ page }) => {
    await page.goto("/");

    // ── Auth ──────────────────────────────────────────────────────────────────
    // TRADR auth uses input[type="text"] for username (no email field on sign-in)
    const usernameInput = page.locator('input[type="text"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });

    await usernameInput.fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);

    // Submit button has no type attribute — identified by text
    await page.locator("button").filter({ hasText: /sign in/i }).first().click();

    // Wait for the main app to load — the home/log tab nav should appear
    const logTab = page.locator('button, [role="tab"]').filter({ hasText: /^log$/i });
    await expect(logTab.first()).toBeVisible({ timeout: 15_000 });

    // ── Open the trade log form ───────────────────────────────────────────────
    await logTab.first().click();

    // Look for a "Log Trade" / "Add Trade" / "+" button
    const addButton = page
      .locator("button")
      .filter({ hasText: /log trade|add trade|\+/i })
      .first();
    await expect(addButton).toBeVisible({ timeout: 8_000 });
    await addButton.click();

    // ── Fill in minimal trade fields ──────────────────────────────────────────
    const pairInput = page
      .locator('input[placeholder*="pair" i], input[placeholder*="symbol" i], input[placeholder*="instrument" i]')
      .first();
    if (await pairInput.isVisible()) {
      await pairInput.fill("NQ");
    }

    // Pick "Win" outcome if selector is available
    const winButton = page.locator("button, label").filter({ hasText: /^win$/i }).first();
    if (await winButton.isVisible()) {
      await winButton.click();
    }

    // P&L
    const pnlInput = page
      .locator('input[placeholder*="p&l" i], input[placeholder*="pnl" i], input[placeholder*="profit" i]')
      .first();
    if (await pnlInput.isVisible()) {
      await pnlInput.fill("100");
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    const saveButton = page
      .locator("button")
      .filter({ hasText: /save|add trade|log trade/i })
      .last();
    await saveButton.click();

    // ── Verify trade appears ──────────────────────────────────────────────────
    // After saving, a trade entry with "NQ" or "100" should be visible somewhere
    const tradeEntry = page.locator("text=NQ").or(page.locator("text=100")).first();
    await expect(tradeEntry).toBeVisible({ timeo