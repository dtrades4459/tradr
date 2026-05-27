// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · stats.ts
//
// Pure calculation functions for trade statistics.
// No React, no side-effects — safe to unit-test in isolation.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Trade } from "../types";

// ── R:R calculator ────────────────────────────────────────────────────────────

/**
 * Calculate risk/reward ratio from entry, stop-loss, and take-profit prices.
 * Returns a formatted string (e.g. "2.50") or "" if the inputs are invalid.
 */
export function calcRR(entry: string, stopLoss: string, takeProfit: string): string {
  const ev = parseFloat(entry);
  const sv = parseFloat(stopLoss);
  const tv = parseFloat(takeProfit);
  if (isNaN(ev) || isNaN(sv) || isNaN(tv)) return "";
  const risk = Math.abs(ev - sv);
  if (risk === 0) return ""; // entry === stop loss → undefined R:R
  const reward = Math.abs(tv - ev);
  const rr = reward / risk;
  // Sanity-cap: anything above 100R is almost certainly a data error.
  if (!isFinite(rr) || rr > 100) return "";
  return rr.toFixed(2);
}

// ── Win rate ──────────────────────────────────────────────────────────────────

/** Returns win rate as a percentage (0–100), rounded to 1 decimal place. */
export function calcWinRate(trades: Pick<Trade, "outcome">[]): number {
  const total = trades.length;
  if (total === 0) return 0;
  const wins = trades.filter(t => t.outcome === "Win").length;
  return parseFloat(((wins / total) * 100).toFixed(1));
}

// ── Current streak ────────────────────────────────────────────────────────────

export interface Streak {
  type: "Win" | "Loss" | null;
  count: number;
}

/**
 * Returns the current consecutive streak from the most recent trades.
 * Trades are expected newest-first (as stored in the app).
 * Breakeven trades are skipped — they don't break or extend a streak.
 */
export function calcStreak(trades: Pick<Trade, "outcome">[]): Streak {
  if (!trades.length) return { type: null, count: 0 };
  let count = 0;
  let type: "Win" | "Loss" | null = null;
  for (const t of trades) {
    if (t.outcome !== "Win" && t.outcome !== "Loss") continue; // skip BE
    if (type === null) {
      type = t.outcome as "Win" | "Loss";
      count = 1;
    } else if (t.outcome === type) {
      count++;
    } else {
      break;
    }
  }
  return { type, count };
}

// ── Weekly P&L ────────────────────────────────────────────────────────────────

/** Sum P&L (in R) for trades in the current calendar week (Mon–Sun). */
export function calcWeeklyPnL(trades: Pick<Trade, "date" | "pnl">[]): number {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return trades
    .filter(t => t.date && new Date(t.date + "T12:00:00") >= monday)
    .reduce((sum, t) => sum + (parseFloat(t.pnl as string) || 0), 0);
}

// ── Total P&L ─────────────────────────────────────────────────────────────────

/** Sum P&L (in R) across all trades. */
export function calcTotalPnL(trades: Pick<Trade, "pnl">[]): number {
  return trades.reduce((sum, t) => sum + (parseFloat(t.pnl as string) || 0), 0);
}
