import { describe, it, expect } from "vitest";
import { computeWeeklySummary } from "./weeklyReport";
import type { Trade } from "../types";

function t(daysAgo: number, outcome: string, pnl: string, pnlDollar: string): Trade {
  const d = new Date("2026-05-22");
  d.setDate(d.getDate() - daysAgo);
  return {
    id: Math.random(), date: d.toISOString().split("T")[0], pair: "ES",
    session: "", bias: "", strategy: "", setup: "", entryPrice: "", slPrice: "",
    tpPrice: "", rr: pnl, outcome, pnl, notes: "", emotions: "", screenshot: "",
    pnlDollar, comments: [], reactions: {},
  } as unknown as Trade;
}

describe("computeWeeklySummary", () => {
  it("returns null for no trades in the week", () => {
    expect(computeWeeklySummary([], "2026-05-22")).toBeNull();
  });

  it("only includes trades from the last 7 days", () => {
    const trades = [t(3, "Win", "1", "100"), t(8, "Win", "2", "200")];
    const result = computeWeeklySummary(trades, "2026-05-22");
    expect(result?.count).toBe(1);
  });

  it("calculates win rate and total P&L correctly", () => {
    const trades = [t(1, "Win", "2", "200"), t(2, "Loss", "-1", "-100"), t(3, "Win", "1", "100")];
    const result = computeWeeklySummary(trades, "2026-05-22");
    expect(result?.winRate).toBeCloseTo(66.7, 1);
    expect(result?.totalPnlDollar).toBe(200);
    expect(result?.count).toBe(3);
  });

  it("identifies the best trade by P&L dollar", () => {
    const trades = [t(1, "Win", "1", "300"), t(2, "Win", "2", "100")];
    const result = computeWeeklySummary(trades, "2026-05-22");
    expect(result?.bestTrade?.pnlDollar).toBe("300");
  });
});
