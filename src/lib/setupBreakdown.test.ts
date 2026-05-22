import { describe, it, expect } from "vitest";
import { groupBySetup } from "./setupBreakdown";
import type { Trade } from "../types";

function t(strategy: string, outcome: string, pnl: string): Trade {
  return {
    id: Math.random(), date: "2026-05-01", pair: "ES", session: "", bias: "",
    strategy, setup: "", entryPrice: "", slPrice: "", tpPrice: "", rr: "",
    outcome, pnl, notes: "", emotions: "", screenshot: "", pnlDollar: pnl,
    comments: [], reactions: {},
  } as unknown as Trade;
}

describe("groupBySetup", () => {
  it("returns empty array for no trades", () => {
    expect(groupBySetup([])).toEqual([]);
  });

  it("groups trades by strategy, sorted by total pnl desc", () => {
    const trades = [t("ICT", "win", "2"), t("ICT", "loss", "-1"), t("Scalp", "win", "3")];
    const result = groupBySetup(trades);
    expect(result).toHaveLength(2);
    expect(result[0].strategy).toBe("Scalp");
    expect(result[0].totalPnl).toBe(3);
    expect(result[1].strategy).toBe("ICT");
    expect(result[1].totalPnl).toBeCloseTo(1);
    expect(result[1].winRate).toBe(50);
    expect(result[1].count).toBe(2);
  });

  it("excludes rows with no strategy", () => {
    const trades = [t("", "win", "1"), t("ICT", "win", "2")];
    const result = groupBySetup(trades);
    expect(result).toHaveLength(1);
    expect(result[0].strategy).toBe("ICT");
  });
});
