import type { Trade } from "../types";

export interface DisciplineScore {
  pct: number;       // 0–100
  followed: number;  // trades where ruleAdherence === true
  broken: number;    // trades where ruleAdherence === false
  total: number;     // followed + broken (null excluded)
}

export function computeDisciplineScore(
  trades: Pick<Trade, "date" | "ruleAdherence">[],
  today: string   // YYYY-MM-DD
): DisciplineScore | null {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const relevant = trades.filter(
    t => t.date >= cutoffStr && t.ruleAdherence !== null && t.ruleAdherence !== undefined
  );

  if (relevant.length === 0) return null;

  const followed = relevant.filter(t => t.ruleAdherence === true).length;
  const broken   = relevant.length - followed;
  const total    = relevant.length;

  return { pct: Math.round((followed / total) * 100), followed, broken, total };
}
