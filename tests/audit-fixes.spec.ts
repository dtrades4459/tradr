import { test, expect, type Page } from "@playwright/test";

/**
 * Kōda audit-fixes smoke tests.
 *
 * Covers every change shipped in the 2026-05-30 audit sprint:
 *
 * Anonymous:
 *   R.1  Reset password — "Forgot password" link is present on auth screen.
 *   R.2  Reset password — entering an email shows confirmation copy.
 *
 * Authenticated (skipped when TEST_EMAIL / TEST_PASSWORD not set):
 *   I.1  Kill switch: banner visible when daily loss limit exceeded.
 *   I.2  Kill switch: Save button is disabled (not just a warning).
 *   I.3  Trade limit: banner visible when at max-trades-per-day.
 *   I.4  Trade limit: Save button is disabled.
 *   I.5  Regression — normal logging still works with no limits set.
 *   C.1  Circles: "Discover" pill tab is absent from the browse screen.
 *   C.2  Circles: "ALL TIME" / "THIS WEEK" sort buttons are present on the leaderboard.
 */

const EMAIL    = process.env.TEST_EMAIL    ?? "";
const PASSWORD = process.env.TEST_PASSWORD ?? "";
const TODAY    = new Date().toISOString().split("T")[0];

// ─── helpers ────────────────────────────────────────────────────────────────

async function dismissCookieBanner(page: Page) {
  const dialog = page.getByRole("dialog", { name: /cookie consent/i });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /accept/i }).click();
  }
}

async function signIn(page: Page) {
  await page.goto("/");
  await dismissCookieBanner(page);
  await page.locator('input[type="text"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByTestId("auth-submit").click();
  // Wait until the nav-log quick-action card is visible — confirms auth + app boot.
  await expect(page.getByTestId("nav-log")).toBeVisible({ timeout: 20_000 });
}

/**
 * Overwrite the cached profile in localStorage with the given field updates.
 * The storage layer checks the localStorage cache before Supabase on `loadAll`,
 * so a page.reload() after this call picks up the changes immediately.
 */
async function patchProfile(page: Page, updates: Record<string, unknown>): Promise<boolean> {
  return page.evaluate((updates) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.includes("koda_profile") || !k.startsWith("koda__user__")) continue;
      try {
        const current = JSON.parse(localStorage.getItem(k)!);
        localStorage.setItem(k, JSON.stringify({ ...current, ...updates }));
        return true;
      } catch { /* skip */ }
    }
    return false;
  }, updates);
}

/**
 * Prepend a fake trade to the cached trades array in localStorage.
 * Used to push todayPnl over a limit or to hit the max-trades-per-day count.
 */
async function prependTrade(page: Page, trade: Record<string, unknown>): Promise<boolean> {
  return page.evaluate((trade) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.includes("koda_trades") || !k.startsWith("koda__user__")) continue;
      try {
        const current: unknown[] = JSON.parse(localStorage.getItem(k)!) ?? [];
        localStorage.setItem(k, JSON.stringify([trade, ...current]));
        return true;
      } catch { /* skip */ }
    }
    return false;
  }, trade);
}

/** Navigate to the Log screen and wait for the trade form to be ready. */
async function goToLogScreen(page: Page) {
  await page.getByTestId("nav-log").click();
  await expect(page.getByTestId("trade-pair")).toBeVisible({ timeout: 10_000 });
}

// ─── R — Reset password ───────────────────────────────────────────────────

