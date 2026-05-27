// ─── Kōda Trade Constants ─────────────────────────────────────────────────────
// Shared constants used by the trade log form and anywhere trades are displayed.
// Import from here rather than re-defining per-file.

import type { Trade } from "./types";

export const SESSIONS = ["London","New York","Asia","London/NY Overlap","Pre-Market","After Hours"];
export const BIAS = ["Bullish","Bearish","Neutral"];
export const OUTCOMES = ["Win","Loss","Breakeven"] as const;

export const EMOTION_TAGS = [
  { id: "disciplined", label: "Disciplined", color: "#00C96B" },
  { id: "patient",     label: "Patient",     color: "#00C96B" },
  { id: "fomo",        label: "FOMO",        color: "#FF3D00" },
  { id: "revenge",     label: "Revenge",     color: "#FF3D00" },
  { id: "overtrading", label: "Overtrading", color: "#FF3D00" },
  { id: "hesitated",   label: "Hesitated",   color: "#BCBCB4" },
  { id: "earlyexit",   label: "Early Exit",  color: "#BCBCB4" },
  { id: "movedsl",     label: "Moved SL",    color: "#BCBCB4" },
  { id: "chased",      label: "Chased",      color: "#BCBCB4" },
];

export function getEmotionTags(emotions: string | string[] | undefined): string[] {
  if (!emotions) return [];
  if (Array.isArray(emotions)) return emotions;
  const lower = emotions.toLowerCase();
  return EMOTION_TAGS.filter(t => lower.includes(t.id) || lower.includes(t.label.toLowerCase())).map(t => t.id);
}

export const MISTAKE_TAGS = [
  "None",
  "Chased entry",
  "Moved stop",
  "Oversized",
  "Revenge trade",
  "Cut winner early",
  "Held loser too long",
  "Broke a rule",
  "Other",
] as const;

export const EMPTY_TRADE: Partial<Trade> = {
  date: new Date().toISOString().split("T")[0],
  pair: "", session: "", bias: "", strategy: "", setup: "",
  entryPrice: "", slPrice: "", tpPrice: "", rr: "",
  outcome: "", pnl: "", pnlDollar: "",
  entryTime: "", exitTime: "", direction: "",
  notes: "", emotions: "", screenshot: "",
  mae: "", mfe: "", ruleAdherence: null, mistake: null,
  comments: [], reactions: {},
};
