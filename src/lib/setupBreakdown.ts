import type { Trade } from "../types";

export interface SetupRow {
  strategy: string;
  count: number;
  winRate: number;   // 0–100
  totalPnl: number;  // sum of parseFloat(trade.pnl)
  avgPnl: number;
}

export function groupBySetup(trades: Pick<Trade, "strategy" | "outcome" | "pnl">[]): SetupRow[] {
  const map = new Map<string, { wins: number; count: number; totalPnl: number }>();

  for (const t of trades) {
    const s = (t.strategy ?? "").trim();
    if (!s) continue;
    const pnl = parseFloat(t.pnl) || 0;
    const entry = map.get(s) ?? { wins: 0, count: 0, totalPnl: 0 };
    entry.count++;
    entry.totalPnl += pnl;
    if (t.outcome === "Win" || t.outcome === "win") entry.wins++;
    map.set(s, entry);
  }

  return Array.from(map.entries())
    .map(([strategy, v]) => ({
      strategy,
      count: v.count,
      winRate: v.count > 0 ? Math.round((v.wins / v.count) * 100) : 0,
      totalPnl: parseFloat(v.totalPnl.toFixed(2)),
      avgPnl:   parseFloat((v.totalPnl / v.count).toFixed(2)),
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}