test.describe("Reset password", () => {
  test("R.1 — Forgot password link is visible on the auth screen", async ({ page }) => {
    await page.goto("/");
    await dismissCookieBanner(page);

    // The auth form should be visible before we look for the link.
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 15_000 });

    // Accept any of the common labels used for the forgot-password flow.
    const forgotLink = page
      .getByRole("button", { name: /forgot.?password|reset.?password/i })
      .or(page.getByText(/forgot.?password|reset.?password/i).first());

    await expect(forgotLink).toBeVisible({ timeout: 5_000 });
  });

  test("R.2 — Entering an email shows reset confirmation", async ({ page }) => {
    await page.goto("/");
    await dismissCookieBanner(page);

    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 15_000 });

    // Open the forgot-password flow.
    const forgotLink = page
      .getByRole("button", { name: /forgot.?password|reset.?password/i })
      .or(page.getByText(/forgot.?password|reset.?password/i).first());
    await forgotLink.click();

    // An email input should appear (either the existing one or a new dedicated one).
    const emailInput = page
      .getByRole("textbox", { name: /email/i })
      .or(page.locator('input[type="email"]'))
      .or(page.locator('input[type="text"]').first());
    await expect(emailInput).toBeVisible({ timeout: 5_000 });

    // Use a throwaway address — no actual email is sent to a real inbox in tests.
    await emailInput.fill("smoke-test@example.com");

    // Submit the reset request.
    const sendBtn = page
      .getByRole("button", { name: /send|reset|submit/i })
      .last(); // avoid clicking auth-submit by accident
    await sendBtn.click();

    // The app should acknowledge the request — look for any confirmation copy.
    const confirmation = page.locator([
      "text=/check your email/i",
      "text=/email sent/i",
      "text=/link sent/i",
      "text=/reset link/i",
      "text=/if an account exists/i",
    ].join(", ")).first();
    await expect(confirmation).toBeVisible({ timeout: 10_000 });
  });
});

// ─── I — Intervention layer ───────────────────────────────────────────────

