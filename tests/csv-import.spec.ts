import { test, expect, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, "../src/lib/__fixtures__");

const hasAuth = !!(process.env.TEST_EMAIL && process.env.TEST_PASSWORD);
const authFile = path.join(process.cwd(), "playwright", ".auth", "user.json");
const isAuthenticated = existsSync(authFile);

const needsAuth = !hasAuth && !isAuthenticated;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  // After auth the main app mounts; the login form should disappear.
  // Wait for an element unique to the logged-in state.
  await page.waitForSelector('[data-testid^="nav-"], nav, [class*="nav"]', { timeout: 15_000 });
}

async function openImportPanel(page: Page) {
  // Navigate to the home/sync section that contains "Import CSV".
  // The "Import" chip/button sets homeSection to "sync".
  const importChip = page.getByRole("button", { name: /^Import$/i });
  if (await importChip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await importChip.click();
  }

  // The "Import CSV" button opens the CSV panel.
  const importCsvBtn = page.getByRole("button", { name: /Import CSV/i });
  await importCsvBtn.waitFor({ timeout: 10_000 });
  await importCsvBtn.click();

  // Panel is open when platform buttons appear.
  await page.waitForSelector("text=/Tradovate|TradingView|platform/i", { timeout: 8_000 });
}

async function selectPlatform(page: Page, label: string | RegExp) {
  await page.getByRole("button", { name: label }).click();
}

async function uploadCsv(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(FIXTURE_DIR, filename));
}

// ─── tests that only need the app to load (no auth) ──────────────────────────

test("app loads without crashing (no black screen)", async ({ page }) => {
  await page.goto("/");
  // The LoadingScreen renders an SVG logo (no text) so we can't check text content.
  // Instead, wait for React to mount SOMETHING into #root — that proves supabase.ts
  // didn't crash module init.
  await expect(page.locator("#root > *").first()).toBeAttached({ timeout: 15_000 });
});

test("login screen shows username input when not authenticated", async ({ page }) => {
  await page.goto("/");
  // Kōda's auth uses usernames (mapped to email internally), so the input is
  // type="text" with a "Username" label. Also accept email inputs and nav bars
  // (already-authenticated case) as success.
  const usernameInput = page.locator('input[placeholder*="yourname" i], input[placeholder*="handle" i]');
  const emailInput    = page.locator('input[type="email"], input[placeholder*="mail" i]');
  const navBar        = page.locator('[data-testid^="nav-"]');

  // Whichever shows up first wins.
  const found = await Promise.race([
    usernameInput.first().waitFor({ state: "visible", timeout: 15_000 }).then(() => "username").catch(() => null),
    emailInput.first().waitFor({ state: "visible", timeout: 15_000 }).then(() => "email").catch(() => null),
    navBar.first().waitFor({ state: "visible", timeout: 15_000 }).then(() => "nav").catch(() => null),
  ]);

  expect(found, "Expected username input, email input, or nav bar to appear").not.toBeNull();
});

// ─── authenticated tests ──────────────────────────────────────────────────────

const SKIP_REASON = "Set TEST_EMAIL + TEST_PASSWORD in .env to enable authenticated E2E tests";

test.describe("CSV Import (authenticated)", () => {

  test.beforeEach(async ({ page }) => {
    if (needsAuth) return;
    await page.goto("/");
    await waitForApp(page);
  });

  test("Import CSV panel opens and shows platform picker", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await expect(page.getByRole("button", { name: /Tradovate/i }).first()).toBeVisible();
  });

  test("Tradovate CSV — dates are not today", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /Tradovate/i);
    await uploadCsv(page, "tradovate-export.csv");

    await page.waitForSelector("table, [data-testid='preview-row']", { timeout: 8_000 });

    // No "all trades show today's date" warning.
    await expect(page.locator("text=/all.*trades show today/i")).not.toBeVisible();

    // At least one 2024-11-1x date visible.
    await expect(page.locator("text=/2024-11-1/").first()).toBeVisible();
  });

  test("TradingView Strategy Tester — instrument prompt + 3 merged trades", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /TradingView.*Strategy|Strategy.*Tester/i);

    // Instrument input shown.
    const symbolInput = page.locator('input[placeholder*="symbol" i], input[placeholder*="instrument" i], input[placeholder*="NQ" i]');
    await expect(symbolInput.first()).toBeVisible({ timeout: 6_000 });
    await symbolInput.first().fill("NQ");

    await uploadCsv(page, "tradingview-export.csv");
    await page.waitForSelector("table, [data-testid='preview-row']", { timeout: 8_000 });

    await expect(page.locator("text=/all.*trades show today/i")).not.toBeVisible();

    // 3 merged trades → 4 rows (header + 3 data rows).
    const rows = page.locator("table tr");
    await expect(rows).toHaveCount(4, { timeout: 6_000 });

    await expect(page.locator("text=NQ").first()).toBeVisible();
  });

  test("Rithmic CSV — no today-date warning", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /Rithmic/i);
    await uploadCsv(page, "rithmic-export.csv");
    await page.waitForSelector("table, [data-testid='preview-row']", { timeout: 8_000 });
    await expect(page.locator("text=/all.*trades show today/i")).not.toBeVisible();
  });

  test("NinjaTrader 8 CSV — no today-date warning", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /NinjaTrader/i);
    await uploadCsv(page, "ninjatrader8-export.csv");
    await page.waitForSelector("table, [data-testid='preview-row']", { timeout: 8_000 });
    await expect(page.locator("text=/all.*trades show today/i")).not.toBeVisible();
  });

  test("Import flow opens TradeTagger after confirming", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /Tradovate/i);
    await uploadCsv(page, "tradovate-export.csv");
    await page.waitForSelector("table", { timeout: 8_000 });

    await page.getByRole("button", { name: /import|confirm|save/i }).last().click();

    // TradeTagger overlay.
    await expect(page.locator("text=/quick tag/i")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/1\//")).toBeVisible();
  });

  test("TradeTagger Skip advances to trade 2", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /Tradovate/i);
    await uploadCsv(page, "tradovate-export.csv");
    await page.waitForSelector("table", { timeout: 8_000 });
    await page.getByRole("button", { name: /import|confirm|save/i }).last().click();
    await page.waitForSelector("text=/quick tag/i", { timeout: 10_000 });

    await page.getByRole("button", { name: /Skip/i }).click();
    await expect(page.locator("text=/2\//")).toBeVisible();
  });

  test("TradeTagger Done exits and shows toast", async ({ page }) => {
    test.skip(needsAuth, SKIP_REASON);
    await openImportPanel(page);
    await selectPlatform(page, /Tradovate/i);
    await uploadCsv(page, "tradovate-export.csv");
    await page.waitForSelector("table", { timeout: 8_000 });
    await page.getByRole("button", { name: /import|confirm|save/i }).last().click();
    await page.waitForSelector("text=/quick tag/i", { timeout: 10_000 });

    await page.getByRole("button", { name: /Done/i }).click();

    await expect(page.locator("text=/quick tag/i")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=/imported/i")).toBeVisible({ timeout: 5_000 });
  });

});
