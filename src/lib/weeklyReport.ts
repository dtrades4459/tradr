import type { Trade } from "../types";

export interface WeeklySummary {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlDollar: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  periodLabel: string;
}

export function computeWeeklySummary(
  trades: Trade[],
  today: string
): WeeklySummary | null {
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const startStr = start.toISOString().split("T")[0];

  const week = trades.filter(t => t.date >= startStr && t.date <= today);
  if (!week.length) return null;

  const wins   = week.filter(t => (t.outcome ?? "").toLowerCase() === "win").length;
  const losses = week.filter(t => (t.outcome ?? "").toLowerCase() === "loss").length;
  const totalPnlDollar = week.reduce((s, t) => s + (parseFloat(t.pnlDollar) || 0), 0);

  const sorted = [...week].sort((a, b) => (parseFloat(b.pnlDollar) || 0) - (parseFloat(a.pnlDollar) || 0));
  const bestTrade  = sorted[0] ?? null;
  const worstTrade = sorted[sorted.length - 1] ?? null;

  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
  const periodLabel = `${fmt(start)} – ${fmt(end)}`;

  return {
    count: week.length,
    wins,
    losses,
    winRate: parseFloat(((wins / week.length) * 100).toFixed(1)),
    totalPnlDollar: parseFloat(totalPnlDollar.toFixed(2)),
    bestTrade,
    worstTrade,
    periodLabel,
  };
}