test.describe("Intervention layer", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_EMAIL / TEST_PASSWORD not set — skipping");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // ── Kill switch ──────────────────────────────────────────────────────────

  test("I.1 — Kill switch banner visible when daily loss exceeded", async ({ page }) => {
    // Set the daily loss limit to 1R and inject a trade that lost 5R today.
    await patchProfile(page, { maxDailyLoss: "1" });
    await prependTrade(page, {
      id: 999_001, date: TODAY, pair: "NQ", outcome: "Loss",
      pnl: "-5", pnlDollar: "-500", session: "", bias: "",
      strategy: "", setup: "", entryPrice: "", slPrice: "",
      tpPrice: "", rr: "", notes: "", emotions: "", screenshot: "",
      comments: [], reactions: {},
    });

    await page.reload();
    await expect(page.getByTestId("nav-log")).toBeVisible({ timeout: 20_000 });
    await goToLogScreen(page);

    await expect(
      page.getByRole("alert").filter({ hasText: /kill switch/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("I.2 — Save is disabled when kill switch is active", async ({ page }) => {
    await patchProfile(page, { maxDailyLoss: "1" });
    await prependTrade(page, {
      id: 999_002, date: TODAY, pair: "NQ", outcome: "Loss",
      pnl: "-5", pnlDollar: "-500", session: "", bias: "",
      strategy: "", setup: "", entryPrice: "", slPrice: "",
      tpPrice: "", rr: "", notes: "", emotions: "", screenshot: "",
      comments: [], reactions: {},
    });

    await page.reload();
    await expect(page.getByTestId("nav-log")).toBeVisible({ timeout: 20_000 });
    await goToLogScreen(page);

    // Fill the minimum fields so the button would normally become enabled.
    await page.getByTestId("trade-pair").fill("NQ");
    await page.getByRole("button", { name: /^win$/i }).first().click();

    const saveBtn = page.getByTestId("trade-save");
    await expect(saveBtn).toBeDisabled({ timeout: 3_000 });
  });

  // ── Trade limit ──────────────────────────────────────────────────────────

  test("I.3 — Trade limit banner visible when at max trades per day", async ({ page }) => {
    await patchProfile(page, { maxTradesPerDay: "1" });
    await prependTrade(page, {
      id: 999_003, date: TODAY, pair: "ES", outcome: "Win",
      pnl: "1", pnlDollar: "50", session: "", bias: "",
      strategy: "", setup: "", entryPrice: "", slPrice: "",
      tpPrice: "", rr: "", notes: "", emotions: "", screenshot: "",
      comments: [], reactions: {},
    });

    await page.reload();
    await expect(page.getByTestId("nav-log")).toBeVisible({ timeout: 20_000 });
    await goToLogScreen(page);

    await expect(
      page.getByRole("alert").filter({ hasText: /trade limit|limit reached/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("I.4 — Save is disabled at the trade limit", async ({ page }) => {
    await patchProfile(page, { maxTradesPerDay: "1" });
    await prependTrade(page, {
      id: 999_004, date: TODAY, pair: "ES", outcome: "Win",
      pnl: "1", pnlDollar: "50", session: "", bias: "",
      strategy: "", setup: "", entryPrice: "", slPrice: "",
      tpPrice: "", rr: "", notes: "", emotions: "", screenshot: "",
      comments: [], reactions: {},
    });

    await page.reload();
    await expect(page.getByTestId("nav-log")).toBeVisible({ timeout: 20_000 });
    await goToLogScreen(page);

    await page.getByTestId("trade-pair").fill("NQ");
    await page.getByRole("button", { name: /^win$/i }).first().click();

    const saveBtn = page.getByTestId("trade-save");
    await expect(saveBtn).toBeDisabled({ timeout: 3_000 });
  });

  // ── Regression ───────────────────────────────────────────────────────────

  test("I.5 — Save is enabled normally when no limits are set", async ({ page }) => {
    // Ensure both limits are cleared.
    await patchProfile(page, { maxDailyLoss: "", maxTradesPerDay: "" });

    await page.reload();
    await expect(page.getByTestId("nav-log")).toBeVisible({ timeout: 20_000 });
    await goToLogScreen(page);

    await page.getByTestId("trade-pair").fill("NQ");
    await page.getByRole("button", { name: /^win$/i }).first().click();

    const saveBtn = page.getByTestId("trade-save");
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
  });
});

// ─── C — Circles UI ──────────────────────────────────────────────────────

test.describe("Circles UI", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_EMAIL / TEST_PASSWORD not set — skipping");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  async function goToCircles(page: Page) {
    // The bottom nav renders three tabs: Home, Stats, Circles.
    const circlesTab = page
      .getByRole("button", { name: /^circles$/i })
      .or(page.locator("[data-tab='circles']"))
      .first();
    await circlesTab.click();
    // Wait for the circles browse screen — "Trading circles" kicker or "+ New" button.
    await expect(
      page.getByText(/trading circles/i).or(page.getByRole("button", { name: /new/i })).first()
    ).toBeVisible({ timeout: 10_000 });
  }

  test("C.1 — Discover pill tab is absent from the Circles browse screen", async ({ page }) => {
    await goToCircles(page);

    // The Discover tab was a fake button — it should no longer exist in any form.
    const discoverBtn = page.getByRole("button", { name: /^discover$/i });
    await expect(discoverBtn).not.toBeVisible();
  });

  test("C.2 — Leaderboard sort buttons present inside a circle", async ({ page }) => {
    await goToCircles(page);

    // Open the first circle in the list (or skip if no circles joined yet).
    const firstCircleCard = page.locator("[class*='row-hvr'], [style*='cursor: pointer']").first();
    const hasCircle = await firstCircleCard.isVisible().catch(() => false);

    if (!hasCircle) {
      test.skip(); // No circles joined — can't test leaderboard. Skip gracefully.
      return;
    }

    await firstCircleCard.click();

    // Navigate to the Board (leaderboard) tab.
    const boardTab = page.getByRole("button", { name: /board|leaderboard/i }).first();
    await expect(boardTab).toBeVisible({ timeout: 8_000 });
    await boardTab.click();

    // Both sort controls should now be visible.
    await expect(page.getByRole("button", { name: /all time/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /this week/i })).toBeVisible({ timeout: 5_000 });

    // Clicking "THIS WEEK" should not crash the app.
    await page.getByRole("button", { name: /this week/i }).click();

    // The leaderboard container should still be present after the re-fetch.
    await expect(
      page.getByRole("button", { name: /all time/i })
    ).toBeVisible({ timeout: 8_000 });
  });
});
