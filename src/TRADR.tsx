import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { onStorageError } from "./lib/storage";
import { log } from "./lib/log";
import { isFlagOn } from "./lib/flags";
import { subscribeToCircle } from "./data/circles";
import { subscribeToFollows } from "./data/follows";
import { getProfile, upsertProfile } from "./data/profile";
import {
  tradovateAuth,
  tradovateRefresh,
  tradovateTokenExpiring,
  tradovateGetAccount,
  tradovateGetPositions,
  tradovateGetFills,
  fillsToTrades,
  type TradovateSession,
  type TradovatePosition,
} from "./lib/tradovate";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface TradeComment {
  id: number;
  author: string;
  text: string;
  ts: string;
}

/** Reactions are stored as arrays of user codes (one entry per reactor).
 *  Legacy data may contain a plain number — always normalise before display. */
export type ReactionMap = Record<string, string[] | number>;

export interface Trade {
  id: number;
  date: string;
  pair: string;
  session: string;
  bias: string;
  strategy: string;
  setup: string;
  entryPrice: string;
  slPrice: string;
  tpPrice: string;
  rr: string;
  outcome: string;
  pnl: string;
  notes: string;
  emotions: string;
  screenshot: string;
  pnlDollar: string;
  entryTime?: string;
  exitTime?: string;
  direction?: string;
  comments: TradeComment[];
  reactions: ReactionMap;
  createdAt?: string;
  updatedAt?: string;
  mae?: string;
  mfe?: string;
}

export interface Profile {
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  broker: string;
  timezone: string;
  startDate: string;
  targetRR: string;
  maxTradesPerDay: string;
  uid?: string;
  code?: string;
  /** Short display alias shown on leaderboards instead of the raw code hash.
   *  3–12 chars, letters/numbers only. Does not affect storage keys. */
  alias?: string;
  /** Set to true once the user completes the onboarding flow. */
  onboarded?: boolean;
  /** If true, this user's trades are visible on their public profile. */
  publicTrades?: boolean;
  /** Futures instruments the user primarily trades (e.g. ["ES", "NQ"]). */
  instruments?: string[];
  /** Social media handles. */
  socialLinks?: { twitter?: string };
  /** Subscription plan tier. */
  plan?: "free" | "pro" | "elite";
  /** Stripe customer ID for billing portal / checkout. */
  stripeCustomerId?: string;
  /** User email (from auth session — populated at load time). */
  email?: string;
  /** Max daily loss in R before kill switch activates. 0 = disabled. */
  maxDailyLoss?: string;
  /** Account balance in $ for position size calculator. */
  accountBalance?: string;
}

export interface CircleMember {
  name: string;
  handle: string;
  avatar: string;
  code: string;
  joinedAt: string;
}

export interface Circle {
  metric?: "dollar" | "r" | "winrate" | "trades" | "avgr";
  id: number;
  code: string;
  name: string;
  description: string;
  strategy: string;
  privacy: "public" | "private";
  createdBy: string;
  createdAt: string;
  members: CircleMember[];
  isOwner: boolean;
}

export interface Insight {
  kicker: string;
  text: string;
  type: "info" | "warning" | "positive" | "danger";
}

export interface StrategyDef {
  code: string;
  setups: string[];
  checklist: string[];
  rules: string[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// Strategy icons are now 2-3 letter mono codes (no emoji).
const STRATEGIES: Record<string, StrategyDef> = {
  "ICT / Smart Money": {
    code: "ICT",
    setups: ["OTE (Optimal Trade Entry)","FVG (Fair Value Gap)","Order Block","Breaker Block","Liquidity Sweep","SIBI / BISI","Silver Bullet","Judas Swing","Power of 3","MSS (Market Structure Shift)","Other"],
    checklist: ["HTF bias confirmed (Daily / 4H)","Trading in correct session window","Liquidity swept before entry","POI identified (OB / FVG / BB)","LTF confirmation at POI","Stop loss below / above structure","Minimum R:R met (2R+)","No high-impact news in window"],
    rules: ["Only trade with HTF narrative — never against it","Wait for liquidity to be taken before entry","Enter only on LTF displacement into a POI","No trades in the first 15 min of session open","Avoid trading 30 min before/after red folder news","Maximum 2 trades per session","Never move SL to breakeven before 1R is hit","If you miss the entry, let it go — no chasing"],
  },
  "Supply & Demand": {
    code: "S&D",
    setups: ["Fresh Supply Zone","Fresh Demand Zone","Rally Base Rally (RBR)","Drop Base Drop (DBD)","Rally Base Drop (RBD)","Drop Base Rally (DBR)","Zone Retest Entry","Proximal Line Touch","Distal Line Break","Engulfing at Zone","Other"],
    checklist: ["HTF trend direction identified","Zone is fresh (untested)","Strong impulsive move from zone confirmed","Proximal line clearly defined","Entry near proximal, SL beyond distal","No major S/R levels inside the zone","Minimum 3:1 R:R to next opposing zone","No news events during trade window"],
    rules: ["Only trade fresh, untested zones","The stronger the departure candle, the better the zone","Avoid zones with too many candles in the base","HTF zones take priority over LTF zones","Never enter mid-zone — wait for proximal line","If price spends too long in a zone, it's weakened","Always check what's on the other side of the zone","Scale out at 2R, let runners go to next zone"],
  },
  "Wyckoff / VSA": {
    code: "WYC",
    setups: ["Accumulation Schematic","Distribution Schematic","Spring (Phase C)","Upthrust (UT / UTAD)","Sign of Strength (SOS)","Sign of Weakness (SOW)","Last Point of Support (LPS)","Last Supply Point (LPSY)","Shakeout","Creek Break / Jump","Other"],
    checklist: ["Identified correct Wyckoff phase (A–E)","Volume confirms price action at key point","Composite Operator narrative is clear","Spring or Upthrust tested (Phase C confirmed)","No supply/demand present at entry bar (VSA)","Price above/below key creek or ice level","SOS or SOW bar confirmed on LTF","Trade aligns with higher phase structure"],
    rules: ["Never trade against the Composite Operator","Volume is king — price action without volume means nothing","Wait for Phase C confirmation before entering","A Spring must close back inside the range","High-volume narrow-spread bars signal absorption","No Demand / No Supply bars are your entry triggers","Always mark your creek/ice before the session","If you can't label the phase, stay out"],
  },
  "ORB (Opening Range Breakout)": {
    code: "ORB",
    setups: ["5-min ORB","15-min ORB","30-min ORB","1-hour ORB","Breakout + Retest","False Breakout Fade","Gap & Go","VWAP Reclaim after ORB","Pre-market High/Low Break","Other"],
    checklist: ["Opening range clearly defined (high & low marked)","Pre-market trend / gap direction noted","Volume spike on breakout candle confirmed","Price closed outside the range (no wick-only break)","VWAP alignment with breakout direction","No major news in first 30 min of session","First pullback/retest entry identified","Stop placed inside opening range"],
    rules: ["Define the opening range before the session starts","Only trade confirmed closes outside the range","Volume must expand on the breakout bar","The best ORBs have a pre-market bias — align with it","Fade false breakouts only after a full close back inside","Avoid ORBs on choppy, low-volume pre-market days","Take partial profits at 1R, trail the rest","No ORB trades after the first 90 min of the session"],
  },
};
const STRATEGY_NAMES = Object.keys(STRATEGIES);
// ─── EXTRA STRATEGIES ─────────────────────────────────────────────────────────
// Custom user-defined strategies live here so STRATEGIES itself stays immutable.
// loadAll() and saveCustomStrategies() write here instead of mutating STRATEGIES.
let _extraStrategies: Record<string, StrategyDef> = {};
function getAllStrategiesMap(): Record<string, StrategyDef> {
  return { ...STRATEGIES, ..._extraStrategies };
}
const SESSIONS = ["London","New York","Asia","London/NY Overlap","Pre-Market","After Hours"];
const BIAS = ["Bullish","Bearish","Neutral"];
const OUTCOMES = ["Win","Loss","Breakeven"];
// Text reaction markers — no emoji.
const REACTIONS = ["FIRE","GEM","UP","TARGET","PAIN","MIND"];
const TABS = ["home","log","history","stats","import","circles"];

// ─── THEME ────────────────────────────────────────────────────────────────────
// Warm editorial palette — dark primary, light secondary.
const DARK = {
  bg: "#0C0C0B",
  panel: "#161614",
  panel2: "#1E1E1B",
  border: "#2A2A26",
  border2: "#3A3A34",
  text: "#EDEDE8",
  text2: "#BCBCB4",
  muted: "#8A8A82",
  dim: "#55554F",
  accent: "#EDEDE8",   // primary CTA = text
  blue: "#89cff0",     // brand dot only
  green: "#00C96B",
  red: "#FF3D00",
  yellow: "#8A8A82",   // collapsed to muted (no more colored warnings)
  inputBg: "transparent",
  shadow: "rgba(0,0,0,0.4)",
};
const LIGHT = {
  bg: "#F5F4EF",
  panel: "#EFEEE8",
  panel2: "#E6E5DE",
  border: "#D6D4CC",
  border2: "#BEBCB3",
  text: "#1A1A17",
  text2: "#4A4A44",
  muted: "#7A7A72",
  dim: "#B1B0A8",
  accent: "#1A1A17",
  blue: "#3B7A9A",
  green: "#00A859",
  red: "#D93400",
  yellow: "#7A7A72",
  inputBg: "transparent",
  shadow: "rgba(0,0,0,0.08)",
};

const DISPLAY = "'Syne', 'Inter', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

function calcRR(e: any, s: any, t: any): string {
  const ev = parseFloat(e), sv = parseFloat(s), tv = parseFloat(t);
  // Guard against missing inputs (NaN) and division-by-zero (entry === stop loss).
  if (isNaN(ev) || isNaN(sv) || isNaN(tv)) return "";
  const risk = Math.abs(ev - sv);
  if (risk === 0) return ""; // entry === stop loss → undefined R:R
  const reward = Math.abs(tv - ev);
  const rr = reward / risk;
  // Sanity-cap: anything above 100R is almost certainly a data error.
  if (!isFinite(rr) || rr > 100) return "";
  return rr.toFixed(2);
}
function stratCode(name: string) { return getAllStrategiesMap()[name]?.code || name.slice(0, 3).toUpperCase(); }

// ─── CSV PARSING + BROKER AUTO-DETECTION ─────────────────────────────────────
// Handles quoted fields (incl. commas inside quotes) and "" escape sequences.
// Generic enough to work with MT4/MT5, TradingView, ThinkorSwim, crypto exchange exports.
function parseCSV(text: string): { headers: string[], rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let row: string[] = [], cell = "", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(v => v.trim() !== "")) lines.push(row);
        row = [];
      } else cell += ch;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(v => v.trim() !== "")) lines.push(row); }
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].map(h => h.trim());
  const rows = lines.slice(1).map(l => Object.fromEntries(headers.map((h, i) => [h, (l[i] ?? "").trim()])));
  return { headers, rows };
}

// Column-name patterns for each TRADR field. First match wins.
const CSV_FIELD_HINTS: { field: string; patterns: RegExp[] }[] = [
  { field: "pair", patterns: [/^(symbol|ticker|pair|instrument|market|contract|asset|stock|coin)s?$/i, /symbol|ticker|pair|instrument/i] },
  { field: "date", patterns: [/^(open[_\s]*time|close[_\s]*time|execution[_\s]*time|trade[_\s]*date|date[_\s]*time|timestamp|date|time)$/i, /date|time/i] },
  { field: "bias", patterns: [/^(direction|side|action|type|position|long[_\s]*\/?[_\s]*short|buy[_\s]*\/?[_\s]*sell)$/i, /direction|side/i] },
  { field: "outcome", patterns: [/^(outcome|result|status|win[_\s]*\/?[_\s]*loss|w\/?l)$/i, /outcome|result|status/i] },
  { field: "pnl", patterns: [/^(p[\s/]?[&/]?l|pnl|profit|profit[_\s]*loss|net[_\s]*p[&/]?l|realized[_\s]*p[&/]?l|net|realized|gain)$/i, /pnl|profit|p.?l/i] },
  { field: "entryPrice", patterns: [/^(entry[_\s]*price|entry|open[_\s]*price|buy[_\s]*price|avg[_\s]*entry|price[_\s]*in|fill[_\s]*price)$/i, /entry|open.*price/i] },
  { field: "slPrice", patterns: [/^(stop[_\s]*loss|stop|sl|s\/l)$/i, /stop|sl/i] },
  { field: "tpPrice", patterns: [/^(take[_\s]*profit|target|tp|t\/p|limit)$/i, /target|take.*profit|tp/i] },
  { field: "rr", patterns: [/^(r[_\s/:-]*r|risk[_\s]*reward|r[_\s]*multiple|r[_\s]*value)$/i, /risk.*reward|r:?r/i] },
  { field: "notes", patterns: [/^(note|notes|comment|comments|description|memo)$/i, /note|comment|memo/i] },
  { field: "session", patterns: [/^(session|market[_\s]*session)$/i, /session/i] },
];
function autoDetectMapping(headers: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  const used = new Set<string>();
  for (const { field, patterns } of CSV_FIELD_HINTS) {
    for (const pat of patterns) {
      const hit = headers.find(h => !used.has(h) && pat.test(h));
      if (hit) { m[field] = hit; used.add(hit); break; }
    }
  }
  return m;
}

// Normalize a bias value (buy/long/sell/short/etc) to TRADR's Bullish/Bearish/Neutral.
function normalizeBias(raw: string): string {
  const v = raw.toLowerCase();
  if (/long|buy|bull/.test(v)) return "Bullish";
  if (/short|sell|bear/.test(v)) return "Bearish";
  return "";
}
// Normalize an outcome value or derive from PnL sign.
function normalizeOutcome(raw: string, pnl: number): string {
  const v = (raw || "").toLowerCase();
  if (/win|profit|tp[_\s]*hit|target/.test(v)) return "Win";
  if (/loss|lose|sl[_\s]*hit|stop/.test(v)) return "Loss";
  if (/break[_\s]*even|be|flat/.test(v)) return "Breakeven";
  // Fallback on PnL sign.
  if (pnl > 0) return "Win";
  if (pnl < 0) return "Loss";
  if (raw || !isNaN(pnl)) return "Breakeven";
  return "";
}
function parseNum(s: string): number {
  if (!s) return NaN;
  // Strip currency symbols, commas, parens for negatives.
  const n = s.replace(/[^0-9.\-()]/g, "").replace(/\((.*)\)/, "-$1");
  return parseFloat(n);
}
// Best-effort date normalization to YYYY-MM-DD.
function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString().split("T")[0];
  // Already ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // US / EU: MM/DD/YYYY or DD/MM/YYYY or DD.MM.YYYY
  const slash = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (slash) {
    let [_, a, b, y] = slash;
    if (y.length === 2) y = "20" + y;
    // Assume DD/MM if a > 12; else MM/DD (TradingView/TOS convention).
    const aN = parseInt(a), bN = parseInt(b);
    const mm = aN > 12 ? bN : aN;
    const dd = aN > 12 ? aN : bN;
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  // Try Date constructor as last resort.
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}

// Build TRADR trade from a CSV row using a mapping, defaultStrategy applied if none.
function rowToTrade(row: Record<string, string>, mapping: Record<string, string>, defaultStrategy: string) {
  const get = (f: string) => mapping[f] ? row[mapping[f]] : "";
  const pnl = parseNum(get("pnl"));
  const trade: any = {
    id: Date.now() * 1000 + Math.floor(Math.random() * 999),
    date: normalizeDate(get("date")),
    pair: (get("pair") || "").toUpperCase(),
    session: get("session") || "",
    bias: normalizeBias(get("bias")),
    strategy: defaultStrategy || "",
    setup: "",
    entryPrice: get("entryPrice"),
    slPrice: get("slPrice"),
    tpPrice: get("tpPrice"),
    rr: get("rr") || (get("entryPrice") && get("slPrice") && get("tpPrice") ? calcRR(get("entryPrice"), get("slPrice"), get("tpPrice")) : ""),
    outcome: normalizeOutcome(get("outcome"), pnl),
    pnl: isNaN(pnl) ? "" : pnl.toFixed(2),
    notes: get("notes"),
    emotions: "",
    screenshot: "",
    comments: [],
    reactions: {},
  };
  return trade;
}
// ─── STABLE IMPORT DEDUP KEY ─────────────────────────────────────────────────
// djb2 hash over multiple fields so dedup survives edits to a single field
// (e.g. correcting an entry price after import).  The key is only used during
// CSV import — user-created trades get a Date.now() id instead.
function _djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
function tradeKey(t: any): string {
  const content = [
    t.date ?? "",
    (t.pair ?? "").toUpperCase(),
    t.entryPrice ?? "",
    t.slPrice ?? "",
    t.tpPrice ?? "",
    t.pnl ?? "",
    t.session ?? "",
  ].join("|");
  return _djb2(content);
}
function stratShort(name: string) { return name.split("(")[0].trim(); }
function fmtMonth(y: number, m: number) { return new Date(y, m, 1).toLocaleString("default", { month: "long", year: "numeric" }); }

// ─── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
// Breakpoint at 900px matches the login page. Returns true on desktop/tablet-landscape.
function useIsDesktop(breakpoint = 900) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${breakpoint}px)`).matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    // Support both modern and legacy APIs (Safari < 14).
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setIsDesktop(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [breakpoint]);
  return isDesktop;
}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────────────
// Icons replaced with short mono kicker labels.
function generateInsights(trades: Trade[]): Insight[] {
  const insights: Insight[] = [];
  if (!trades.length) return [{ kicker: "START", text: "Log your first trade to get personalised feedback.", type: "info" }];
  const wins = trades.filter(t => t.outcome === "Win").length;
  const losses = trades.filter(t => t.outcome === "Loss").length;
  const wr = trades.length ? wins / trades.length : 0;
  // Session analysis
  const sesStats: any = {};
  trades.forEach(t => { if (!t.session) return; if (!sesStats[t.session]) sesStats[t.session] = { w: 0, total: 0 }; if (t.outcome === "Win") sesStats[t.session].w++; sesStats[t.session].total++; });
  // Minimum 10 trades per session before drawing session-level conclusions —
  // 3 trades is too small a sample to be statistically meaningful.
  const SESSION_MIN = 10;
  Object.entries(sesStats).forEach(([ses, v]: any) => {
    const swr = v.w / v.total;
    if (v.total >= SESSION_MIN && swr < wr - 0.15) insights.push({ kicker: "WARN", text: `Your ${ses} session win rate (${(swr * 100).toFixed(0)}%) is below your average. Consider trading fewer setups here.`, type: "warning" });
    if (v.total >= SESSION_MIN && swr > wr + 0.15) insights.push({ kicker: "NOTE", text: `${ses} is your best session with a ${(swr * 100).toFixed(0)}% win rate. Prioritise it.`, type: "positive" });
  });
  // Strategy analysis — also requires SESSION_MIN trades before surfacing a verdict.
  const stratS: any = {};
  trades.forEach(t => { if (!t.strategy) return; if (!stratS[t.strategy]) stratS[t.strategy] = { w: 0, total: 0, pnl: 0 }; if (t.outcome === "Win") stratS[t.strategy].w++; stratS[t.strategy].total++; stratS[t.strategy].pnl += parseFloat(t.pnl) || 0; });
  let bestStrat: string | null = null, bestWR = 0;
  Object.entries(stratS).forEach(([s, v]: any) => { const swr = v.total ? v.w / v.total : 0; if (v.total >= SESSION_MIN && swr > bestWR) { bestWR = swr; bestStrat = s; } });
  if (bestStrat) insights.push({ kicker: "EDGE", text: `${stratShort(bestStrat)} is your strongest strategy at ${(bestWR * 100).toFixed(0)}% win rate.`, type: "positive" });
  // Losing streak
  let streak = 0;
  for (const t of trades) { if (t.outcome === "Loss") streak++; else break; }
  if (streak >= 3) insights.push({ kicker: "STOP", text: `You're on a ${streak}-trade losing streak. Consider stepping back and reviewing your process.`, type: "danger" });
  // Overtrading
  const byDay: any = {};
  trades.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + 1; });
  const overtradeDays = Object.values(byDay).filter((c: any) => c > 3).length;
  if (overtradeDays >= 2) insights.push({ kicker: "WARN", text: `You've exceeded 3 trades/day on ${overtradeDays} occasions. Overtrading may be hurting your results.`, type: "warning" });
  // RR analysis
  const rrTrades = trades.filter(t => t.rr);
  if (rrTrades.length >= SESSION_MIN) {
    const avgRR = rrTrades.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTrades.length;
    if (avgRR < 1.5) insights.push({ kicker: "R:R", text: `Your average R:R is ${avgRR.toFixed(2)}. Aim for 2R+ to maintain positive expectancy even at 40% win rate.`, type: "warning" });
  }
  // Positive reinforcement — only after a meaningful sample (20 trades).
  if (wr >= 0.6 && trades.length >= 20) insights.push({ kicker: "HOLD", text: `Solid consistency — ${(wr * 100).toFixed(0)}% win rate over ${trades.length} trades. Stay disciplined.`, type: "positive" });
  if (!insights.length) insights.push({ kicker: "OKAY", text: "No major issues detected. Keep journaling consistently for deeper insights.", type: "info" });
  return insights;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
// ─── TR MARK ─────────────────────────────────────────────────────────────────
function TrMark({ size = 28, bg = "#0C0C0B" }: { size?: number; bg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <rect width="100" height="100" rx="20" fill={bg}/>
      <text x="50" y="67" textAnchor="middle" fill="#EDEDE8"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontWeight="700" fontSize="52" letterSpacing="-2">tr</text>
    </svg>
  );
}

// Minimal crown badge — shown next to handle for Pro/Elite users
function CrownIcon({ size = 13, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <path d="M2 14h16M3 14L1 6l5 3.5L10 2l4 7.5L19 6l-2 8H3z"
        fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Toast({ message, onDone, C }: any) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: "calc(52px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "rise 0.25s ease", background: C.panel, border: `0.5px solid ${C.border2}`, borderRadius: "999px", padding: "9px 18px", fontSize: "10px", color: C.text2, whiteSpace: "nowrap", letterSpacing: "0.10em", fontFamily: MONO, textTransform: "uppercase" }}>
      {message}
    </div>
  );
}

// ─── MINI SPARKLINE ──────────────────────────────────────────────────────────
function MiniSparkline({ trades, C }: any) {
  if (trades.length < 2) return null;
  let r = 0;
  const pts = trades.slice().reverse().map((t: any) => { r += parseFloat(t.pnl) || 0; return r; });
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1, w = 72, h = 20;
  const p = pts.map((v: number, i: number) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return <svg width={w} height={h}><polyline points={p} fill="none" stroke={C.text} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// ─── PNL CHART ───────────────────────────────────────────────────────────────
// Editorial: thin stroke, no gradient fill, mono axis labels.
function PnLChart({ trades, C }: any) {
  if (!trades.length) return null;
  let r = 0;
  const pts: any[] = [{ x: 0, y: 0 }];
  trades.slice().reverse().forEach((t: any, i: number) => { r += parseFloat(t.pnl) || 0; pts.push({ x: i + 1, y: r }); });
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y)), rangeY = maxY - minY || 1;
  const W = 320, H = 96, PAD = 8;
  const cx = (x: number) => PAD + (x / (pts.length - 1 || 1)) * (W - PAD * 2);
  const cy = (y: number) => H - PAD - ((y - minY) / rangeY) * (H - PAD * 2);
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${cx(p.x)},${cy(p.y)}`).join(" ");
  const zeroY = cy(0);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {zeroY > PAD && zeroY < H - PAD && <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={C.border} strokeWidth="1" strokeDasharray="2,3" />}
      <path d={pathD} fill="none" stroke={C.text} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      {pts[pts.length - 1] && <circle cx={cx(pts[pts.length - 1].x)} cy={cy(pts[pts.length - 1].y)} r="2" fill={C.text} />}
    </svg>
  );
}

// ─── MONTHLY PNL CHART ───────────────────────────────────────────────────────
function MonthlyPnLChart({ trades, C }: any) {
  const monthly: any = {};
  trades.forEach((t: any) => { const k = t.date?.slice(0, 7); if (k) { if (!monthly[k]) monthly[k] = 0; monthly[k] += parseFloat(t.pnl) || 0; } });
  const entries = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  if (entries.length < 2) return null;
  const vals = entries.map(([, v]: any) => v);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 0), range = max - min || 1;
  const W = 320, H = 96, PAD = 8, barW = Math.max(14, (W - PAD * 2) / entries.length - 10);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`}>
      {entries.map(([k, v]: any, i) => {
        const x = PAD + i * (W - PAD * 2) / entries.length + (W - PAD * 2) / entries.length / 2 - barW / 2;
        const zeroY = H - PAD - ((0 - min) / range) * (H - PAD * 2);
        const barH = Math.abs((v / range) * (H - PAD * 2));
        const y = v >= 0 ? zeroY - barH : zeroY;
        const col = v >= 0 ? C.green : C.red;
        return (
          <g key={k}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 2)} fill={col} />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="8" fill={C.muted} fontFamily="IBM Plex Mono" style={{ letterSpacing: "0.06em" }}>{k.slice(5)}</text>
          </g>
        );
      })}
      <line x1={PAD} y1={H - PAD - ((0 - min) / range) * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - ((0 - min) / range) * (H - PAD * 2)} stroke={C.border} strokeWidth="1" strokeDasharray="2,3" />
    </svg>
  );
}

// ─── WIN RATE BAR CHART ──────────────────────────────────────────────────────
// Hairline bar (1-2px), C.text fill, C.border track. No color per strategy.
function WinRateChart({ trades, C }: any) {
  const stratStats: any = {};
  trades.forEach((t: any) => { if (!t.strategy) return; if (!stratStats[t.strategy]) stratStats[t.strategy] = { w: 0, total: 0 }; if (t.outcome === "Win") stratStats[t.strategy].w++; stratStats[t.strategy].total++; });
  const entries = Object.entries(stratStats).filter(([, v]: any) => v.total >= 1);
  if (!entries.length) return <div style={{ fontSize: "12px", color: C.muted, padding: "16px 0", fontFamily: BODY }}>Log trades with a strategy to see win rates.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {entries.map(([s, v]: any, idx) => {
        const wr = v.total ? v.w / v.total : 0;
        return (
          <div key={s}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: C.text, fontFamily: MONO, letterSpacing: "0.06em" }}>
                <span style={{ color: C.muted, marginRight: "10px" }}>{String(idx + 1).padStart(2, "0")}</span>
                {stratCode(s)} <span style={{ color: C.muted, marginLeft: "6px" }}>— {stratShort(s)}</span>
              </span>
              <span style={{ fontSize: "11px", color: C.text, fontFamily: MONO, letterSpacing: "0.06em" }}>{(wr * 100).toFixed(0)}% <span style={{ color: C.muted }}>({v.total})</span></span>
            </div>
            <div style={{ background: C.border, height: "2px", width: "100%" }}>
              <div style={{ background: C.text, height: "2px", width: `${wr * 100}%`, transition: "width 0.6s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ─── DURATION HELPERS ────────────────────────────────────────────────────────
const DURATION_BUCKETS = [
  { label: "Under 15 sec", min: 0, max: 15 },
  { label: "15-45 sec", min: 15, max: 45 },
  { label: "45 sec - 1 min", min: 45, max: 60 },
  { label: "1 min - 2 min", min: 60, max: 120 },
  { label: "2 min - 5 min", min: 120, max: 300 },
  { label: "5 min - 10 min", min: 300, max: 600 },
  { label: "10 min - 30 min", min: 600, max: 1800 },
  { label: "30 min - 1 hour", min: 1800, max: 3600 },
  { label: "1 hour - 2 hours", min: 3600, max: 7200 },
  { label: "2 hours - 4 hours", min: 7200, max: 14400 },
  { label: "4 hours and up", min: 14400, max: Infinity },
];
function parseDurationSec(entryTime: string | undefined, exitTime: string | undefined): number | null {
  if (!entryTime || !exitTime) return null;
  const ep = entryTime.split(":"); const xp = exitTime.split(":");
  const eh = parseInt(ep[0]); const em = parseInt(ep[1]);
  const xh = parseInt(xp[0]); const xm = parseInt(xp[1]);
  if (isNaN(eh)||isNaN(em)||isNaN(xh)||isNaN(xm)) return null;
  const en = eh * 3600 + em * 60; let ex = xh * 3600 + xm * 60;
  if (ex < en) ex += 86400;
  return ex - en;
}
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
  return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
}

// ─── TRADE DURATION CHART ─────────────────────────────────────────────────────
function TradeDurationChart({ trades, C }: any) {
  const withDur = trades.map((t: any) => ({ ...t, _dur: parseDurationSec(t.entryTime, t.exitTime) })).filter((t: any) => t._dur !== null);
  if (!withDur.length) return <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:"11px", fontFamily:MONO, letterSpacing:"0.06em" }}>ADD ENTRY + EXIT TIME WHEN LOGGING TRADES TO SEE DURATION ANALYSIS</div>;
  const bd = DURATION_BUCKETS.map(b => {
    const bk = withDur.filter((t: any) => t._dur >= b.min && t._dur < b.max);
    const w = bk.filter((t: any) => t.outcome === "Win").length;
    const l = bk.filter((t: any) => t.outcome === "Loss").length;
    return { ...b, count: bk.length, wr: (w+l) > 0 ? Math.round(w/(w+l)*100) : null };
  });
  const mx = Math.max(...bd.map(b => b.count), 1);
  const LW = 124;
  const barRow = (label: string, pct: number, val: string, color: string) => (
    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"7px" }}>
      <div style={{ width:`${LW}px`, fontSize:"9px", color:C.muted, fontFamily:MONO, textAlign:"right", flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, height:"22px", background:C.panel2, borderRadius:"3px", overflow:"hidden" }}>
        {pct > 0 && <div style={{ height:"100%", width:`${Math.max(pct,5)}%`, background:color, borderRadius:"3px", display:"flex", alignItems:"center", paddingLeft:"6px" }}>
          <span style={{ fontFamily:MONO, fontSize:"10px", color:"#0C0C0B", fontWeight:700 }}>{val}</span>
        </div>}
      </div>
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
      <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
        <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", marginBottom:"12px", color:C.text }}>Trade Count</div>
        {bd.map(b => barRow(b.label, b.count/mx*100, String(b.count), "#5BC2E7"))}
      </div>
      <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
        <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", marginBottom:"12px", color:C.text }}>Win Rate</div>
        {bd.map(b => barRow(b.label, b.wr ?? 0, b.wr !== null && b.count > 0 ? String(b.wr) : "", C.green))}
      </div>
    </div>
  );
}

// ─── NET DAILY P&L ───────────────────────────────────────────────────────────
function NetDailyPnLChart({ trades, C, useDollar }: any) {
  const dm: Record<string,number> = {};
  trades.forEach((t: any) => { if (!t.date) return; dm[t.date] = (dm[t.date]||0) + (useDollar ? parseFloat(t.pnlDollar)||0 : parseFloat(t.pnl)||0); });
  const days = Object.keys(dm).sort().slice(-30);
  if (!days.length) return null;
  const vals = days.map(d => dm[d]);
  const maxA = Math.max(...vals.map(v => Math.abs(v)), 0.1);
  const bW = Math.max(12, Math.min(40, Math.floor(560/days.length)-3));
  return (
    <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
      <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", color:C.text, marginBottom:"4px" }}>Net Daily P&L</div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, marginBottom:"12px", letterSpacing:"0.06em" }}>{useDollar?"DOLLAR":"R-MULTIPLE"} · LAST {days.length} DAYS</div>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:"3px", height:"100px", minWidth:`${days.length*(bW+3)}px` }}>
          {vals.map((v,i) => {
            const h = Math.max(Math.abs(v)/maxA*90,2);
            return <div key={days[i]} title={`${days[i]}: ${v>=0?"+":""}${v.toFixed(2)}`} style={{ flex:`0 0 ${bW}px`, height:"100%", display:"flex", alignItems:v>=0?"flex-end":"flex-start" }}>
              <div style={{ width:"100%", height:`${h}%`, background:v>=0?C.green:C.red, borderRadius:v>=0?"3px 3px 0 0":"0 0 3px 3px" }} />
            </div>;
          })}
        </div>
        <div style={{ display:"flex", gap:"3px", marginTop:"4px", minWidth:`${days.length*(bW+3)}px` }}>
          {days.map((d,i) => <div key={d} style={{ flex:`0 0 ${bW}px`, textAlign:"center", fontSize:"8px", color:C.muted, fontFamily:MONO }}>{i%Math.max(1,Math.floor(days.length/7))===0?d.slice(5):""}</div>)}
        </div>
      </div>
    </div>
  );
}

// ─── CUMULATIVE P&L LINE ─────────────────────────────────────────────────────
function DailyCumulativePnLChart({ trades, C, useDollar }: any) {
  const dm: Record<string,number> = {};
  trades.forEach((t: any) => { if (!t.date) return; dm[t.date] = (dm[t.date]||0) + (useDollar ? parseFloat(t.pnlDollar)||0 : parseFloat(t.pnl)||0); });
  const days = Object.keys(dm).sort();
  if (days.length < 2) return null;
  let cum = 0;
  const pts = days.map(d => { cum += dm[d]; return cum; });
  const minV = Math.min(...pts, 0); const maxV = Math.max(...pts, 0.01); const range = maxV - minV || 1;
  const W=520,H=100,P=6;
  const toX = (i: number) => P + i*(W-P*2)/Math.max(pts.length-1,1);
  const toY = (v: number) => P + (maxV-v)/range*(H-P*2);
  const ln = pts.map((v,i)=>`${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const z0 = toY(0);
  const fill = `${ln} L${toX(pts.length-1).toFixed(1)},${z0.toFixed(1)} L${toX(0).toFixed(1)},${z0.toFixed(1)} Z`;
  const last = pts[pts.length-1]; const pos = last >= 0;
  return (
    <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:"4px" }}>
        <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", color:C.text }}>Daily Cumulative PnL</div>
        <div style={{ fontFamily:MONO, fontSize:"12px", color:pos?C.green:C.red }}>{pos?"+":""}{last.toFixed(2)}{useDollar?"$":"R"}</div>
      </div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, marginBottom:"10px", letterSpacing:"0.06em" }}>{useDollar?"DOLLAR":"R-MULTIPLE"}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display:"block", height:"100px" }}>
        <line x1={P} y1={z0} x2={W-P} y2={z0} stroke={C.border2} strokeWidth="1" strokeDasharray="4,3"/>
        <path d={fill} fill={pos?C.green:C.red} fillOpacity="0.12"/>
        <path d={ln} fill="none" stroke={pos?C.green:C.red} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        <circle cx={toX(pts.length-1)} cy={toY(last)} r="3.5" fill={pos?C.green:C.red}/>
      </svg>
    </div>
  );
}

// ─── TRADE STAT CARDS ────────────────────────────────────────────────────────
function TradeStatCards({ trades, C }: any) {
  const withDur = trades.map((t: any) => ({...t, _d: parseDurationSec(t.entryTime,t.exitTime)})).filter((t: any) => t._d !== null);
  const avgSec = withDur.length ? Math.round(withDur.reduce((a: number,t: any)=>a+t._d,0)/withDur.length) : null;
  const dm: Record<string,number> = {};
  trades.forEach((t: any) => { if (t.date) dm[t.date] = (dm[t.date]||0)+(parseFloat(t.pnl)||0); });
  const tot = Object.values(dm).reduce((a,v)=>a+v,0);
  const best = Math.max(...Object.values(dm),0);
  const pct = tot>0 ? Math.round(best/tot*100) : 0;
  const DNS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dc: Record<string,number> = {};
  trades.forEach((t: any) => { if (!t.date) return; const n=DNS[new Date(t.date+"T12:00:00").getDay()]; dc[n]=(dc[n]||0)+1; });
  const mad = Object.keys(dc).sort((a,b)=>dc[b]-dc[a])[0]||"—";
  const bde = Object.entries(dm).sort((a,b)=>b[1]-a[1])[0];
  const bdt = bde ? trades.filter((t: any)=>t.date===bde[0]) : [];
  const cards: Array<{label:string;value:string;sub?:string}> = [
    {label:"Total Number Of Trades",value:String(trades.length)},
    {label:"Avg. Trade Duration",value:avgSec!==null?fmtDuration(avgSec):"—"},
    {label:"Best Day % Of Total Profit",value:String(pct)},
    {label:"Most Active Day",value:mad,sub:bde?`Date: ${bde[0]}  Trades: ${bdt.length}  Winning: ${bdt.filter((t: any)=>t.outcome==="Win").length}`:""},
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"10px" }}>
      {cards.map(c=>(
        <div key={c.label} style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
          <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"8px", lineHeight:1.4 }}>{c.label}</div>
          <div style={{ fontSize:"24px", fontWeight:700, fontFamily:DISPLAY, color:C.text, letterSpacing:"-0.02em", lineHeight:1 }}>{c.value}</div>
          {c.sub && <div style={{ fontSize:"9px", color:C.muted, fontFamily:MONO, marginTop:"7px", lineHeight:1.5 }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── AVERAGE STATS CARDS ─────────────────────────────────────────────────────
function AvgStatsCards({ trades, C }: any) {
  const wins = trades.filter((t: any)=>t.outcome==="Win");
  const losses = trades.filter((t: any)=>t.outcome==="Loss");
  const gp = wins.reduce((a: number,t: any)=>a+Math.max(parseFloat(t.pnl)||0,0),0);
  const gl = Math.abs(losses.reduce((a: number,t: any)=>a+Math.min(parseFloat(t.pnl)||0,0),0));
  const pfN = gl>0?gp/gl:(gp>0?99:0);
  const pfS = gl>0?pfN.toFixed(2):(gp>0?"∞":"0");
  const el = trades.filter((t: any)=>t.outcome==="Win"||t.outcome==="Loss");
  const wr = el.length ? Math.round(wins.length/el.length*100) : 0;
  const aw = wins.length ? wins.reduce((a: number,t: any)=>a+(parseFloat(t.pnl)||0),0)/wins.length : 0;
  const al = losses.length ? Math.abs(losses.reduce((a: number,t: any)=>a+(parseFloat(t.pnl)||0),0)/losses.length) : 0;
  const wlS = al>0?(aw/al).toFixed(2):(aw>0?"∞":"0");
  const lo = trades.filter((t: any)=>t.direction==="Long"||(!t.direction&&t.bias==="Bullish")).length;
  const sh = trades.filter((t: any)=>t.direction==="Short"||(!t.direction&&t.bias==="Bearish")).length;
  const td = lo+sh||1;
  const lp = Math.round(lo/td*100); const sp = 100-lp;
  const ring = (pct: number, col: string) => {
    const r=22,c=2*Math.PI*r,d=pct/100*c;
    return <svg width="52" height="52" viewBox="0 0 52 52" style={{flexShrink:0}}>
      <circle cx="26" cy="26" r={r} fill="none" stroke={C.panel2} strokeWidth="5"/>
      <circle cx="26" cy="26" r={r} fill="none" stroke={col} strokeWidth="5" strokeDasharray={`${d} ${c-d}`} strokeDashoffset={c/4} strokeLinecap="round"/>
    </svg>;
  };
  const cards = [
    {label:"Profit Factor",val:pfS,pct:Math.min(pfN/4*100,100),col:C.green,subs:[{l:"Total Profit",v:`${gp.toFixed(1)}R`,c:C.green},{l:"Total Loss",v:`${gl.toFixed(1)}R`,c:C.red}],dir:null},
    {label:"Trade Win",val:String(wr),pct:wr,col:C.green,subs:[{l:"Win Count",v:String(wins.length),c:C.green},{l:"Loss Count",v:String(losses.length),c:C.red}],dir:null},
    {label:"Avg. Win To Loss",val:wlS,pct:Math.min(parseFloat(wlS)/4*100,100)||0,col:C.green,subs:[{l:"Avg. Win",v:`${aw.toFixed(2)}R`,c:C.green},{l:"Avg. Loss",v:`${al.toFixed(2)}R`,c:C.red}],dir:null},
    {label:"Trade Direction",val:String(lp),pct:null,col:C.green,subs:[{l:"Long",v:String(lo),c:C.green},{l:"Short",v:String(sh),c:C.red}],dir:{lo:lp,sh:sp}},
  ];
  return (
    <div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"12px" }}>Additional Averages</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"10px" }}>
        {cards.map(c=>(
          <div key={c.label} style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
            <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"10px" }}>{c.label}</div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"10px" }}>
              <div style={{ fontSize:"26px", fontWeight:700, fontFamily:DISPLAY, color:C.text, letterSpacing:"-0.02em", lineHeight:1 }}>{c.val}</div>
              {c.pct!==null && ring(c.pct, c.col)}
              {c.dir && <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"4px" }}>
                <div style={{ height:"14px", borderRadius:"3px", overflow:"hidden", background:C.panel2 }}><div style={{ width:`${c.dir.lo}%`, height:"100%", background:C.green }}/></div>
                <div style={{ height:"14px", borderRadius:"3px", overflow:"hidden", background:C.panel2 }}><div style={{ width:`${c.dir.sh}%`, height:"100%", background:C.red }}/></div>
              </div>}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"3px" }}>
              {c.subs.map((s: any)=>(
                <div key={s.l} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                  <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:s.c, flexShrink:0 }}/>
                  <span style={{ fontSize:"9px", color:C.muted, fontFamily:MONO }}>{s.l}</span>
                  <span style={{ fontSize:"9px", color:C.text2, fontFamily:MONO, marginLeft:"auto" }}>{s.v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DAILY INSIGHTS ───────────────────────────────────────────────────────────
function DailyInsights({ trades, C, useDollar }: any) {
  if (!trades.length) return null;
  const dm: Record<string,{pnl:number;dlr:number}> = {};
  trades.forEach((t: any) => { if (!t.date) return; if (!dm[t.date]) dm[t.date]={pnl:0,dlr:0}; dm[t.date].pnl+=parseFloat(t.pnl)||0; dm[t.date].dlr+=parseFloat(t.pnlDollar)||0; });
  const days = Object.keys(dm).sort(); if (!days.length) return null;
  const fday = (d: string) => { try { return new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"long"}); } catch { return d; } };
  const fval = (d: string) => useDollar&&dm[d].dlr ? `$${dm[d].dlr.toFixed(2)}` : `${dm[d].pnl.toFixed(2)}R`;
  const best = days.reduce((a,b)=>dm[a].pnl>=dm[b].pnl?a:b,days[0]);
  const worst = days.reduce((a,b)=>dm[a].pnl<=dm[b].pnl?a:b,days[0]);
  const wt = trades.filter((t: any)=>t.outcome==="Win"&&parseFloat(t.pnl)>0);
  const lt = trades.filter((t: any)=>t.outcome==="Loss"&&parseFloat(t.pnl)<0);
  const bt = wt.length ? wt.reduce((a: any,b: any)=>parseFloat(a.pnl)>=parseFloat(b.pnl)?a:b) : null;
  const wort = lt.length ? lt.reduce((a: any,b: any)=>parseFloat(a.pnl)<=parseFloat(b.pnl)?a:b) : null;
  const ftv = (t: any) => useDollar&&t.pnlDollar ? `$${Math.abs(parseFloat(t.pnlDollar)).toFixed(1)}` : `${Math.abs(parseFloat(t.pnl)).toFixed(1)}R`;
  const cards = [
    {label:"Most Profitable Day",primary:fval(best),secondary:fday(best),sub:"",color:C.green},
    {label:"Less Profitable Day",primary:fval(worst),secondary:fday(worst),sub:"",color:C.red},
    bt?{label:"Best Trade",primary:ftv(bt),secondary:`${bt.direction||bt.bias||""} ${bt.pair}`.trim(),sub:bt.date,color:C.green}:null,
    wort?{label:"Worst Trade",primary:ftv(wort),secondary:`${wort.direction||wort.bias||""} ${wort.pair}`.trim(),sub:wort.date,color:C.red}:null,
  ].filter(Boolean);
  return (
    <div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"12px" }}>Daily Insights</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"10px" }}>
        {cards.map((c: any)=>(
          <div key={c.label} style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
            <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"10px" }}>{c.label}</div>
            <div style={{ fontSize:"24px", fontWeight:700, fontFamily:DISPLAY, color:c.color, letterSpacing:"-0.02em", lineHeight:1.1, marginBottom:"5px" }}>{c.primary}</div>
            <div style={{ fontSize:"13px", fontWeight:600, color:C.text, fontFamily:BODY }}>{c.secondary}</div>
            {c.sub && <div style={{ fontSize:"9px", color:C.muted, fontFamily:MONO, marginTop:"4px" }}>{c.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────
function CalendarView({ trades, C, onDayClick }: any) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const dayPnL: any = {};
  trades.forEach((t: any) => { if (t.date) { if (!dayPnL[t.date]) dayPnL[t.date] = { pnl: 0, count: 0 }; dayPnL[t.date].pnl += parseFloat(t.pnl) || 0; dayPnL[t.date].count++; } });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: any[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const navBtn: React.CSSProperties = { background: "none", border: "none", color: C.text, padding: "6px 10px", cursor: "pointer", fontFamily: MONO, fontSize: "12px", letterSpacing: "0.06em" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: `1px solid ${C.border}`, paddingBottom: "10px" }}>
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={navBtn}>‹</button>
        <span style={{ fontSize: "11px", color: C.text, fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase" }}>{fmtMonth(year, month)}</span>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBottom: "4px" }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "11px", color: C.muted, padding: "4px 0", fontFamily: MONO, letterSpacing: "0.08em" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px" }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const data = dayPnL[key];
          const isToday = key === new Date().toISOString().split("T")[0];
          const textCol = data ? (data.pnl > 0 ? C.green : data.pnl < 0 ? C.red : C.muted) : C.muted;
          return (
            <div key={i} onClick={() => data && onDayClick(key)}
              style={{ border: `1px solid ${isToday ? C.text : C.border}`, padding: "6px 3px", textAlign: "center", cursor: data ? "pointer" : "default", minHeight: "44px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "2px", background: "transparent" }}>
              <div style={{ fontSize: "11px", color: isToday ? C.text : C.text2, fontFamily: MONO }}>{d}</div>
              {data && <div style={{ fontSize: "10px", color: textCol, fontFamily: MONO, letterSpacing: "0.04em" }}>{data.pnl >= 0 ? "+" : ""}{data.pnl.toFixed(1)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AVATAR ──────────────────────────────────────────────────────────────────
function AvatarCircle({ name, avatar, size = 40, color, onClick, C }: any) {
  const initials = (name || "TR").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const col = color || (C?.text ?? "#EDEDE8");
  const border = C?.border2 ?? "#3A3A34";
  const bg = C?.panel ?? "#161614";
  const style: React.CSSProperties = { width: size, height: size, borderRadius: "50%", border: `1px solid ${border}`, flexShrink: 0, cursor: onClick ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", objectFit: "cover" };
  const safeAvatar = avatar && (avatar.startsWith("data:image/") || avatar.startsWith("https://")) ? avatar : null;
  // Emoji avatar: short string that isn't a URL or data URI
  const isEmoji = avatar && !safeAvatar && avatar.length <= 8;
  if (safeAvatar) return <img src={safeAvatar} alt="av" style={style} onClick={onClick} />;
  return (
    <div style={{ ...style, background: bg }} onClick={onClick}>
      {isEmoji
        ? <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{avatar}</span>
        : <span style={{ fontSize: size * 0.34, color: col, letterSpacing: "0.04em", fontFamily: MONO }}>{initials}</span>
      }
    </div>
  );
}

// ─── IMAGE COMPRESS ──────────────────────────────────────────────────────────
function compressImage(file: File, maxSize = 600): Promise<string> {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = (e.target as any).result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── BADGE ───────────────────────────────────────────────────────────────────
// Collapsed to uppercase mono 11px, 0.06em tracking, optional single color.
function Badge({ color, children, C }: any) {
  const col = color === "win" ? C.green : color === "loss" ? C.red : color === "be" ? C.muted : color === "accent" ? C.text : C.muted;
  return <span style={{ color: col, fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: MONO, whiteSpace: "nowrap" }}>{children}</span>;
}

function outcomeColor(outcome: string, C: any) {
  return outcome === "Win" ? C.green : outcome === "Loss" ? C.red : C.muted;
}
function outcomeLetter(outcome: string) {
  return outcome === "Win" ? "W" : outcome === "Loss" ? "L" : outcome === "Breakeven" ? "BE" : "—";
}

// ─── STRATEGY PILL ───────────────────────────────────────────────────────────
// Mono lettered kicker, no emoji. Pill shape, borderRadius 999px.
function StrategyPill({ name, selected, onClick, C }: any) {
  return (
    <button onClick={onClick} style={{
      background: selected ? C.text : "transparent",
      border: `1px solid ${selected ? C.text : C.border2}`,
      borderRadius: "999px",
      padding: "10px 16px",
      minHeight: "44px",
      cursor: "pointer",
      fontFamily: MONO,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "opacity 0.15s, transform 0.15s",
      whiteSpace: "nowrap",
      color: selected ? C.bg : C.text,
    }}>
      <span style={{ fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500 }}>{stratCode(name)}</span>
      <span style={{ fontSize: "11px", color: selected ? C.bg : C.muted, letterSpacing: "0.02em" }}>{stratShort(name)}</span>
    </button>
  );
}

// ─── STRATEGY SELECT ─────────────────────────────────────────────────────────
// Compact pill-shaped dropdown. Replaces pill rows where strategy is a *selector*
// (not a form input). Scales to any number of strategies including custom ones.
function StrategySelect({ strategies, value, onChange, C, align = "left" }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => {
    function onDoc(e: any) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px",
        padding: "7px 14px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, display: "inline-flex",
        alignItems: "center", gap: "8px", whiteSpace: "nowrap", color: C.text,
      }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500 }}>{stratCode(value)}</span>
        <span style={{ fontSize: "11px", color: C.muted, letterSpacing: "0.02em" }}>{stratShort(value)}</span>
        <span style={{ fontSize: "10px", color: C.muted, marginLeft: "2px" }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", [align]: 0, zIndex: 50,
          minWidth: "220px", background: C.panel, border: `1px solid ${C.border2}`,
          borderRadius: "12px", padding: "6px", boxShadow: `0 8px 24px ${C.shadow}`,
          maxHeight: "320px", overflowY: "auto",
        }}>
          {strategies.map((s: string) => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }} style={{
              display: "flex", width: "100%", alignItems: "center", gap: "10px",
              background: s === value ? C.panel2 : "transparent", border: "none",
              borderRadius: "8px", padding: "11px 11px", minHeight: "44px", cursor: "pointer", textAlign: "left",
              fontFamily: MONO, color: C.text,
            }}>
              <span style={{ fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500, minWidth: "34px" }}>{stratCode(s)}</span>
              <span style={{ fontSize: "12px", color: C.text2, letterSpacing: "0.02em" }}>{stratShort(s)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUB-NAV DROPDOWN ────────────────────────────────────────────────────────
// Compact dropdown for the current section's sub-views. Lives inside the desktop
// top-nav on the right, so main-nav + sub-nav collapse from 2 rows to 1.
function SubNavDropdown({ sections, value, onChange, C }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => {
    function onDoc(e: any) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const current = sections.find((s: any) => s.id === value);
  if (!current) return null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px",
        padding: "6px 12px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, display: "inline-flex",
        alignItems: "center", gap: "8px", whiteSpace: "nowrap", color: C.text,
        fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        <span>{current.label}</span>
        <span style={{ fontSize: "9px", color: C.muted }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          minWidth: "180px", background: C.panel, border: `1px solid ${C.border2}`,
          borderRadius: "12px", padding: "6px", boxShadow: `0 8px 24px ${C.shadow}`,
        }}>
          {sections.map((s: any) => (
            <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }} style={{
              display: "flex", alignItems: "center", width: "100%", background: s.id === value ? C.panel2 : "transparent",
              border: "none", borderRadius: "8px", padding: "9px 11px", minHeight: "44px", cursor: "pointer",
              textAlign: "left", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em",
              textTransform: "uppercase", color: s.id === value ? C.text : C.text2,
            }}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GEAR BUTTON ─────────────────────────────────────────────────────────────
// Small circular icon button rendered next to SubNavDropdown. Clicking it jumps
// the user to Home → Settings. Replaces the old "Settings" entry in the sub-nav.
function GearButton({ onClick, active, C }: any) {
  return (
    <button onClick={onClick} title="Settings"
      style={{
        background: active ? C.text : "transparent",
        color: active ? C.bg : C.muted,
        border: `1px solid ${active ? C.text : C.border2}`,
        borderRadius: "999px",
        width: "44px", height: "44px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0, flexShrink: 0,
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

// ─── STRATEGY EDITOR ─────────────────────────────────────────────────────────
// Inline panel for creating/editing a user-defined strategy. Parity with built-ins:
// name, code, setups, checklist items, rules.
function StrategyEditor({ draft, setDraft, onSave, onCancel, isEdit, C, inp, lbl }: any) {
  const [newSetup, setNewSetup] = useState("");
  const [newCheck, setNewCheck] = useState("");
  const [newRule, setNewRule] = useState("");
  const addSetup = () => { if (!newSetup.trim()) return; setDraft((d: any) => ({ ...d, setups: [...d.setups, newSetup.trim()] })); setNewSetup(""); };
  const removeSetup = (i: number) => setDraft((d: any) => ({ ...d, setups: d.setups.filter((_: any, idx: number) => idx !== i) }));
  const addCheck = () => { if (!newCheck.trim()) return; setDraft((d: any) => ({ ...d, checklist: [...d.checklist, { id: Date.now() * 1000 + Math.floor(Math.random() * 999), text: newCheck.trim() }] })); setNewCheck(""); };
  const removeCheck = (id: any) => setDraft((d: any) => ({ ...d, checklist: d.checklist.filter((x: any) => x.id !== id) }));
  const addRule = () => { if (!newRule.trim()) return; setDraft((d: any) => ({ ...d, rules: [...d.rules, { id: Date.now() * 1000 + Math.floor(Math.random() * 999), text: newRule.trim() }] })); setNewRule(""); };
  const removeRule = (id: any) => setDraft((d: any) => ({ ...d, rules: d.rules.filter((x: any) => x.id !== id) }));

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: `1px solid ${C.border}` };
  const xBtn: React.CSSProperties = { background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "11px" };
  const addBtn: React.CSSProperties = { background: "transparent", border: `1px dashed ${C.border2}`, borderRadius: "8px", padding: "10px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, width: "100%", textAlign: "left" };

  return (
    <div style={{ border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "20px", background: C.panel, display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {isEdit ? "EDIT STRATEGY" : "NEW STRATEGY"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <div>
          <label style={lbl}>Name</label>
          <input value={draft.name} onChange={e => setDraft((d: any) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. 15-min Scalper" style={inp} />
        </div>
        <div>
          <label style={lbl}>Code (2-4 chars)</label>
          <input value={draft.code} onChange={e => setDraft((d: any) => ({ ...d, code: e.target.value.toUpperCase().slice(0, 4) }))}
            placeholder="e.g. SCLP" style={inp} maxLength={4} />
        </div>
      </div>

      <div>
        <label style={lbl}>Setups (optional)</label>
        <div>
          {draft.setups.map((s: string, i: number) => (
            <div key={i} style={row}>
              <span style={{ flex: 1, fontSize: "14px", color: C.text, fontFamily: BODY }}>{s}</span>
              <button onClick={() => removeSetup(i)} style={xBtn}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input value={newSetup} onChange={e => setNewSetup(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addSetup(); }}
            placeholder="Add a setup…" style={inp} />
          <button onClick={addSetup} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em" }}>ADD</button>
        </div>
      </div>

      <div>
        <label style={lbl}>Pre-trade checklist</label>
        <div>
          {draft.checklist.map((c: any) => (
            <div key={c.id} style={row}>
              <span style={{ flex: 1, fontSize: "14px", color: C.text, fontFamily: BODY }}>{c.text}</span>
              <button onClick={() => removeCheck(c.id)} style={xBtn}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input value={newCheck} onChange={e => setNewCheck(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addCheck(); }}
            placeholder="Add a checklist item…" style={inp} />
          <button onClick={addCheck} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em" }}>ADD</button>
        </div>
      </div>

      <div>
        <label style={lbl}>Rules</label>
        <div>
          {draft.rules.map((r: any) => (
            <div key={r.id} style={row}>
              <span style={{ flex: 1, fontSize: "14px", color: C.text, fontFamily: BODY }}>{r.text}</span>
              <button onClick={() => removeRule(r.id)} style={xBtn}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input value={newRule} onChange={e => setNewRule(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addRule(); }}
            placeholder="Add a rule…" style={inp} />
          <button onClick={addRule} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em" }}>ADD</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Cancel</button>
        <button onClick={onSave} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{isEdit ? "Save" : "Create"}</button>
      </div>
    </div>
  );
}

// ─── CSV IMPORT PANEL ────────────────────────────────────────────────────────
// File picker → parse → auto-detect mapping → preview + per-column override → import.
// Dedupes against existing trades on date+pair+entryPrice.
// ─── CSV broker presets ──────────────────────────────────────────────────────
// Each preset maps TRADR field keys → exact column header strings as they appear
// in that broker's export. The user loads the file first, then picks a preset
// to override the auto-detected mapping.
const CSV_PRESETS: Record<string, { label: string; hint: string; mapping: Record<string, string> }> = {
  rithmic: {
    label: "Rithmic",
    hint: "Apex / TopstepX / Earn2Trade prop firm CSV (Trade Route statement)",
    mapping: {
      pair:       "Symbol",
      date:       "Date",
      bias:       "Side",
      pnl:        "Net P&L",
      entryPrice: "Fill Price",
      notes:      "Account",
    },
  },
  tradingview: {
    label: "TradingView",
    hint: "TradingView strategy tester or live paper-trading export",
    mapping: {
      pair:       "Symbol",
      date:       "Date/Time",
      bias:       "Type",
      pnl:        "Profit",
      entryPrice: "Price",
      rr:         "Run-up",
    },
  },
  mt4: {
    label: "MT4 / MT5",
    hint: "MetaTrader account history export",
    mapping: {
      pair:       "Symbol",
      date:       "Open Time",
      bias:       "Type",
      pnl:        "Profit",
      entryPrice: "Open Price",
      slPrice:    "S / L",
      tpPrice:    "T / P",
      notes:      "Comment",
    },
  },
};

function CsvImportPanel({ existingTrades, onImport, onClose, allStrategyNames, C, inp, sel, lbl }: any) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultStrategy, setDefaultStrategy] = useState("");
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function applyPreset(presetKey: string) {
    const preset = CSV_PRESETS[presetKey];
    if (!preset) return;
    // Only map fields whose target column actually exists in the loaded file.
    const resolved: Record<string, string> = {};
    for (const [field, col] of Object.entries(preset.mapping)) {
      // Case-insensitive match against loaded headers.
      const hit = headers.find(h => h.toLowerCase() === col.toLowerCase());
      if (hit) resolved[field] = hit;
    }
    setMapping(prev => ({ ...prev, ...resolved }));
    setActivePreset(presetKey);
  }

  function handleFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setActivePreset(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const { headers: h, rows: r } = parseCSV(text);
        if (!h.length || !r.length) { setError("CSV looks empty. Double-check the file."); return; }
        setHeaders(h);
        setRows(r);
        setMapping(autoDetectMapping(h));
        setError("");
      } catch (err: any) { setError("Couldn't parse CSV: " + (err?.message || "unknown error")); }
    };
    reader.readAsText(file);
  }

  const fields = [
    { key: "date", label: "Date", required: true },
    { key: "pair", label: "Pair / Symbol", required: true },
    { key: "outcome", label: "Outcome", required: false },
    { key: "pnl", label: "P&L", required: false },
    { key: "entryPrice", label: "Entry price", required: false },
    { key: "slPrice", label: "Stop loss", required: false },
    { key: "tpPrice", label: "Take profit", required: false },
    { key: "rr", label: "R:R", required: false },
    { key: "bias", label: "Direction / side", required: false },
    { key: "session", label: "Session", required: false },
    { key: "notes", label: "Notes", required: false },
  ];

  const existingKeys = new Set(existingTrades.map(tradeKey));
  const previewTrades = rows.map(r => rowToTrade(r, mapping, defaultStrategy));
  const uniquePreview = previewTrades.filter(t => !existingKeys.has(tradeKey(t)));
  const dupCount = previewTrades.length - uniquePreview.length;
  const canImport = !!mapping.date && !!mapping.pair && uniquePreview.length > 0;

  function doImport() {
    if (!canImport) return;
    onImport(uniquePreview);
  }

  return (
    <div style={{ border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "20px", background: C.panel, display: "flex", flexDirection: "column", gap: "18px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Import CSV</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "14px" }}>×</button>
      </div>

      {!headers.length && (
        <div>
          <label htmlFor="csv-file" style={{ display: "block", border: `1px dashed ${C.border2}`, padding: "28px 16px", borderRadius: "10px", cursor: "pointer", textAlign: "center", color: C.muted, fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {fileName || "Click to select a CSV file"}
            <input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
          </label>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: 1.5 }}>
            Works with Rithmic (Apex, TopstepX, Earn2Trade), MT4/MT5, TradingView, ThinkorSwim, and most crypto exchange CSVs. Load your file, then pick a broker preset or map columns manually.
          </div>
        </div>
      )}

      {error && <div style={{ fontFamily: BODY, fontSize: "12px", color: C.red }}>{error}</div>}

      {headers.length > 0 && (
        <>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted }}>
            <span style={{ color: C.text }}>{fileName}</span> — {rows.length} row{rows.length === 1 ? "" : "s"} detected.
          </div>

          {/* Broker presets */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
              Broker preset <span style={{ color: C.dim, fontWeight: 400 }}>(optional — snaps column mapping)</span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {Object.entries(CSV_PRESETS).map(([key, preset]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  title={preset.hint}
                  style={{ padding: "7px 14px", border: `1px solid ${activePreset === key ? C.text : C.border2}`, borderRadius: "999px", background: activePreset === key ? C.text : "transparent", color: activePreset === key ? C.bg : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s" }}>
                  {preset.label}
                </button>
              ))}
            </div>
            {activePreset && (
              <div style={{ fontFamily: BODY, fontSize: "11px", color: C.muted, marginTop: "6px", lineHeight: 1.4 }}>
                {CSV_PRESETS[activePreset].hint}. Unmapped fields will use auto-detection.
              </div>
            )}
          </div>

          <div>
            <label style={lbl}>Column mapping</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px 14px", marginTop: "8px" }}>
              {fields.map(f => (
                <div key={f.key}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>
                    {f.label}{f.required && <span style={{ color: C.red, marginLeft: "4px" }}>*</span>}
                  </div>
                  <select value={mapping[f.key] || ""} onChange={e => setMapping((m: any) => ({ ...m, [f.key]: e.target.value }))} style={sel}>
                    <option value="">— skip —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={lbl}>Default strategy (applied to every row)</label>
            <select value={defaultStrategy} onChange={e => setDefaultStrategy(e.target.value)} style={sel}>
              <option value="">— none —</option>
              {allStrategyNames.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Preview (first 5 rows)</label>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "auto", marginTop: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: C.panel2 }}>
                    {["Date", "Pair", "Bias", "Outcome", "P&L", "Entry", "R:R"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.muted, letterSpacing: "0.08em", fontWeight: 500, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewTrades.slice(0, 5).map((t: any, i: number) => {
                    const dup = existingKeys.has(tradeKey(t));
                    return (
                      <tr key={i} style={{ opacity: dup ? 0.5 : 1 }}>
                        <td style={{ padding: "8px 10px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{t.date}</td>
                        <td style={{ padding: "8px 10px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{t.pair || "—"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.bias || "—"}</td>
                        <td style={{ padding: "8px 10px", color: t.outcome === "Win" ? C.green : t.outcome === "Loss" ? C.red : C.text2, borderBottom: `1px solid ${C.border}` }}>{t.outcome || "—"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.pnl || "—"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.entryPrice || "—"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.rr || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {dupCount > 0 && (
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                {dupCount} duplicate{dupCount === 1 ? "" : "s"} will be skipped.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Cancel</button>
            <button onClick={doImport} disabled={!canImport} style={{ background: canImport ? C.text : C.border2, color: canImport ? C.bg : C.muted, border: "none", borderRadius: "999px", padding: "10px 18px", cursor: canImport ? "pointer" : "not-allowed", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Import {uniquePreview.length} trade{uniquePreview.length === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── EDIT INLINE ─────────────────────────────────────────────────────────────
function EditInline({ val, onSave, onCancel, C }: any) {
  const [text, setText] = useState(val);
  return (
    <div style={{ display: "flex", gap: "8px", flex: 1, alignItems: "center" }}>
      <input autoFocus value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(text); if (e.key === "Escape") onCancel(); }}
        style={{ background: "transparent", border: "none", borderBottom: `1px solid ${C.text}`, color: C.text, padding: "6px 0", fontSize: "13px", outline: "none", fontFamily: BODY, flex: 1, boxSizing: "border-box" }} />
      <button onClick={() => onSave(text)} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "5px 10px", fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.06em" }}>SAVE</button>
      <button onClick={onCancel} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "5px 10px", fontSize: "10px", color: C.muted, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.06em" }}>X</button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const EMOTION_TAGS = [
  { id: "disciplined", label: "Disciplined", color: "#00C96B" },  // DARK.green
  { id: "patient",     label: "Patient",     color: "#00C96B" },  // DARK.green
  { id: "fomo",        label: "FOMO",        color: "#FF3D00" },  // DARK.red
  { id: "revenge",     label: "Revenge",     color: "#FF3D00" },  // DARK.red
  { id: "overtrading", label: "Overtrading", color: "#FF3D00" },  // DARK.red
  { id: "hesitated",   label: "Hesitated",   color: "#BCBCB4" },  // DARK.text2
  { id: "earlyexit",   label: "Early Exit",  color: "#BCBCB4" },  // DARK.text2
  { id: "movedsl",     label: "Moved SL",    color: "#BCBCB4" },  // DARK.text2
  { id: "chased",      label: "Chased",      color: "#BCBCB4" },  // DARK.text2
];

function getEmotionTags(emotions: string | string[] | undefined): string[] {
  if (!emotions) return [];
  if (Array.isArray(emotions)) return emotions;
  const lower = emotions.toLowerCase();
  return EMOTION_TAGS.filter(t => lower.includes(t.id) || lower.includes(t.label.toLowerCase())).map(t => t.id);
}

const EMPTY_TRADE: Partial<Trade> = { date: new Date().toISOString().split("T")[0], pair: "", session: "", bias: "", strategy: "", setup: "", entryPrice: "", slPrice: "", tpPrice: "", rr: "", outcome: "", pnl: "", pnlDollar: "", entryTime: "", exitTime: "", direction: "", notes: "", emotions: "", screenshot: "", mae: "", mfe: "", comments: [], reactions: {} };
const DEF_PROFILE: Profile = { name: "Trader", handle: "@trader", bio: "Multi-strategy trader | Consistency over everything", avatar: "", broker: "", timezone: "London (GMT)", startDate: new Date().toISOString().split("T")[0], targetRR: "2", maxTradesPerDay: "2", publicTrades: false, instruments: [], socialLinks: {}, plan: "free" };

// ─── Drawdown Curve ──────────────────────────────────────────────────────────
function DrawdownCurve({ trades, C }: any) {
  if (!trades || trades.length === 0) return null;
  const sorted = [...trades].sort((a: any, b: any) => a.date > b.date ? 1 : -1);
  // Build daily cumulative P&L then compute drawdown from peak
  const dailyMap: Record<string, number> = {};
  sorted.forEach((t: any) => {
    const d = t.date; const v = parseFloat(t.pnl) || 0;
    dailyMap[d] = (dailyMap[d] || 0) + v;
  });
  const days = Object.keys(dailyMap).sort();
  let cum = 0, peak = 0;
  const points = days.map(d => {
    cum += dailyMap[d];
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? ((cum - peak) / Math.max(Math.abs(peak), 0.01)) * 100 : 0;
    return { d, dd: Math.min(0, dd) };
  });
  if (points.length < 2) return null;
  const minDD = Math.min(...points.map(p => p.dd));
  const maxY = 0; const minY = Math.min(minDD * 1.2, -0.5);
  const W = 320; const H = 140; const PAD = 28;
  const xScale = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const yScale = (v: number) => PAD + ((maxY - v) / (maxY - minY)) * (H - PAD * 2);
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(p.dd).toFixed(1)}`).join(" ");
  const fillD = `${pathD} L${xScale(points.length - 1).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF3D00" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FF3D00" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* zero line */}
        <line x1={PAD} y1={yScale(0)} x2={W - PAD} y2={yScale(0)} stroke={C.border2} strokeWidth="0.5" strokeDasharray="3 3" />
        {/* fill */}
        <path d={fillD} fill="url(#ddGrad)" />
        {/* line */}
        <path d={pathD} fill="none" stroke="#FF3D00" strokeWidth="1.5" strokeLinejoin="round" />
        {/* min label */}
        {minDD < -0.5 && (
          <text x={PAD + 4} y={yScale(minDD) - 4} fontSize="9" fill={C.red || "#FF3D00"} fontFamily="monospace">
            {minDD.toFixed(1)}%
          </text>
        )}
        <text x={PAD} y={H - 6} fontSize="8" fill={C.muted} fontFamily="monospace">{points[0]?.d?.slice(5)}</text>
        <text x={W - PAD} y={H - 6} fontSize="8" fill={C.muted} fontFamily="monospace" textAnchor="end">{points[points.length - 1]?.d?.slice(5)}</text>
      </svg>
      <div style={{ display: "flex", gap: "20px", marginTop: "8px" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>MAX DRAWDOWN</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: "#FF3D00" }}>{minDD.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>DAYS TRACKED</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: C.text }}>{points.length}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Session Heatmap ─────────────────────────────────────────────────────────
function SessionHeatmap({ trades, C }: any) {
  const sessions = ["London", "New York", "Asian", "London/NY"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  type Cell = { pnl: number; count: number };
  const grid: Record<string, Record<string, Cell>> = {};
  sessions.forEach(s => { grid[s] = {}; days.forEach(d => { grid[s][d] = { pnl: 0, count: 0 }; }); });
  trades.forEach((t: any) => {
    if (!t.date || !t.session) return;
    const dow = new Date(t.date + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) return;
    const dayLabel = days[dow - 1];
    const sess = sessions.find(s => t.session?.toLowerCase().includes(s.toLowerCase().split("/")[0].toLowerCase()));
    if (!sess) return;
    grid[sess][dayLabel].pnl += parseFloat(t.pnl) || 0;
    grid[sess][dayLabel].count += 1;
  });
  const allPnls = sessions.flatMap(s => days.map(d => grid[s][d].pnl)).filter(v => v !== 0);
  const maxAbs = allPnls.length ? Math.max(...allPnls.map(Math.abs)) : 1;
  function cellColor(pnl: number, count: number) {
    if (count === 0) return C.border;
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
    if (pnl > 0) return `rgba(0,201,107,${0.1 + intensity * 0.7})`;
    return `rgba(255,61,0,${0.1 + intensity * 0.7})`;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${days.length}, 1fr)`, gap: "3px", minWidth: "320px" }}>
        <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.08em", alignSelf: "end", paddingBottom: "4px" }} />
        {days.map(d => (
          <div key={d} style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textAlign: "center", paddingBottom: "4px" }}>{d.toUpperCase()}</div>
        ))}
        {sessions.map(sess => (
          <>
            <div key={sess + "label"} style={{ fontFamily: "monospace", fontSize: "9px", color: C.text2, letterSpacing: "0.06em", alignSelf: "center", paddingRight: "8px" }}>{sess.toUpperCase().slice(0, 8)}</div>
            {days.map(d => {
              const cell = grid[sess][d];
              return (
                <div key={sess + d} title={`${sess} ${d}: ${cell.count} trades, ${cell.pnl >= 0 ? "+" : ""}${cell.pnl.toFixed(2)}R`}
                  style={{ background: cellColor(cell.pnl, cell.count), borderRadius: "4px", height: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  {cell.count > 0 && <>
                    <div style={{ fontFamily: "monospace", fontSize: "8px", color: cell.pnl >= 0 ? "#00C96B" : "#FF3D00", fontWeight: 600 }}>
                      {cell.pnl >= 0 ? "+" : ""}{cell.pnl.toFixed(1)}R
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: "7px", color: C.muted }}>{cell.count}t</div>
                  </>}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

// ─── MAE/MFE Scatter Chart ────────────────────────────────────────────────────
function MAEMFEChart({ trades, C }: any) {
  const pts = trades.filter((t: any) => t.mae && t.mfe).map((t: any) => ({
    mae: parseFloat(t.mae) || 0,
    mfe: parseFloat(t.mfe) || 0,
    pnl: parseFloat(t.pnl) || 0,
    outcome: t.outcome,
    pair: t.pair,
  }));
  if (pts.length < 3) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "13px", fontStyle: "italic", fontFamily: "sans-serif" }}>
      Log MAE & MFE on {Math.max(0, 3 - pts.length)} more trade{3 - pts.length !== 1 ? "s" : ""} to see the scatter.
    </div>
  );
  const maxMAE = Math.max(...pts.map((p: any) => p.mae), 1);
  const maxMFE = Math.max(...pts.map((p: any) => p.mfe), 1);
  const W = 300; const H = 200; const PAD = 32;
  const xS = (v: number) => PAD + (v / maxMAE) * (W - PAD * 2);
  const yS = (v: number) => H - PAD - (v / maxMFE) * (H - PAD * 2);
  // Efficiency: what % of MFE did they capture?
  const avgEff = pts.length ? pts.reduce((a: number, p: any) => a + (p.mfe > 0 ? Math.min(p.pnl / p.mfe, 1) : 0), 0) / pts.length * 100 : 0;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* axes */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={C.border2} strokeWidth="0.5" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={C.border2} strokeWidth="0.5" />
        {/* axis labels */}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="monospace">MAE (R)</text>
        <text x={10} y={H / 2} textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="monospace" transform={`rotate(-90, 10, ${H / 2})`}>MFE (R)</text>
        {/* points */}
        {pts.map((p: any, i: number) => (
          <circle key={i} cx={xS(p.mae)} cy={yS(p.mfe)} r="5"
            fill={p.outcome === "Win" ? "#00C96B" : p.outcome === "Loss" ? "#FF3D00" : "#BCBCB4"}
            fillOpacity="0.7" stroke="none" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: "20px", marginTop: "8px" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>AVG CAPTURE EFF</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: avgEff >= 60 ? "#00C96B" : "#BCBCB4" }}>{avgEff.toFixed(0)}%</div>
        </div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>TRADES WITH DATA</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: C.text }}>{pts.length}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Position Size Calculator ────────────────────────────────────────────────
function PositionSizeCalc({ C, inp, profile, saveProfile }: any) {
  const [balance, setBalance] = useState(profile?.accountBalance || "");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tickSize, setTickSize] = useState("0.25");
  const [tickValue, setTickValue] = useState("12.5");

  const balNum = parseFloat(balance) || 0;
  const riskNum = parseFloat(riskPct) || 1;
  const entryNum = parseFloat(entry) || 0;
  const slNum = parseFloat(sl) || 0;
  const tickSzNum = parseFloat(tickSize) || 0.25;
  const tickValNum = parseFloat(tickValue) || 12.5;

  const riskDollar = balNum > 0 ? (balNum * riskNum) / 100 : 0;
  const priceDiff = Math.abs(entryNum - slNum);
  const ticks = tickSzNum > 0 ? priceDiff / tickSzNum : 0;
  const valuePerContract = ticks * tickValNum;
  const contracts = valuePerContract > 0 ? riskDollar / valuePerContract : 0;
  const contractsRounded = Math.floor(contracts * 10) / 10;

  const PRESETS = [
    { label: "ES", tick: "0.25", val: "12.5" },
    { label: "NQ", tick: "0.25", val: "5" },
    { label: "MES", tick: "0.25", val: "1.25" },
    { label: "MNQ", tick: "0.25", val: "0.5" },
    { label: "CL", tick: "0.01", val: "10" },
    { label: "GC", tick: "0.1", val: "10" },
  ];

  function saveBalance() {
    if (balance && profile) saveProfile({ ...profile, accountBalance: balance });
  }

  const row: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px" };
  const lbl: React.CSSProperties = { fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" };

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", marginTop: "20px" }}>
      <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>POSITION SIZE CALCULATOR</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setTickSize(p.tick); setTickValue(p.val); }}
            style={{ background: tickSize === p.tick && tickValue === p.val ? C.text : "transparent", color: tickSize === p.tick && tickValue === p.val ? C.bg : C.muted, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", letterSpacing: "0.08em" }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
        <div style={row}>
          <span style={lbl}>Account ($)</span>
          <input value={balance} onChange={e => setBalance(e.target.value)} onBlur={saveBalance}
            placeholder="25000" style={{ ...inp, fontSize: "13px" }} />
        </div>
        <div style={row}>
          <span style={lbl}>Risk %</span>
          <input value={riskPct} onChange={e => setRiskPct(e.target.value)}
            placeholder="1" style={{ ...inp, fontSize: "13px" }} />
        </div>
        <div style={row}>
          <span style={lbl}>Entry price</span>
          <input value={entry} onChange={e => setEntry(e.target.value)}
            placeholder="5280.00" style={{ ...inp, fontSize: "13px" }} />
        </div>
        <div style={row}>
          <span style={lbl}>Stop loss</span>
          <input value={sl} onChange={e => setSl(e.target.value)}
            placeholder="5274.00" style={{ ...inp, fontSize: "13px" }} />
        </div>
        <div style={row}>
          <span style={lbl}>Tick size</span>
          <input value={tickSize} onChange={e => setTickSize(e.target.value)}
            placeholder="0.25" style={{ ...inp, fontSize: "13px" }} />
        </div>
        <div style={row}>
          <span style={lbl}>Tick value ($)</span>
          <input value={tickValue} onChange={e => setTickValue(e.target.value)}
            placeholder="12.5" style={{ ...inp, fontSize: "13px" }} />
        </div>
      </div>
      <div style={{ border: `1px solid ${contractsRounded > 0 ? C.green + "55" : C.border}`, borderRadius: "8px", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "4px" }}>CONTRACTS</div>
          <div style={{ fontFamily: DISPLAY, fontSize: "28px", fontWeight: 500, color: contractsRounded > 0 ? C.text : C.muted }}>
            {contractsRounded > 0 ? contractsRounded.toFixed(1) : "—"}
          </div>
        </div>
        {riskDollar > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "4px" }}>RISK $</div>
            <div style={{ fontFamily: DISPLAY, fontSize: "20px", color: C.red }}>${riskDollar.toFixed(0)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Tradr({ user }: { user?: any } = {}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [view, setView] = useState("home");
  // ── Circles state ──────────────────────────────────────────────
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [circlesView, setCirclesView] = useState<string>("browse");
  const [activeCircle, setActiveCircle] = useState<Circle | null>(null);
  const [circleForm, setCircleForm] = useState<{ name: string; description: string; strategy: string; privacy: string; emoji: string; metric: string }>({ name: "", description: "", strategy: "", privacy: "public", emoji: "◆", metric: "dollar" });
  const [circleJoinCode, setCircleJoinCode] = useState<string>("");
  const [circleMsg, setCircleMsg] = useState<string>("");
  const [darkMode, setDarkMode] = useState(true);
  const isDesktop = useIsDesktop(900);
  const C: typeof DARK = darkMode ? DARK : LIGHT;
  const [form, setForm] = useState<Partial<Trade>>(EMPTY_TRADE);
  const [editId, setEditId] = useState<number | null>(null);
  const [filter, setFilter] = useState<{ outcome: string; setup: string; pair: string; strategy: string; dateFrom: string; dateTo: string }>({ outcome: "", setup: "", pair: "", strategy: "", dateFrom: "", dateTo: "" });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile>(DEF_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Profile>(DEF_PROFILE);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [friendFeed, setFriendFeed] = useState<any[]>([]);
  // Track which feed reactions the current user has already added this session.
  // Key format: `${authorCode}_${tradeId}_${reaction}`. Prevents spam and gives
  // true toggle semantics even though feed reactions aren't persisted remotely.
  const [myFeedReactions, setMyFeedReactions] = useState<Set<string>>(new Set());
  const [pnlMode, setPnlMode] = useState<"r" | "$">("$");
  const [timeMode, setTimeMode] = useState<"week" | "all">("week");
  // Follow system: one-way. following = codes I follow, followers = codes following me.
  // Friends = intersect(following, followers) — i.e. mutual follows.
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [followerProfiles, setFollowerProfiles] = useState<Array<{ code: string; name: string; handle: string }>>([]);
  const [viewProfile, setViewProfile] = useState<string | null>(null);
  function openProfile(handle: string) { if (handle) setViewProfile(handle.replace(/^@/, "")); }
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [friendMsg, setFriendMsg] = useState("");
  const [toast, setToast] = useState<any>(null);
  const [homeSection, setHomeSection] = useState("feed");
  const [activeStrategy, setActiveStrategy] = useState(STRATEGY_NAMES[0]);
  const [stratChecklists, setStratChecklists] = useState<any>(() => Object.fromEntries(STRATEGY_NAMES.map(s => [s, STRATEGIES[s].checklist.map((t: string, i: number) => ({ id: i + 1, text: t }))])));
  const [stratRules, setStratRules] = useState<any>(() => Object.fromEntries(STRATEGY_NAMES.map(s => [s, STRATEGIES[s].rules.map((t: string, i: number) => ({ id: i + 1, text: t }))])));
  const [checked, setChecked] = useState<any>({});
  const [checklistTab, setChecklistTab] = useState("pretrade");
  const [editingCheckItem, setEditingCheckItem] = useState<any>(null);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [newCheckText, setNewCheckText] = useState("");
  const [newRuleText, setNewRuleText] = useState("");
  const [addingCheck, setAddingCheck] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [calDayTrades, setCalDayTrades] = useState<any>(null);
  const [statsTab, setStatsTab] = useState("overview");
  const [perfPnlMode, setPerfPnlMode] = useState<"r" | "$">("$");
  const [savingTrade, setSavingTrade] = useState(false);

  // Custom strategies: user-defined, same shape as built-ins (name, code, setups, checklist, rules).
  // Merged into STRATEGIES global on load so stratCode/stratShort keep working unchanged.
  const [customStrategies, setCustomStrategies] = useState<any[]>([]);
  const allStrategyNames = [...STRATEGY_NAMES, ...customStrategies.map((s: any) => s.name)];
  // Custom-strategy editor state
  const [showStrategyEditor, setShowStrategyEditor] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<any>(null);
  const [strategyDraft, setStrategyDraft] = useState<any>({ name: "", code: "", setups: [], checklist: [], rules: [] });

  // CSV import panel state
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Circle action loading states
  const [isCreatingCircle, setIsCreatingCircle] = useState(false);
  const [isJoiningCircle, setIsJoiningCircle] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [fontScale, setFontScale] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem("tradr_font_scale") ?? "1") || 1; } catch { return 1; }
  });

  // ── Tradovate integration ────────────────────────────────────────────────────
  const [tradovateSession, setTradovateSession] = useState<TradovateSession | null>(null);
  const [tradovatePositions, setTradovatePositions] = useState<TradovatePosition[]>([]);
  const [tradovateConnecting, setTradovateConnecting] = useState(false);
  const [tradovateSyncing, setTradovateSyncing] = useState(false);
  const [tradovateError, setTradovateError] = useState("");
  const [tradovateForm, setTradovateForm] = useState<{ username: string; password: string; env: "demo" | "live" }>({ username: "", password: "", env: "demo" });

  // Swipe
  const swipeRef = useRef<any>(null);
  const touchStartX = useRef<any>(null);
  const touchStartY = useRef<any>(null);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

  // ── Surface Supabase write failures as user-visible toasts ───────────────────
  // storage.ts calls this callback instead of silently logging to the console.
  useEffect(() => {
    onStorageError((_key, _err) => {
      showToast("Save failed — check your connection");
    });
  }, [showToast]);

  const [stratThresholds, setStratThresholds] = useState<any>(() =>
    Object.fromEntries(STRATEGY_NAMES.map(s => [s, { minCount: Math.ceil(STRATEGIES[s].checklist.length * 0.75), required: [] }]))
  );

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    (document.documentElement as any).style.zoom = String(fontScale);
    try { localStorage.setItem("tradr_font_scale", String(fontScale)); } catch {}
  }, [fontScale]);

  // ── Stripe return URL handler ───────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      const cid = params.get("cid") ?? "";
      setProfile(p => ({ ...p, plan: "pro" as const, ...(cid ? { stripeCustomerId: cid } : {}) }));
      showToast("⚡ You're on TRADR Pro — welcome!");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("cancelled") === "1") {
      showToast("No worries — you're still on the free plan.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ?join= deep-link handler ────────────────────────────────────────────────
  // tradrjournal.xyz/?join=TRADR-ABCD-EFGH → open join flow pre-filled
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const joinCode = params.get("join");
      if (joinCode) {
        setCircleJoinCode(joinCode.toUpperCase());
        setView("circles");
        setCirclesView("join");
        // Clean URL so refreshing doesn't re-trigger
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {}
  }, []);

  // ── Stats fingerprint — cheap memo so auto-publish only fires when the
  //    numbers actually change, not on every render triggered by unrelated state.
  const statsFingerprint = useMemo(() => {
    const w    = trades.filter(t => t.outcome === "Win").length;
    const l    = trades.filter(t => t.outcome === "Loss").length;
    const pnl  = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
    const rrTs = trades.filter(t => t.rr);
    const avgRR = rrTs.length
      ? (rrTs.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTs.length).toFixed(2)
      : "0";
    return `${w}:${l}:${pnl.toFixed(2)}:${avgRR}`;
  }, [trades]);

  // ── Auto-publish to circles ──────────────────────────────────────
  // Circles are the product pillar: any time trades change, every circle
  // the user is in must reflect the latest stats without a manual tap.
  // Debounced 800ms to coalesce rapid edits (reactions, comments, rapid saves).
  useEffect(() => {
    if (loading) return;
    if (!myCircles.length) return;
    const t = setTimeout(() => {
      myCircles.forEach((c: any) => { publishToCircle(c.code, true); });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsFingerprint, myCircles, loading]);

  // ── Auto-publish my feed whenever trades change ───────────────────
  // Friends see fresh data without the user ever tapping "Publish".
  // Debounced 1 s to avoid hammering on rapid edits.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => { publishFeed(); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, loading]);

  // ── Periodic auto-refresh of inbound friend feed (every 2 min) ───
  useEffect(() => {
    if (loading || !friends.length) return;
    const id = setInterval(() => { refreshFeed(); }, 2 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, friends]);

  // ── Follows sync (every 2 min) ───────────────────────────────────
  // Load my follow lists from shared_kv and refresh periodically so counts
  // update when someone follows you back without a page reload.
  useEffect(() => {
    if (loading) return;
    if (!profile.uid) return;
    let alive = true;
    async function syncFollows() {
      const mc = getMyCode();
      try {
        // New canonical source: per-row edges. Each follow writes TWO rows,
        // both owned by the follower, so RLS never blocks a second writer:
        //   tradr_follow_<follower>_<target>    — enumerates my "following"
        //   tradr_follower_<target>_<follower>  — enumerates my "followers"
        const [followRows, followerRows, legacyFg, legacyFr] = await Promise.all([
          (window as any).storage.listByPrefix(`tradr_follow_${mc}_`),
          (window as any).storage.listByPrefix(`tradr_follower_${mc}_`),
          // Legacy fallback — users who followed before the per-row refactor
          // still have single rows. Merge them in for a transparent upgrade.
          (window as any).storage.get(`tradr_following_${mc}`, true),
          (window as any).storage.get(`tradr_followers_${mc}`, true),
        ]);
        if (!alive) return;

        const followingSet = new Set<string>();
        const followersSet = new Set<string>();

        // Per-row edges are the source of truth.
        for (const row of (followRows || [])) {
          const target = String(row.key).slice(`tradr_follow_${mc}_`.length);
          if (target) followingSet.add(target);
        }
        const profiles: Array<{ code: string; name: string; handle: string }> = [];
        for (const row of (followerRows || [])) {
          const follower = String(row.key).slice(`tradr_follower_${mc}_`.length);
          if (follower) {
            followersSet.add(follower);
            try {
              const edge = JSON.parse(row.value || "{}");
              profiles.push({ code: follower, name: edge.name || follower, handle: edge.handle || "" });
            } catch { profiles.push({ code: follower, name: follower, handle: "" }); }
          }
        }

        // Merge legacy lists (read-only fallback; never overwrites per-row data).
        if (legacyFg) {
          try { (JSON.parse(legacyFg.value) || []).forEach((c: string) => followingSet.add(c)); } catch {}
        }
        if (legacyFr) {
          try { (JSON.parse(legacyFr.value) || []).forEach((c: string) => followersSet.add(c)); } catch {}
        }

        setFollowing(Array.from(followingSet));
        setFollowers(Array.from(followersSet));
        setFollowerProfiles(profiles);

        // One-time migration: if we still have a legacy `tradr_following_<mc>`
        // row, materialize each entry as a per-row edge (both sides, owned by
        // us) and drop the legacy row. Safe because we own the legacy row.
        if (legacyFg) {
          try {
            const legacy: string[] = JSON.parse(legacyFg.value) || [];
            await Promise.all(legacy.map(async (target) => {
              if (!target || target === mc) return;
              const edge = { follower: mc, target, at: new Date().toISOString() };
              try { await (window as any).storage.set(`tradr_follow_${mc}_${target}`, JSON.stringify(edge), true); } catch {}
              try { await (window as any).storage.set(`tradr_follower_${target}_${mc}`, JSON.stringify(edge), true); } catch {}
            }));
            try { await (window as any).storage.delete(`tradr_following_${mc}`, true); } catch {}
          } catch {}
        }
      } catch {}
    }
    syncFollows();
    // Realtime: re-sync the moment any row touching either side of my follow
    // graph changes. Falls back to the 2-min poll if Realtime is offline.
    const unsub = subscribeToFollows(getMyCode(), syncFollows);
    const id = setInterval(syncFollows, 120_000);
    return () => { alive = false; clearInterval(id); try { unsub(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile.uid]);

  // ── Circle membership sync (every 2 min) ─────────────────────────
  // Fix: local myCircles was snapshotted at create/join time. When another
  // member joined, this side never re-read the canonical tradr_circle_<code>
  // from shared storage, so the members list (and therefore the leaderboard
  // fetch) stayed stale. Pull fresh on mount + every 2 min so the social
  // loop feels live without needing a manual refresh.
  const myCirclesRef = useRef<any[]>(myCircles);
  myCirclesRef.current = myCircles;
  useEffect(() => {
    if (loading) return;
    if (!profile.uid) return;
    let alive = true;
    let migrated = false;

    async function ensureMyMemberRow(circle: any) {
      // For circles created before the per-member-row refactor, each user
      // needs to write their own tradr_circle_member_<CODE>_<myCode> once.
      // Safe to re-run (upsert).
      const myCode = getMyCode();
      const me = { name: profile.name || "Trader", handle: profile.handle || "@trader", avatar: profile.avatar || "", code: myCode, joinedAt: new Date().toISOString() };
      try {
        await (window as any).storage.set(`tradr_circle_member_${circle.code}_${myCode}`, JSON.stringify(me), true);
      } catch {}
    }

    async function syncCircles() {
      const current = myCirclesRef.current;
      if (!current.length) return;
      // One-shot migration on first tick: ensure every circle I'm in has my
      // own member row in shared_kv. Fixes old data that only had inline
      // members[] on the creator's row.
      if (!migrated) {
        migrated = true;
        await Promise.all(current.map(ensureMyMemberRow));
      }
      const refreshed = await Promise.all(current.map(async (c: any) => {
        try {
          const [metaRes, members] = await Promise.all([
            (window as any).storage.get("tradr_circle_" + c.code, true),
            readCircleMembers(c.code, c.members || []),
          ]);
          const fresh = metaRes ? JSON.parse(metaRes.value) : c;
          return { ...fresh, members, isOwner: c.isOwner };
        } catch { return c; }
      }));
      if (!alive) return;
      const changed = JSON.stringify(refreshed) !== JSON.stringify(current);
      if (changed) {
        setMyCircles(refreshed);
        try { await (window as any).storage.set("tradr_circles", JSON.stringify(refreshed)); } catch {}
      }
    }
    syncCircles();
    const id = setInterval(syncCircles, 120_000);

    // Realtime: subscribe to every circle the user is currently a member of.
    // The set of circles can change (join/leave/create), so we keep the live
    // unsubs in a map keyed by circle code and reconcile on each tick.
    const liveSubs = new Map<string, () => void>();
    function reconcileSubs() {
      const wantCodes = new Set(myCirclesRef.current.map((c: any) => c.code));
      // Drop subs for circles we are no longer in.
      for (const code of Array.from(liveSubs.keys())) {
        if (!wantCodes.has(code)) {
          try { liveSubs.get(code)!(); } catch {}
          liveSubs.delete(code);
        }
      }
      // Add subs for new circles.
      for (const code of wantCodes) {
        if (!liveSubs.has(code)) {
          try { liveSubs.set(code, subscribeToCircle(code, () => { syncCircles(); })); } catch {}
        }
      }
    }
    reconcileSubs();
    // Reconcile every tick so newly-joined circles get a live channel without
    // waiting for a full reload. Cheap — Map lookups + a few subscribe calls.
    const recId = setInterval(reconcileSubs, 30_000);

    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(recId);
      for (const off of liveSubs.values()) { try { off(); } catch {} }
      liveSubs.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile.uid]);

  async function loadAll() {
    const store = (window as any).storage;
    const [t, pr, fr, ff, sc, sr, dm, ci, st, cs, tv, v2ProfileRes] = await Promise.all([
      store.get("tradr_trades").catch(() => null),
      store.get("tradr_profile").catch(() => null),
      store.get("tradr_friends").catch(() => null),
      store.get("tradr_feed", true).catch(() => null),
      store.get("tradr_checklists").catch(() => null),
      store.get("tradr_rules").catch(() => null),
      store.get("tradr_dark").catch(() => null),
      store.get("tradr_circles").catch(() => null),
      store.get("tradr_thresholds").catch(() => null),
      store.get("tradr_custom_strategies").catch(() => null),
      store.get("tradr_tradovate").catch(() => null),
      (isFlagOn("newProfile") && user?.id)
        ? getProfile(user.id).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Trades
    try {
      const parsed = t ? JSON.parse(t.value) : null;
      setTrades(Array.isArray(parsed) ? parsed : []);
    } catch (e) { log.error("loadAll.trades", e); setTrades([]); }

    // Profile (v2 → KV fallback)
    try {
      let p: any = null;
      if (v2ProfileRes) {
        const v2 = v2ProfileRes;
        p = {
          ...DEF_PROFILE,
          ...(v2.prefs || {}),
          uid: v2.userId,
          handle: v2.handle ? `@${v2.handle}` : "",
          name: v2.name,
          avatar: v2.avatar,
          bio: v2.bio,
          broker: v2.broker,
          timezone: v2.timezone,
          onboarded: v2.onboarded,
          publicTrades: v2.publicTrades,
        };
      }
      if (!p) {
        p = pr ? JSON.parse(pr.value) : { ...DEF_PROFILE };
      }
      if (user?.id && p.uid !== user.id) {
        p = { ...p, uid: user.id };
        try { await store.set("tradr_profile", JSON.stringify(p)); }
        catch (e) { log.error("loadAll.profile.uidStamp", e); }
      }
      setProfile(p); setProfileDraft(p);
    } catch (e) { log.error("loadAll.profile", e); }

    try { if (fr) setFriends(JSON.parse(fr.value)); }
    catch (e) { log.error("loadAll.friends", e); }
    try { if (ff) setFriendFeed(JSON.parse(ff.value)); }
    catch (e) { log.error("loadAll.feed", e); }
    try { if (sc) setStratChecklists(JSON.parse(sc.value)); }
    catch (e) { log.error("loadAll.checklists", e); }
    try { if (sr) setStratRules(JSON.parse(sr.value)); }
    catch (e) { log.error("loadAll.rules", e); }
    try { if (dm) setDarkMode(JSON.parse(dm.value)); }
    catch (e) { log.error("loadAll.dark", e); }
    try { if (ci) setMyCircles(JSON.parse(ci.value)); }
    catch (e) { log.error("loadAll.circles", e); }
    try { if (st) setStratThresholds(JSON.parse(st.value)); }
    catch (e) { log.error("loadAll.thresholds", e); }
    try {
      if (cs) {
        const parsed = JSON.parse(cs.value);
        setCustomStrategies(parsed);
        _extraStrategies = Object.fromEntries(parsed.map((s: any) => [s.name, s]));
      }
    } catch (e) { log.error("loadAll.customStrategies", e); }
    try {
      if (tv) {
        const sess: TradovateSession = JSON.parse(tv.value);
        if (sess?.accessToken) {
          setTradovateSession(sess);
          // Refresh positions in the background — don't block the rest of loadAll.
          tradovateGetPositions(sess).then(setTradovatePositions).catch(e => log.error("loadAll.tradovate.positions", e));
        }
      }
    } catch (e) { log.error("loadAll.tradovate", e); }

    // Load Stripe customer ID
    try {
      const store = (window as any).storage;
      const stripeKv = await store.get("tradr_stripe_customer").catch(() => null);
      if (stripeKv?.value) {
        const { customerId } = JSON.parse(stripeKv.value);
        if (customerId) setProfile(p => ({ ...p, stripeCustomerId: customerId }));
      }
    } catch (e) { log.error("loadAll.stripe", e); }

    // Stamp email from auth session onto profile state (not persisted)
    if (user?.email) {
      setProfile(p => ({ ...p, email: user.email }));
    }

    setLoading(false);
  }

  async function saveCustomStrategies(u: any[]) {
    // Rebuild _extraStrategies from the new set (replaces stale entries).
    _extraStrategies = Object.fromEntries(u.map((s: any) => [s.name, s]));
    setCustomStrategies(u);
    await (window as any).storage.set("tradr_custom_strategies", JSON.stringify(u));
  }

  function openNewStrategy() {
    setEditingStrategy(null);
    setStrategyDraft({ name: "", code: "", setups: [], checklist: [], rules: [] });
    setShowStrategyEditor(true);
  }
  function openEditStrategy(s: any) {
    setEditingStrategy(s.name);
    setStrategyDraft({ ...s, setups: [...(s.setups || [])], checklist: [...(s.checklist || [])], rules: [...(s.rules || [])] });
    setShowStrategyEditor(true);
  }
  async function saveStrategyDraft() {
    const d = strategyDraft;
    if (!d.name.trim()) { showToast("Name required"); return; }
    const code = (d.code || d.name).replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "NEW";
    const clean = { name: d.name.trim(), code, setups: d.setups.filter((x: string) => x?.trim()), checklist: d.checklist.filter((x: any) => x?.text?.trim()), rules: d.rules.filter((x: any) => x?.text?.trim()) };
    // Block overwriting a built-in.
    if (STRATEGY_NAMES.includes(clean.name) && editingStrategy !== clean.name) { showToast("Name clashes with a built-in"); return; }
    let u;
    if (editingStrategy) u = customStrategies.map((s: any) => s.name === editingStrategy ? clean : s);
    else u = [...customStrategies, clean];
    await saveCustomStrategies(u);
    // Seed checklist/rules state so the Check tab can render the new strategy immediately.
    if (!stratChecklists[clean.name]) {
      const cl = clean.checklist.length ? clean.checklist : [];
      await saveStratChecklists({ ...stratChecklists, [clean.name]: cl });
    }
    if (!stratRules[clean.name]) {
      const rl = clean.rules.length ? clean.rules : [];
      await saveStratRules({ ...stratRules, [clean.name]: rl });
    }
    setShowStrategyEditor(false);
    showToast(editingStrategy ? "Strategy updated" : "Strategy added");
  }
  async function deleteCustomStrategy(name: string) {
    const u = customStrategies.filter((s: any) => s.name !== name);
    await saveCustomStrategies(u);
    const cl = { ...stratChecklists }; delete cl[name]; await saveStratChecklists(cl);
    const rl = { ...stratRules }; delete rl[name]; await saveStratRules(rl);
    if (activeStrategy === name) setActiveStrategy(STRATEGY_NAMES[0]);
    showToast("Strategy deleted");
  }

  async function saveTrades(u: Trade[]) {
    setTrades(u);
    try {
      await (window as any).storage.set("tradr_trades", JSON.stringify(u));
    } catch (e) {
      log.error("saveTrades", e);
      // storage.ts already shows a toast via onStorageError; just log here.
    }
  }
  async function handleCsvImport(newTrades: any[]) {
    if (!newTrades.length) { setShowCsvImport(false); return; }
    setIsImportingCsv(true);
    try {
      const merged = [...newTrades, ...trades];
      await saveTrades(merged);
      setShowCsvImport(false);
      showToast(`Imported ${newTrades.length} trade${newTrades.length === 1 ? "" : "s"}`);
    } finally {
      setIsImportingCsv(false);
    }
  }
  async function saveProfile(u: Profile) {
    setProfile(u);
    // ── Legacy KV write (always — keeps live app working until v2 cutover) ──
    await (window as any).storage.set("tradr_profile", JSON.stringify(u));
    if (u.handle) {
      registerHandle(u.handle, profile.handle || null);
      // Write public profile so other traders can view it
      const norm = u.handle.replace(/^@/, "").toLowerCase();
      try {
        await (window as any).storage.set(
          `tradr_profile_pub_${norm}`,
          JSON.stringify({ name: u.name || "Trader", handle: norm, avatar: u.avatar || "", bio: u.bio || "", publicTrades: u.publicTrades || false }),
          true
        );
      } catch (e) { log.error("saveProfile.publicProfile", e, { handle: norm }); }
    }
    // ── V2 dual-write (only when flag on; failures are logged but never throw) ──
    if (isFlagOn("newProfile") && user?.id) {
      const norm = u.handle ? u.handle.replace(/^@/, "").toLowerCase() : "";
      // Pack everything that doesn't have a typed column into prefs so we
      // round-trip 100% of the legacy Profile shape.
      const { uid: _uid, handle: _h, name: _n, avatar: _a, bio: _b, broker: _br, timezone: _tz, onboarded: _o, publicTrades: _pt, ...prefs } = u as any;
      try {
        await upsertProfile({
          userId: user.id,
          handle: norm || `user_${user.id.slice(0, 8)}`,
          name: u.name || "",
          avatar: u.avatar || "",
          bio: u.bio || "",
          broker: u.broker || "",
          timezone: u.timezone || "UTC",
          memberCode: getMyCode(),
          isPublic: !!norm,
          publicTrades: !!u.publicTrades,
          onboarded: !!u.onboarded,
          prefs,
        });
      } catch (e) { log.error("saveProfile.v2", e, { userId: user.id }); }
    }
  }
  async function saveFriends(u: any) { setFriends(u); await (window as any).storage.set("tradr_friends", JSON.stringify(u)); }
  async function saveStratChecklists(u: any) { setStratChecklists(u); await (window as any).storage.set("tradr_checklists", JSON.stringify(u)); }
  async function saveMyCircles(u: any) { setMyCircles(u); await (window as any).storage.set("tradr_circles", JSON.stringify(u)); }

  // Each circle is split into two kinds of rows:
  //   tradr_circle_<CODE>                        — metadata, owned by creator
  //   tradr_circle_member_<CODE>_<memberCode>    — membership, owned by each member
  // This avoids the RLS bug where Jason couldn't update Dylon's circle row.
  // Each member only writes their own row, so auth.uid() = owner_id always holds.
  function myMemberRecord() {
    const storageCode = getMyCode();
    // alias is the user's chosen display ID (shown on leaderboards).
    // Falls back to the hash-based storage code if not set.
    const alias = profile.alias?.trim() || storageCode;
    return { name: profile.name || "Trader", handle: profile.handle || "@trader", avatar: profile.avatar || "", code: storageCode, alias, joinedAt: new Date().toISOString() };
  }
  // ── Tradovate connect / sync / disconnect ────────────────────────────────────

  async function connectTradovate() {
    const { username, password, env } = tradovateForm;
    if (!username.trim() || !password.trim()) {
      setTradovateError("Username and password are required");
      return;
    }
    setTradovateConnecting(true);
    setTradovateError("");
    try {
      const sess = await tradovateAuth(username.trim(), password, env);
      if (!sess) { setTradovateError("Invalid credentials — check username and password"); return; }
      const acct = await tradovateGetAccount(sess);
      const fullSess: TradovateSession = { ...sess, accountId: acct?.id, accountName: acct?.name };
      setTradovateSession(fullSess);
      setTradovateForm(f => ({ ...f, password: "" })); // clear password from state
      await (window as any).storage.set("tradr_tradovate", JSON.stringify(fullSess));
      const positions = await tradovateGetPositions(fullSess);
      setTradovatePositions(positions);
      showToast(`Connected to ${acct?.name ?? "Tradovate"}`);
    } catch (e) {
      log.error("tradovate.connect", e);
      setTradovateError("Connection failed — check credentials and try again");
    } finally {
      setTradovateConnecting(false);
    }
  }

  async function refreshTradovatePositions(sess: TradovateSession) {
    try {
      let s = sess;
      if (tradovateTokenExpiring(s)) {
        const refreshed = await tradovateRefresh(s);
        if (!refreshed) { showToast("Tradovate token expired — please reconnect"); setTradovateSession(null); return; }
        s = refreshed;
        setTradovateSession(s);
        await (window as any).storage.set("tradr_tradovate", JSON.stringify(s));
      }
      const positions = await tradovateGetPositions(s);
      setTradovatePositions(positions);
    } catch (e) { log.error("tradovate.refreshPositions", e); }
  }

  async function syncTradovateFills() {
    if (!tradovateSession) return;
    setTradovateSyncing(true);
    try {
      let sess = tradovateSession;
      if (tradovateTokenExpiring(sess)) {
        const refreshed = await tradovateRefresh(sess);
        if (!refreshed) { showToast("Tradovate token expired — please reconnect"); setTradovateSession(null); setTradovateSyncing(false); return; }
        sess = refreshed;
        setTradovateSession(sess);
      }
      const since = sess.lastSyncTime;
      const fills = await tradovateGetFills(sess, since);
      const newTrades = fillsToTrades(fills);
      if (newTrades.length === 0) {
        showToast("No new fills since last sync");
      } else {
        await handleTradovateFillImport(newTrades);
        showToast(`${newTrades.length} trade${newTrades.length === 1 ? "" : "s"} imported from Tradovate`);
      }
      // Update lastSyncTime and positions
      const updatedSess: TradovateSession = { ...sess, lastSyncTime: new Date().toISOString() };
      setTradovateSession(updatedSess);
      await (window as any).storage.set("tradr_tradovate", JSON.stringify(updatedSess));
      const positions = await tradovateGetPositions(updatedSess);
      setTradovatePositions(positions);
    } catch (e) {
      log.error("tradovate.syncFills", e);
      showToast("Sync failed — try reconnecting");
    } finally {
      setTradovateSyncing(false);
    }
  }

  async function disconnectTradovate() {
    setTradovateSession(null);
    setTradovatePositions([]);
    setTradovateForm({ username: "", password: "", env: "demo" });
    setTradovateError("");
    try { await (window as any).storage.del("tradr_tradovate"); } catch { /* noop */ }
    showToast("Tradovate disconnected");
  }

  /**
   * Import fills from Tradovate into the journal, deduplicating against
   * any existing trades that have the same source fill ID in their notes.
   */
  async function handleTradovateFillImport(newTrades: any[]) {
    const existingNotes = new Set(trades.map(t => t.notes));
    const deduped = newTrades.filter(t => !existingNotes.has(t.notes));
    if (!deduped.length) return;
    const updated = [...trades, ...deduped];
    setTrades(updated);
    try {
      const store = (window as any).storage;
      await store.set("tradr_trades", JSON.stringify(updated));
    } catch (e) { log.error("tradovate.fillImport.save", e); }
  }

  /** Read the ban list for a circle. Returns a Set of banned member codes. */
  async function readCircleBans(circleCode: string): Promise<Set<string>> {
    try {
      const r = await (window as any).storage.get(`tradr_circle_bans_${circleCode}`, true);
      if (!r) return new Set();
      const arr = JSON.parse(r.value);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }

  async function readCircleMembers(code: string, fallback: any[] = []) {
    try {
      const [rows, bans] = await Promise.all([
        (window as any).storage.listByPrefix(`tradr_circle_member_${code}_`),
        readCircleBans(code),
      ]);
      if (!rows.length) return fallback.filter((m: any) => !bans.has(m.code));
      return rows.map((r: any) => JSON.parse(r.value)).filter((m: any) => !bans.has(m.code));
    } catch { return fallback; }
  }

  async function createCircle() {
    if (!circleForm.name.trim() || isCreatingCircle) return;
    setIsCreatingCircle(true);
    try {
      const code = circleForm.name.replace(/\s+/g, "").toUpperCase().slice(0, 6) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      const me = myMemberRecord();
      const circle = {
        id: Date.now(), code, name: circleForm.name.trim(),
        description: circleForm.description.trim(),
        strategy: circleForm.strategy, privacy: circleForm.privacy,
        emoji: circleForm.emoji || "◆",
        metric: circleForm.metric || "dollar",
        createdBy: profile.name || "Trader", createdAt: new Date().toISOString(),
      };
      // Write metadata (owned by me) + my own member row.
      await (window as any).storage.set("tradr_circle_" + code, JSON.stringify(circle), true);
      await (window as any).storage.set(`tradr_circle_member_${code}_${me.code}`, JSON.stringify(me), true);
      const updated = [...myCircles, { ...circle, members: [me], isOwner: true }];
      await saveMyCircles(updated);
      setCircleForm({ name: "", description: "", strategy: "", privacy: "public", emoji: "◆", metric: "dollar" });
      setCirclesView("browse");
      showToast("Circle created");
    } finally {
      setIsCreatingCircle(false);
    }
  }

  async function joinCircle() {
    const code = circleJoinCode.trim().toUpperCase();
    if (!code) { setCircleMsg("Enter a circle code."); return; }
    if (myCircles.find(c => c.code === code)) { setCircleMsg("Already a member."); setTimeout(() => setCircleMsg(""), 2000); return; }
    if (isJoiningCircle) return;
    setIsJoiningCircle(true);
    try {
      const res = await (window as any).storage.get("tradr_circle_" + code, true);
      if (!res) { setCircleMsg("Circle not found. Check the code."); setTimeout(() => setCircleMsg(""), 2500); return; }
      const circle = JSON.parse(res.value);
      const me = myMemberRecord();
      // Only write my OWN member row. Do not mutate the creator's circle row.
      await (window as any).storage.set(`tradr_circle_member_${code}_${me.code}`, JSON.stringify(me), true);
      // Read the fresh member list (includes me, creator, and any others already in).
      const members = await readCircleMembers(code, [me]);
      const updated = [...myCircles, { ...circle, members, isOwner: false }];
      await saveMyCircles(updated);
      setCircleJoinCode("");
      setCircleMsg("Joined.");
      setTimeout(() => setCircleMsg(""), 2000);
    } catch { setCircleMsg("Error joining. Try again."); setTimeout(() => setCircleMsg(""), 2500); }
    finally { setIsJoiningCircle(false); }
  }

  /** Circle owner removes a member via ban list (RLS-safe — owner writes a row they own). */
  async function kickMember(circleCode: string, memberCode: string) {
    try {
      // Read the current ban list, add the member, write it back.
      // The ban row key is owned by the circle creator so RLS allows the write.
      const bans = await readCircleBans(circleCode);
      bans.add(memberCode);
      await (window as any).storage.set(
        `tradr_circle_bans_${circleCode}`,
        JSON.stringify([...bans]),
        true
      );
      // Update local state immediately so the UI reflects the kick without a refresh.
      const filterKicked = (m: any) => m.code !== memberCode;
      const updated = myCircles.map((c: Circle) =>
        c.code !== circleCode ? c : { ...c, members: c.members.filter(filterKicked) }
      );
      await saveMyCircles(updated);
      setActiveCircle((prev: Circle | null) =>
        prev?.code !== circleCode ? prev : { ...prev, members: prev.members.filter(filterKicked) }
      );
      showToast("Member removed");
    } catch {
      showToast("Couldn't remove member — try again");
    }
  }

  /** Member leaves a circle they joined. Deletes their own member + entry rows
   *  (they own both, so RLS allows it) and removes from local state. */
  async function leaveCircle(circleCode: string) {
    const myCode = getMyCode();
    try {
      await Promise.all([
        (window as any).storage.del(`tradr_circle_member_${circleCode}_${myCode}`, true),
        (window as any).storage.del(`tradr_circle_entry_${circleCode}_${myCode}`, true),
      ]);
    } catch { /* rows may not exist — that's fine */ }
    const updated = myCircles.filter((c: Circle) => c.code !== circleCode);
    await saveMyCircles(updated);
    setActiveCircle(null);
    setCirclesView("browse");
    showToast("Left circle");
  }

  async function publishToCircle(circleCode: string, silent = false) {
    const myCode = getMyCode();
    const entry = {
      memberCode: myCode, name: profile.name || "Trader",
      handle: profile.handle || "@trader", avatar: profile.avatar || "",
      alias: profile.alias?.trim() || myCode,
      wins, losses, total,
      winRate: parseFloat(winRate as any),
      totalPnL: parseFloat(totalPnL),
      totalPnLDollar: totalPnlDollar,
      weekPnL: weekPnL,
      avgRR: avgRR === "—" ? 0 : parseFloat(avgRR),
      streak: streak.count > 0 ? { type: streak.type, count: streak.count } : null,
      topStrategy: Object.entries(stratStats).sort((a: any, b: any) => b[1].w / Math.max(b[1].count, 1) - a[1].w / Math.max(a[1].count, 1))[0]?.[0] || null,
      updatedAt: new Date().toISOString(),
    };
    try { await (window as any).storage.set("tradr_circle_entry_" + circleCode + "_" + myCode, JSON.stringify(entry), true); }
    catch (e) { if (!silent) showToast("Publish failed"); return; }
    if (!silent) showToast("Stats published");
  }

  async function fetchCircleLeaderboard(circle: any) {
    // Always pull members fresh — sync effect may not have run yet, or a new
    // member may have joined since the last tick. Falls back to whatever's on
    // the passed circle object if the listByPrefix fails.
    const members = await readCircleMembers(circle.code, circle.members || []);

    // Batch fetch all entry rows for this circle in a single query instead of
    // one request per member (avoids N+1 round-trips).
    const prefix = `tradr_circle_entry_${circle.code}_`;
    let rowMap: Record<string, any> = {};
    try {
      const rows = await (window as any).storage.listByPrefix(prefix);
      for (const row of rows || []) {
        try {
          const parsed = JSON.parse(row.value);
          const memberCode = row.key.slice(prefix.length);
          rowMap[memberCode] = parsed;
        } catch { /* skip malformed rows */ }
      }
    } catch { /* fall through to per-member defaults */ }

    const entries: any[] = [];
    for (const m of members) {
      if (rowMap[m.code]) {
        entries.push(rowMap[m.code]);
      } else {
        entries.push({ memberCode: m.code, name: m.name, handle: m.handle, avatar: m.avatar, wins: 0, losses: 0, total: 0, winRate: 0, totalPnL: 0, avgRR: 0, streak: null, topStrategy: null, updatedAt: null });
      }
    }
    const m = circle.metric || "dollar";
    entries.sort((a, b) => {
      if (m === "dollar")  return (b.totalPnLDollar || 0) - (a.totalPnLDollar || 0);
      if (m === "r")       return (b.totalPnL || 0) - (a.totalPnL || 0);
      if (m === "winrate") return (b.winRate || 0) - (a.winRate || 0);
      if (m === "trades")  return (b.total || 0) - (a.total || 0);
      if (m === "avgr")    return (b.avgRR || 0) - (a.avgRR || 0);
      return (b.totalPnLDollar || 0) - (a.totalPnLDollar || 0);
    });
    return entries;
  }

  async function saveStratThresholds(u: any) { setStratThresholds(u); await (window as any).storage.set("tradr_thresholds", JSON.stringify(u)); }
  async function saveStratRules(u: any) { setStratRules(u); await (window as any).storage.set("tradr_rules", JSON.stringify(u)); }
  async function toggleDark() { const nd = !darkMode; setDarkMode(nd); await (window as any).storage.set("tradr_dark", JSON.stringify(nd)); }

  // Swipe handlers
  function onTouchStart(e: any) { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e: any) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const idx = TABS.indexOf(view);
      if (dx < 0 && idx < TABS.length - 1) setView(TABS[idx + 1]);
      if (dx > 0 && idx > 0) setView(TABS[idx - 1]);
    }
    touchStartX.current = null; touchStartY.current = null;
  }

  function handleChange(e: any) {
    const { name, value } = e.target;
    const u: any = { ...form, [name]: value };
    if (["entryPrice", "slPrice", "tpPrice"].includes(name)) u.rr = calcRR(name === "entryPrice" ? value : u.entryPrice, name === "slPrice" ? value : u.slPrice, name === "tpPrice" ? value : u.tpPrice);
    if (name === "strategy") u.setup = "";
    setForm(u);
  }

  async function submitTrade() {
    if (!form.pair || !form.date || !form.outcome || savingTrade) return;
    // Gate: free users limited to 20 trades
    if ((profile.plan ?? "free") === "free" && !editId && trades.length >= 20) {
      setShowUpgrade(true);
      return;
    }
    setSavingTrade(true);
    const now = new Date().toISOString();
    const base = { comments: [], reactions: {}, ...form, updatedAt: now };
    let u;
    if (editId) {
      // Preserve original createdAt; stamp new updatedAt.
      u = trades.map(t => t.id === editId ? { ...base, id: editId, createdAt: t.createdAt ?? now } : t);
      setEditId(null);
    } else {
      u = [{ ...base, id: Date.now(), createdAt: now }, ...trades];
    }
    await saveTrades(u); setForm(EMPTY_TRADE);
    showToast("Trade saved");
    setTimeout(() => setSavingTrade(false), 1500);
    setView("history");
  }

  function editTrade(t: any) { setForm(t); setEditId(t.id); setView("log"); }
  async function deleteTrade(id: any) { await saveTrades(trades.filter(t => t.id !== id)); setConfirmDelete(null); showToast("Trade deleted"); }
  async function toggleReaction(tid: any, reaction: any) {
    const myCode = getMyCode();
    const u = trades.map((t: any) => {
      if (t.id !== tid) return t;
      const r: any = { ...(t.reactions || {}) };
      const current = r[reaction];
      if (!Array.isArray(current)) {
        // Migration: old format was a count number. Treat it as having no known reactors
        // and seed with the current user so they can toggle off next time.
        r[reaction] = [myCode];
      } else if (current.includes(myCode)) {
        // Already reacted — remove (toggle off).
        const next = current.filter((c: string) => c !== myCode);
        if (next.length === 0) delete r[reaction];
        else r[reaction] = next;
      } else {
        // Add reaction.
        r[reaction] = [...current, myCode];
      }
      return { ...t, reactions: r };
    });
    await saveTrades(u);
  }
  async function addComment(tid: any) {
    const text = (commentInputs[tid] || "").trim();
    if (!text) return;
    const c = { id: Date.now(), author: profile.name || "You", text, ts: new Date().toLocaleString() };
    const u = trades.map(t => t.id === tid ? { ...t, comments: [...(t.comments || []), c] } : t);
    await saveTrades(u);
    setCommentInputs((p: any) => ({ ...p, [tid]: "" }));
  }
  async function deleteComment(tid: any, cid: any) {
    const myName = profile.name || "You";
    // Guard: only let the comment author delete their own comment.
    const trade = trades.find((t: any) => t.id === tid);
    const comment = (trade?.comments || []).find((c: any) => c.id === cid);
    if (!comment) return;
    const isAuthor = comment.author === myName || comment.author === "You";
    if (!isAuthor) { showToast("Can't delete someone else's comment"); return; }
    const u = trades.map((t: any) => t.id === tid ? { ...t, comments: (t.comments || []).filter((c: any) => c.id !== cid) } : t);
    await saveTrades(u);
  }

  // Screenshot upload
  async function handleScreenshotUpload(e: any, tradeId: any) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast("Image too large — max 15MB"); return; }
    if (!file.type.startsWith("image/")) { showToast("File must be an image"); return; }
    const compressed = await compressImage(file, 800);
    if (tradeId) { const u = trades.map(t => t.id === tradeId ? { ...t, screenshot: compressed } : t); await saveTrades(u); }
    else setForm((f: any) => ({ ...f, screenshot: compressed }));
  }
  async function removeScreenshot(tradeId: any) {
    if (tradeId) { const u = trades.map(t => t.id === tradeId ? { ...t, screenshot: "" } : t); await saveTrades(u); }
    else setForm((f: any) => ({ ...f, screenshot: "" }));
  }

  // Avatar upload
  async function handleAvatarUpload(e: any) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Avatar too large — max 5MB"); return; }
    if (!file.type.startsWith("image/")) { showToast("File must be an image"); return; }
    const compressed = await compressImage(file, 300);
    setProfileDraft((d: any) => ({ ...d, avatar: compressed }));
  }

  // Checklist helpers
  const checkItems = stratChecklists[activeStrategy] || [];
  const ruleItems = stratRules[activeStrategy] || [];
  function toggleCheck(id: any) { setChecked((p: any) => ({ ...p, [`${activeStrategy}-${id}`]: !p[`${activeStrategy}-${id}`] })); }
  function isChecked(id: any) { return !!checked[`${activeStrategy}-${id}`]; }
  function resetChecklist() { const n = { ...checked }; checkItems.forEach((i: any) => { delete n[`${activeStrategy}-${i.id}`]; }); setChecked(n); }
  async function addCheckItem() { if (!newCheckText.trim()) return; const u = { ...stratChecklists, [activeStrategy]: [...checkItems, { id: Date.now(), text: newCheckText.trim() }] }; await saveStratChecklists(u); setNewCheckText(""); setAddingCheck(false); }
  async function deleteCheckItem(id: any) { const u = { ...stratChecklists, [activeStrategy]: checkItems.filter((i: any) => i.id !== id) }; await saveStratChecklists(u); }
  async function saveEditCheck(id: any, text: string) { const u = { ...stratChecklists, [activeStrategy]: checkItems.map((i: any) => i.id === id ? { ...i, text } : i) }; await saveStratChecklists(u); setEditingCheckItem(null); }
  async function addRule() { if (!newRuleText.trim()) return; const u = { ...stratRules, [activeStrategy]: [...ruleItems, { id: Date.now(), text: newRuleText.trim() }] }; await saveStratRules(u); setNewRuleText(""); setAddingRule(false); }
  async function deleteRule(id: any) { const u = { ...stratRules, [activeStrategy]: ruleItems.filter((r: any) => r.id !== id) }; await saveStratRules(u); }
  async function saveEditRule(id: any, text: string) { const u = { ...stratRules, [activeStrategy]: ruleItems.map((r: any) => r.id === id ? { ...r, text } : r) }; await saveStratRules(u); setEditingRule(null); }

  // Friends
  // ── Stable user code (rename-safe) ──────────────────────────────
  // Once a user has a code, it is LOCKED to their profile.code field. Renaming
  // (changing profile.name) does not change their code — followers and circle
  // entries keyed to the old code keep working. Only on first call do we
  // synthesize one from the auth uid (or a random fallback for offline users)
  // and persist it. This is the fix for BETA-SMOKE-TEST.md Phase 0.2.
  function getMyCode() {
    if ((profile as any).code) return (profile as any).code;
    const authUid = (user as any)?.id;
    const uid: string = profile.uid || authUid || Math.random().toString(36).slice(2, 10).toUpperCase();
    const namePart = (profile.name || "").toUpperCase().replace(/\s+/g, "").slice(0, 6);
    // FNV-1a 32-bit hash for short, stable codes when we have no name.
    let h = 0x811c9dc5;
    for (let i = 0; i < uid.length; i++) {
      h ^= uid.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    const fallback = "T-" + h.toString(16).padStart(8, "0").toUpperCase();
    const code = namePart ? `${namePart}-${uid}` : fallback;
    // Persist the code AND the uid so future calls hit the early-return above.
    saveProfile({ ...profile, uid, code });
    return code;
  }
  async function addFriend() {
    const code = friendCodeInput.trim().toUpperCase();
    if (!code) return;
    if (friends.find(f => f.code === code)) { setFriendMsg("Already added."); setTimeout(() => setFriendMsg(""), 2000); return; }
    const u = [...friends, { code, name: code.split("-")[0], addedAt: new Date().toISOString() }];
    await saveFriends(u);
    setFriendCodeInput("");
    setFriendMsg("Friend added.");
    setTimeout(() => setFriendMsg(""), 2500);
  }
  async function removeFriend(code: string) { await saveFriends(friends.filter(f => f.code !== code)); }

  // ── Handle registry ────────────────────────────────────────────
  // Maps @handle → { code, name } in shared_kv. Owner = the handle's user,
  // so only they can update/delete their own handle row (RLS-safe).
  // Key: `tradr_handle_${normalised}` where normalised = lowercase, no @.
  function normaliseHandle(h: string): string {
    return h.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  }
  async function resolveHandle(handle: string): Promise<{ code: string; name: string } | null> {
    try {
      const key = `tradr_handle_${normaliseHandle(handle)}`;
      const r = await (window as any).storage.get(key, true);
      if (!r) return null;
      return JSON.parse(r.value);
    } catch { return null; }
  }
  async function registerHandle(handle: string, oldHandle: string | null): Promise<void> {
    const mc = getMyCode();
    const norm = normaliseHandle(handle);
    if (!norm) return;
    // Clean up old handle row if the handle changed (we own it, RLS allows delete).
    if (oldHandle && normaliseHandle(oldHandle) !== norm) {
      try { await (window as any).storage.del(`tradr_handle_${normaliseHandle(oldHandle)}`, true); } catch {}
    }
    await (window as any).storage.set(
      `tradr_handle_${norm}`,
      JSON.stringify({ code: mc, name: profile.name || "Trader" }),
      true
    );
  }
  async function isHandleTaken(handle: string): Promise<boolean> {
    const existing = await resolveHandle(handle);
    if (!existing) return false;
    // It's taken only if owned by someone else.
    return existing.code !== getMyCode();
  }

  // ── Follow system (per-row edges, one-way) ─────────────────────
  // Every follow writes TWO rows, both owned by the follower:
  //   tradr_follow_<follower>_<target>    — for prefix-listing my "following"
  //   tradr_follower_<target>_<follower>  — for prefix-listing my "followers"
  // A single shared list failed RLS the moment a second follower tried to
  // append (first writer owns the row, second writer's UPDATE is blocked).
  // Per-row edges sidestep this: each follow creates *new* rows the follower
  // owns, never updates someone else's.
  async function followUser(code: string) {
    const target = code.trim().toUpperCase();
    if (!target) return;
    const mc = getMyCode();
    if (target === mc) { showToast("That's you"); return; }
    if (following.includes(target)) return;
    // Optimistic local state
    setFollowing([...following, target]);
    const edge = { follower: mc, target, at: new Date().toISOString() };
    try { await (window as any).storage.set(`tradr_follow_${mc}_${target}`, JSON.stringify(edge), true); } catch {}
    try { await (window as any).storage.set(`tradr_follower_${target}_${mc}`, JSON.stringify(edge), true); } catch {}
    showToast("Following");
  }
  async function unfollowUser(code: string) {
    const target = code.trim().toUpperCase();
    if (!target) return;
    const mc = getMyCode();
    setFollowing(following.filter(c => c !== target));
    // Delete both edges. We own both, so RLS lets us through.
    try { await (window as any).storage.delete(`tradr_follow_${mc}_${target}`, true); } catch {}
    try { await (window as any).storage.delete(`tradr_follower_${target}_${mc}`, true); } catch {}
    showToast("Unfollowed");
  }
  // ── Data export ──────────────────────────────────────────────────────────
  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: { name: profile.name, handle: profile.handle, bio: profile.bio, broker: profile.broker, timezone: profile.timezone },
      trades: trades.map(t => ({
        date: t.date, pair: t.pair, session: t.session, bias: t.bias, strategy: t.strategy,
        setup: t.setup, entryPrice: t.entryPrice, slPrice: t.slPrice, tpPrice: t.tpPrice,
        rr: t.rr, outcome: t.outcome, pnl: t.pnl, pnlDollar: t.pnlDollar,
        notes: t.notes, emotions: t.emotions,
      })),
      tradeCount: trades.length,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradr-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Export downloaded");
  }

  function exportCSV() {
    const headers = ["Date","Pair","Session","Bias","Strategy","Setup","Entry","SL","TP","R:R","Outcome","P&L (R)","P&L ($)","Notes","Emotions"];
    const rows = trades.map(t => [
      t.date, t.pair, t.session, t.bias, t.strategy, t.setup,
      t.entryPrice, t.slPrice, t.tpPrice, t.rr, t.outcome, t.pnl, t.pnlDollar,
      `"${(t.notes || "").replace(/"/g, '""')}"`,
      `"${(Array.isArray(t.emotions) ? t.emotions.join(", ") : t.emotions || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradr-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded");
  }

  async function submitFeedback() {
    if (!feedbackText.trim() || feedbackSending || feedbackSent) return;
    setFeedbackSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackText.trim(), name: profile.name, handle: profile.handle }),
      });
      if (res.ok) {
        setFeedbackSent(true);
        setFeedbackSending(false);
        setTimeout(() => {
          setFeedbackOpen(false);
          setFeedbackText("");
          setFeedbackSent(false);
        }, 1500);
        return;
      } else {
        showToast("Failed to send — try again");
      }
    } catch {
      showToast("Failed to send — try again");
    }
    setFeedbackSending(false);
  }

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  async function deleteAccount() {
    if (deleteConfirm.toUpperCase() !== "DELETE") { showToast("Type DELETE to confirm"); return; }
    setDeletingAccount(true);
    try {
      const mc = getMyCode();
      // Wipe all user_kv rows (trades, profile, checklists, etc)
      const keys = ["tradr_trades","tradr_profile","tradr_friends","tradr_feed","tradr_checklists","tradr_rules","tradr_dark","tradr_circles","tradr_thresholds","tradr_custom_strategies"];
      await Promise.all(keys.map(k => (window as any).storage.del(k).catch(() => {})));
      // Wipe shared_kv rows we own (circle entries, feed, handle, follows)
      await Promise.all([
        `tradr_feed_${mc}`,
        `tradr_handle_${profile.handle ? profile.handle.replace("@","").toLowerCase() : ""}`,
      ].map(k => (window as any).storage.del(k, true).catch(() => {})));
      // Sign out and let Supabase handle auth deletion
      await supabase.auth.signOut();
      showToast("Account data wiped. Goodbye.");
    } catch (e) {
      showToast("Error deleting account. Please contact support.");
    } finally {
      setDeletingAccount(false);
    }
  }

  // ── Follow by @handle (resolves handle → code, then follows) ──
  const [followHandleInput, setFollowHandleInput] = useState("");
  const [followHandleMsg, setFollowHandleMsg] = useState("");
  const [followHandleLoading, setFollowHandleLoading] = useState(false);
  async function followByHandle() {
    const raw = followHandleInput.trim();
    if (!raw) return;
    setFollowHandleLoading(true);
    setFollowHandleMsg("");
    try {
      const resolved = await resolveHandle(raw);
      if (!resolved) {
        setFollowHandleMsg("User not found. Check the username.");
        setTimeout(() => setFollowHandleMsg(""), 3000);
        return;
      }
      if (resolved.code === getMyCode()) {
        setFollowHandleMsg("That's you.");
        setTimeout(() => setFollowHandleMsg(""), 2000);
        return;
      }
      await followUser(resolved.code);
      setFollowHandleInput("");
      setFollowHandleMsg(`Now following @${normaliseHandle(raw)}.`);
      setTimeout(() => setFollowHandleMsg(""), 2500);
    } finally {
      setFollowHandleLoading(false);
    }
  }

  // Friends = mutual follows (I follow them + they follow me).
  const friendCodes = following.filter(c => followers.includes(c));
  async function publishFeed() {
    const mc = getMyCode();
    const items = trades.slice(0, 10).map(t => ({ authorCode: mc, authorName: profile.name || "Trader", authorHandle: profile.handle || "@trader", authorAvatar: profile.avatar || "", tradeId: t.id, pair: t.pair, date: t.date, outcome: t.outcome, pnl: t.pnl, rr: t.rr, strategy: t.strategy, setup: t.setup, notes: t.notes, session: t.session, reactions: t.reactions || {}, comments: (t.comments || []).length, publishedAt: new Date().toISOString() }));
    await (window as any).storage.set(`tradr_feed_${mc}`, JSON.stringify(items), true);
  }
  async function refreshFeed() {
    const items: any[] = [];
    // Read feeds from everyone in the new follow system (following) + old friends list
    const allCodes = new Set([...following, ...friends.map((f: any) => f.code)]);
    for (const code of allCodes) {
      try { const r = await (window as any).storage.get(`tradr_feed_${code}`, true); if (r) { const d = JSON.parse(r.value); items.push(...d); } } catch { }
    }
    items.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
    setFriendFeed(items);
    await (window as any).storage.set("tradr_feed", JSON.stringify(items));
  }
  function reactToFeed(ac: string, tid: any, reaction: string) {
    const key = `${ac}_${tid}_${reaction}`;
    const alreadyReacted = myFeedReactions.has(key);
    setMyFeedReactions(prev => {
      const next = new Set(prev);
      alreadyReacted ? next.delete(key) : next.add(key);
      return next;
    });
    setFriendFeed((p: any) => p.map((item: any) => {
      if (item.authorCode !== ac || item.tradeId !== tid) return item;
      const r = { ...item.reactions };
      const cur = typeof r[reaction] === "number" ? r[reaction] : (Array.isArray(r[reaction]) ? r[reaction].length : 0);
      r[reaction] = alreadyReacted ? Math.max(0, cur - 1) : cur + 1;
      return { ...item, reactions: r };
    }));
  }

  // Stats — memoised so derived values only recompute when `trades` changes.
  const { wins, losses, bes, total, winRate, totalPnL } = useMemo(() => {
    const wins    = trades.filter(t => t.outcome === "Win").length;
    const losses  = trades.filter(t => t.outcome === "Loss").length;
    const bes     = trades.filter(t => t.outcome === "Breakeven").length;
    const total   = trades.length;
    const winRate: any = total ? ((wins / total) * 100).toFixed(1) : 0;
    const totalPnL = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0).toFixed(2);
    return { wins, losses, bes, total, winRate, totalPnL };
  }, [trades]);

  // ── This-week trades (Mon 00:00 local → now) ──────────────────────────────
  const weekTrades = (() => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun … 6=Sat
    const msSinceMonday = ((day === 0 ? 6 : day - 1)) * 86400000
      + now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
    const weekStart = new Date(now.getTime() - msSinceMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];
    return trades.filter(t => t.date >= weekStartStr);
  })();
  const weekPnL = weekTrades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
  const weekPnLStr = weekPnL.toFixed(2);
  const weekPnLPos = weekPnL >= 0;
  // Dollar P&L — only from trades that have pnlDollar set
  const hasDollarData = trades.some(t => t.pnlDollar && t.pnlDollar !== "");
  const totalPnlDollar = trades.reduce((a, t) => a + (parseFloat(t.pnlDollar) || 0), 0);
  const weekPnlDollar = weekTrades.reduce((a, t) => a + (parseFloat(t.pnlDollar) || 0), 0);
  const rrTrades = trades.filter(t => t.rr);
  const avgRR = rrTrades.length ? (rrTrades.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTrades.length).toFixed(2) : "—";
  const pnlPos = parseFloat(totalPnL) >= 0;
  const streak = (() => { if (!trades.length) return { type: null, count: 0 } as any; let count = 0, type: any = null; for (const t of trades) { if (t.outcome === "Win" || t.outcome === "Loss") { if (type === null) { type = t.outcome; count = 1; } else if (t.outcome === type) count++; else break; } }; return { type, count }; })();
  const stratStats = trades.reduce((acc: any, t: any) => { if (t.strategy) { if (!acc[t.strategy]) acc[t.strategy] = { w: 0, l: 0, be: 0, pnl: 0, count: 0 }; acc[t.strategy].count++; if (t.outcome === "Win") acc[t.strategy].w++; if (t.outcome === "Loss") acc[t.strategy].l++; if (t.outcome === "Breakeven") acc[t.strategy].be++; acc[t.strategy].pnl += parseFloat(t.pnl) || 0; } return acc; }, {});
  const sessionStats = trades.reduce((acc: any, t: any) => { if (t.session) { if (!acc[t.session]) acc[t.session] = { w: 0, l: 0, pnl: 0 }; if (t.outcome === "Win") acc[t.session].w++; if (t.outcome === "Loss") acc[t.session].l++; acc[t.session].pnl += parseFloat(t.pnl) || 0; } return acc; }, {});
  const pairStats = trades.reduce((acc: any, t: any) => { if (t.pair) { if (!acc[t.pair]) acc[t.pair] = { w: 0, l: 0, pnl: 0 }; if (t.outcome === "Win") acc[t.pair].w++; if (t.outcome === "Loss") acc[t.pair].l++; acc[t.pair].pnl += parseFloat(t.pnl) || 0; } return acc; }, {});
  const filteredTrades = useMemo(() => trades.filter(t => {
    if (filter.outcome && t.outcome !== filter.outcome) return false;
    if (filter.setup && t.setup !== filter.setup) return false;
    if (filter.pair && !t.pair.toLowerCase().includes(filter.pair.toLowerCase())) return false;
    if (filter.strategy && t.strategy !== filter.strategy) return false;
    if (filter.dateFrom && t.date < filter.dateFrom) return false;
    if (filter.dateTo && t.date > filter.dateTo) return false;
    return true;
  }), [trades, filter]);

  const checkedCount = checkItems.filter((i: any) => isChecked(i.id)).length;
  const totalItems = checkItems.length;
  const scorePct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
  const insights = useMemo(() => generateInsights(trades), [trades]);
  const _allStratMap = getAllStrategiesMap();
  const allSetups = allStrategyNames.flatMap((s: string) => _allStratMap[s]?.setups || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

  // ─── SHARED STYLES (editorial) ─────────────────────────────────────────────
  const inp: React.CSSProperties = {
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${C.border2}`,
    borderRadius: 0,
    color: C.text,
    padding: "12px 0",
    minHeight: "44px",
    fontSize: "16px",
    width: "100%",
    outline: "none",
    fontFamily: BODY,
    boxSizing: "border-box",
    letterSpacing: "0.01em",
  };
  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
  const lbl: React.CSSProperties = {
    fontSize: "11px",
    color: C.muted,
    letterSpacing: "0.06em",
    marginBottom: "4px",
    display: "block",
    fontFamily: MONO,
    textTransform: "uppercase",
  };
  const pillPrimary = (enabled = true): React.CSSProperties => ({
    background: enabled ? C.text : "transparent",
    color: enabled ? C.bg : C.muted,
    border: enabled ? "none" : `1px solid ${C.border2}`,
    borderRadius: "999px",
    padding: "14px 20px",
    fontSize: "13px",
    letterSpacing: "0.02em",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: BODY,
    width: "100%",
    transition: "opacity 0.15s, transform 0.15s",
  });
  const pillGhost: React.CSSProperties = {
    background: "transparent",
    color: C.text,
    border: `1px solid ${C.border2}`,
    borderRadius: "999px",
    padding: "12px 18px",
    minHeight: "44px",
    fontSize: "12px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: MONO,
    textTransform: "uppercase",
    transition: "opacity 0.15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const NAV_TABS = [
    { id: "home",    label: "HOME"    },
    { id: "log",     label: "LOG"     },
    { id: "history", label: "JOURNAL" },
    { id: "stats",   label: "STATS"   },
    { id: "import",  label: "IMPORT"  },
    { id: "circles", label: "CIRCLES" },
  ];

  // Sub-section config per main view — fed to the desktop SubNavDropdown so
  // main-nav + sub-nav fit on one row instead of stacking into two.
  const HOME_SECTIONS = [
    { id: "feed", label: "Overview" },
    { id: "analytics", label: "Analytics" },
    { id: "ai", label: "Insights" },
    { id: "rules", label: "Rules" },
  ];
  const STATS_SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "performance", label: "Performance" },
    { id: "strategies", label: "Strategies" },
    { id: "calendar", label: "Calendar" },
    { id: "psychology", label: "Psychology" },
    { id: "heatmap", label: "Heatmap" },
    { id: "maemfe", label: "MAE/MFE" },
  ];
  const CHECKLIST_SECTIONS = [
    { id: "pretrade", label: "Pre-trade" },
    { id: "rules", label: "Rules" },
  ];
  const subNavFor = (v: string) => {
    if (v === "home") return { sections: HOME_SECTIONS, value: homeSection, onChange: setHomeSection };
    if (v === "stats") return { sections: STATS_SECTIONS, value: statsTab, onChange: setStatsTab };
    if (v === "checklist") return { sections: CHECKLIST_SECTIONS, value: checklistTab, onChange: setChecklistTab };
    return null;
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: DARK.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px" }}>
      <TrMark size={72} bg={DARK.panel} />
    </div>
  );

  // Show onboarding for new users who haven't completed the flow yet.
  // Also check localStorage as a backup in case the Supabase write failed mid-onboarding.
  const _localOnboarded = typeof window !== "undefined" && localStorage.getItem("tradr_onboarded") === "1";
  if (!profile.onboarded && !_localOnboarded) {
    return (
      <OnboardingFlow
        C={C}
        allStrategyNames={allStrategyNames}
        onComplete={async ({ name, handle, avatar, bio, twitter, instruments, strategy }: OnboardingData) => {
          // Set localStorage immediately so a refresh won't re-show onboarding
          // even if the Supabase write hasn't completed yet.
          try { localStorage.setItem("tradr_onboarded", "1"); } catch {}
          const cleanHandle = handle.trim() || `@${name.trim().toLowerCase().replace(/\s+/g, "")}`;
          const updated: Profile = {
            ...profile,
            name: name.trim(),
            handle: cleanHandle,
            avatar: avatar || profile.avatar,
            bio: bio.trim() || profile.bio,
            broker: profile.broker,
            timezone: profile.timezone,
            startDate: profile.startDate,
            targetRR: profile.targetRR,
            maxTradesPerDay: profile.maxTradesPerDay,
            onboarded: true,
            instruments: instruments.length > 0 ? instruments : profile.instruments,
            socialLinks: twitter.trim() ? { twitter: twitter.trim() } : profile.socialLinks,
          };
          await saveProfile(updated);
          // If they picked a strategy, pre-select it in the log form so their first trade is faster.
          if (strategy) setForm((f: Partial<Trade>) => ({ ...f, strategy }));
          setView("log");
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: BODY, transition: "background 0.2s, color 0.2s" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px;}
        input::placeholder,textarea::placeholder{color:${C.dim};font-weight:400;}
        input:focus,textarea:focus,select:focus{border-bottom-color:${C.text}!important;}
        .tradr-app input[type=date]::-webkit-calendar-picker-indicator{filter:${darkMode ? "invert(0.7)" : "invert(0.3)"};}
        .tradr-app select option{background:${C.panel};color:${C.text};}
        .tradr-app button:hover:not(:disabled){opacity:0.88;}
        .tradr-app button:active:not(:disabled){transform:scale(0.99);}
        .row-hvr{cursor:pointer;transition:opacity 0.15s;}
        .row-hvr:hover{opacity:0.75;}
        .check-row:hover .ca{opacity:1!important;}
        @media(hover:none){.ca{opacity:1!important;}}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes livePulse{0%,100%{transform:scale(1);opacity:0.4}50%{transform:scale(2.2);opacity:0}}
        .fade-in{animation:rise 0.25s ease;}
        input[type=file]{display:none;}
      `}</style>

      {/* ── PAGE FRAME (responsive: 480px canvas on mobile, up to 960px on desktop) ── */}
      <div className="tradr-app" ref={swipeRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={{ maxWidth: isDesktop ? "1280px" : "480px", margin: "0 auto", paddingBottom: isDesktop ? "32px" : "84px", minHeight: "100vh", background: C.bg, borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>

        {/* ── MASTHEAD ── */}
        <header style={{ padding: isDesktop ? "18px 40px 0" : "14px 22px 12px", borderBottom: `0.5px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: isDesktop ? "14px" : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <TrMark size={isDesktop ? 26 : 24} bg={C.panel} />
              <span style={{ fontFamily: DISPLAY, fontSize: isDesktop ? "17px" : "15px", fontWeight: 700, letterSpacing: "-0.02em", color: C.text, lineHeight: 1 }}>TRADR</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "14px", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <button
                onClick={() => { setView("home"); setHomeSection("settings"); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: C.text, fontFamily: MONO, fontSize: "12px",
                  letterSpacing: "0.06em", padding: "4px 8px",
                  borderRadius: "6px", transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.border2 ?? "#3A3A34")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
                title="Go to your profile"
              >
                {profile.handle || "@trader"}
                {(profile.plan === "pro" || profile.plan === "elite") && (
                  <CrownIcon size={11} color="currentColor" />
                )}
              </button>
              <button onClick={() => supabase.auth.signOut()}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 4px", minHeight: "44px" }}>
                sign out →
              </button>
            </div>
          </div>
          {/* Desktop nav is in the sidebar — masthead just shows the logo/handle */}
          {false && (
            <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", borderTop: `0.5px solid ${C.border}`, paddingTop: "12px", paddingBottom: "12px" }}>
              <div style={{ display: "flex", gap: "24px", overflowX: "auto", minWidth: 0 }}>
                {NAV_TABS.map(tab => (
                  <button key={tab.id} onClick={() => setView(tab.id)}
                    style={{ background: "none", border: "none", padding: 0, color: view === tab.id ? C.text : C.dim, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", borderBottom: view === tab.id ? `1px solid ${C.text}` : "1px solid transparent", paddingBottom: "3px", whiteSpace: "nowrap", transition: "color 0.12s ease" }}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {(() => { const s = subNavFor(view); return s ? <SubNavDropdown sections={s.sections} value={s.value} onChange={s.onChange} C={C} /> : null; })()}
                <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={view === "home" && homeSection === "settings"} C={C} />
              </div>
            </nav>
          )}
        </header>

        {/* ── CONTENT — desktop: sidebar+main grid; mobile: single column ── */}
        <div style={{ display:isDesktop?"grid":"block", gridTemplateColumns:isDesktop?"220px 1fr":undefined }} className="fade-in" key={view}>
          {isDesktop && (
            <aside style={{ borderRight:`1px solid ${C.border}`, padding:"28px 0 32px", position:"sticky", top:"64px", height:"calc(100vh - 64px)", overflowY:"auto", display:"flex", flexDirection:"column" }}>
              <div style={{ flex:1 }}>
                {NAV_TABS.map(tab => {
                  const sn = subNavFor(tab.id); const ia = view === tab.id;
                  return (
                    <div key={tab.id}>
                      <button onClick={()=>setView(tab.id)} style={{ display:"flex", alignItems:"center", width:"100%", background:ia?C.panel:"transparent", border:"none", borderLeft:ia?`2px solid ${C.text}`:"2px solid transparent", padding:"10px 22px", cursor:"pointer", fontFamily:MONO, fontSize:"11px", letterSpacing:"0.1em", textTransform:"uppercase", color:ia?C.text:C.dim, textAlign:"left", transition:"all 0.12s ease" }}>
                        {tab.label}
                      </button>
                      {ia && sn && (
                        <div style={{ paddingLeft:"28px", paddingBottom:"4px" }}>
                          {sn.sections.map((sec: any)=>(
                            <button key={sec.id} onClick={()=>sn.onChange(sec.id)} style={{ display:"block", width:"100%", background:"none", border:"none", padding:"6px 0", cursor:"pointer", fontFamily:MONO, fontSize:"10px", letterSpacing:"0.07em", color:sn.value===sec.id?C.text:C.muted, textAlign:"left", textTransform:"uppercase", transition:"color 0.12s" }}>
                              {sec.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:"20px 22px 0", borderTop:`1px solid ${C.border}` }}>
                <button onClick={toggleDark} style={{ background:"none", border:`1px solid ${C.border2}`, borderRadius:"999px", padding:"7px 14px", cursor:"pointer", fontFamily:MONO, fontSize:"10px", letterSpacing:"0.08em", color:C.muted, textTransform:"uppercase" }}>
                  {darkMode?"Light Mode":"Dark Mode"}
                </button>
              </div>
            </aside>
          )}
          <div style={{ padding:isDesktop?"32px 48px 0":"24px 22px 0", minWidth:0 }}>

          {/* ══════════════════════════ HOME ══════════════════════════ */}
          {view === "home" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Section sub-nav dropdown — mobile only; desktop uses the dropdown in the top-nav */}
              {!isDesktop && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", paddingBottom: "10px", borderBottom: `0.5px solid ${C.border}` }}>
                  <SubNavDropdown sections={HOME_SECTIONS} value={homeSection} onChange={setHomeSection} C={C} />
                  <GearButton onClick={() => setHomeSection("settings")} active={homeSection === "settings"} C={C} />
                </div>
              )}

              {/* FEED */}
              {homeSection === "feed" && (
                <div>
                  {/* Hero stat — P&L with time + unit toggles */}
                  {(() => {
                    const isWeek = timeMode === "week";
                    const isDollar = pnlMode === "$" && hasDollarData;
                    const val = isWeek
                      ? (isDollar ? weekPnlDollar : weekPnL)
                      : (isDollar ? totalPnlDollar : parseFloat(totalPnL));
                    const valPos = val >= 0;
                    const valStr = isDollar
                      ? `${valPos ? "+" : "−"}$${Math.abs(val).toFixed(2)}`
                      : `${valPos ? "+" : ""}${val.toFixed(2)}`;
                    const tradeCount = isWeek ? weekTrades.length : total;
                    return (
                      <section style={{ marginTop: "clamp(24px, 5vw, 40px)" }}>
                        {/* Toggle row */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                          {/* Time toggle */}
                          <div style={{ display: "flex", gap: "4px" }}>
                            {(["week", "all"] as const).map(m => (
                              <button key={m} onClick={() => setTimeMode(m)}
                                style={{ background: timeMode === m ? C.text : "transparent", color: timeMode === m ? C.bg : C.muted, border: `1px solid ${timeMode === m ? C.text : C.border2}`, borderRadius: "999px", padding: "10px 14px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center" }}>
                                {m === "week" ? "This Week" : "All Time"}
                              </button>
                            ))}
                          </div>
                          {/* Unit toggle — only if dollar data exists */}
                          {hasDollarData && (
                            <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
                              {(["r", "$"] as const).map(m => (
                                <button key={m} onClick={() => setPnlMode(m)}
                                  style={{ background: pnlMode === m ? C.text : "transparent", color: pnlMode === m ? C.bg : C.muted, border: `1px solid ${pnlMode === m ? C.text : C.border2}`, borderRadius: "999px", padding: "10px 16px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center" }}>
                                  {m === "r" ? "R" : "$"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Big number */}
                        <div style={{ fontFamily: DISPLAY, fontSize: "clamp(56px, 14vw, 84px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95, color: C.text, marginBottom: "8px" }}>
                          {valStr}{!isDollar && <span style={{ color: C.muted, fontStyle: "italic", fontWeight: 500 }}>R</span>}
                        </div>
                        {/* Subtitle */}
                        <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2 }}>
                          {tradeCount === 0
                            ? <span style={{ color: C.muted }}>{isWeek ? "No trades logged this week." : "No trades logged yet."}</span>
                            : <><span style={{ color: valPos ? C.green : C.red }}>{valPos ? "Up" : "Down"}</span> over {tradeCount} trade{tradeCount !== 1 ? "s" : ""}{isWeek ? " this week" : " all time"}.</>
                          }
                        </div>
                      </section>
                    );
                  })()}

                  {/* Secondary stats — mono labels, hairline-separated */}
                  <section style={{ marginTop: "40px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", }}>
                      {[
                        { label: "WIN RATE", value: `${winRate}%` },
                        { label: "AVG R:R", value: avgRR === "—" ? "—" : `${avgRR}R` },
                        { label: "STREAK", value: streak.count > 0 ? `${streak.count}${streak.type === "Win" ? "W" : "L"}` : "—" },
                      ].map((s, i) => (
                        <div key={s.label} style={{ padding: "16px 12px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
                          <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>{s.label}</div>
                          <div style={{ fontFamily: DISPLAY, fontSize: "24px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Record line — W / L / BE */}
                  {total > 0 && (
                    <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>
                      <span>{wins}W · {losses}L · {bes}BE</span>
                      <span>{total} total</span>
                    </div>
                  )}

                  {/* Daily risk dashboard + kill switch */}
                  {(() => {
                    const today = new Date().toISOString().split("T")[0];
                    const todayTrades = trades.filter(t => t.date === today);
                    const maxTrades = parseInt(profile.maxTradesPerDay) || 0;
                    const todayPnl = todayTrades.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0);
                    const targetRR = parseFloat(profile.targetRR) || 0;
                    const maxLoss = parseFloat(profile.maxDailyLoss || "0") || 0;
                    const atLimit = maxTrades > 0 && todayTrades.length >= maxTrades;
                    const nearLimit = maxTrades > 0 && todayTrades.length === maxTrades - 1;
                    const killSwitchTripped = maxLoss > 0 && todayPnl <= -maxLoss;
                    if (todayTrades.length === 0 && maxTrades === 0 && maxLoss === 0) return null;

                    if (killSwitchTripped) return (
                      <section style={{ marginTop: "28px", padding: "20px 16px", border: `1px solid ${C.red}`, borderRadius: "10px", background: C.red + "12" }}>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.red, letterSpacing: "0.18em", marginBottom: "10px" }}>KILL SWITCH ACTIVE</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.red, marginBottom: "8px" }}>
                          Daily halt — {todayPnl.toFixed(2)}R
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.6, marginBottom: "14px" }}>
                          You've hit your max daily loss of {maxLoss}R. Step away, review your trades, and come back tomorrow.
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button onClick={() => setView("stats")}
                            style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "8px 16px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.text2 }}>
                            Review Today
                          </button>
                          <button onClick={() => { if (confirm("Override kill switch? Only do this if this was a data entry error.")) saveProfile({ ...profile, maxDailyLoss: "" }); }}
                            style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "8px 16px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
                            Override
                          </button>
                        </div>
                      </section>
                    );

                    return (
                      <section style={{ marginTop: "28px", padding: "16px", border: `1px solid ${atLimit ? C.red + "66" : C.border}`, borderRadius: "10px", background: atLimit ? C.red + "08" : "transparent" }}>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>TODAY</div>
                        <div style={{ display: "grid", gridTemplateColumns: maxLoss > 0 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: "8px" }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TRADES</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: atLimit ? C.red : nearLimit ? C.text2 : C.text }}>
                              {todayTrades.length}{maxTrades > 0 ? `/${maxTrades}` : ""}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>P&L TODAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: todayPnl >= 0 ? C.green : C.red }}>
                              {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(2)}R
                            </div>
                          </div>
                          {targetRR > 0 && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TARGET</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: todayPnl >= targetRR ? C.green : C.muted }}>
                                {targetRR}R
                              </div>
                            </div>
                          )}
                          {maxLoss > 0 && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>MAX LOSS</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: todayPnl <= -(maxLoss * 0.75) ? C.red : C.muted }}>
                                -{maxLoss}R
                              </div>
                            </div>
                          )}
                        </div>
                        {atLimit && (
                          <div style={{ marginTop: "12px", fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.08em" }}>
                            Daily trade limit reached. Step back and review.
                          </div>
                        )}
                        {maxLoss > 0 && !killSwitchTripped && todayPnl <= -(maxLoss * 0.75) && (
                          <div style={{ marginTop: "12px", fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.08em" }}>
                            Approaching max daily loss ({Math.abs(todayPnl).toFixed(2)}R of {maxLoss}R limit).
                          </div>
                        )}
                      </section>
                    );
                  })()}

                  {/* Live positions — Tradovate integration */}
                  <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                    {/* Section label */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em" }}>LIVE POSITIONS</span>
                        {tradovateSession && (
                          <span style={{ position: "relative", display: "inline-flex", width: "7px", height: "7px" }}>
                            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.green, opacity: 0.3, animation: "livePulse 2.4s ease-in-out infinite" }} />
                            <span style={{ position: "relative", display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: C.green }} />
                          </span>
                        )}
                      </div>
                      {tradovateSession && (
                        <button onClick={() => setShowLiveModal(true)}
                          style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", padding: 0 }}>
                          Manage →
                        </button>
                      )}
                    </div>

                    {tradovateSession ? (
                      /* ── Connected: show positions ── */
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden" }}>
                        {/* Account bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel ?? "transparent" }}>
                          <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                          <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2, letterSpacing: "0.06em" }}>
                            {tradovateSession.accountName ?? "Tradovate"}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em" }}>
                            · {tradovateSession.env.toUpperCase()}
                          </span>
                          {tradovateSession.lastSyncTime && (
                            <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.04em", marginLeft: "auto" }}>
                              synced {new Date(tradovateSession.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {tradovatePositions.length === 0 ? (
                          <div style={{ padding: "28px 14px", fontFamily: BODY, fontSize: "13px", color: C.muted, textAlign: "center" }}>
                            No open positions right now
                          </div>
                        ) : (
                          tradovatePositions.map((pos, idx) => (
                            <div key={pos.contractId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", borderBottom: idx < tradovatePositions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                              <div>
                                <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{pos.symbol}</div>
                                <div style={{ fontFamily: MONO, fontSize: "10px", color: pos.netPos > 0 ? C.green : C.red, marginTop: "3px", letterSpacing: "0.04em" }}>
                                  {pos.netPos > 0 ? "▲ Long" : "▼ Short"} {Math.abs(pos.netPos)} ct · avg {pos.netPrice.toFixed(2)}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 600, color: pos.openPnl >= 0 ? C.green : C.red, letterSpacing: "-0.01em" }}>
                                  {pos.openPnlStr}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      /* ── Not connected: styled connect card ── */
                      <button onClick={() => setShowLiveModal(true)}
                        style={{ width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0", cursor: "pointer", textAlign: "left", display: "block" }}>
                        <div style={{ padding: "18px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            {/* Icon */}
                            <div style={{ width: "38px", height: "38px", borderRadius: "8px", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                              </svg>
                            </div>
                            <div>
                              <div style={{ fontFamily: BODY, fontSize: "14px", fontWeight: 600, color: C.text, marginBottom: "3px" }}>Connect Tradovate</div>
                              <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.4 }}>
                                Live positions · Auto-import fills
                              </div>
                            </div>
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", flexShrink: 0 }}>Set up →</span>
                        </div>
                      </button>
                    )}
                  </section>

                  {/* Equity curve */}
                  {trades.length > 1 && (
                    <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                        EQUITY CURVE
                      </div>
                      <PnLChart trades={trades} C={C} />
                    </section>
                  )}

                  {/* Strategy breakdown */}
                  {Object.keys(stratStats).length > 0 && (
                    <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                        BY STRATEGY
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                        {Object.entries(stratStats).map(([s, v]: any, idx) => {
                          const wr = v.w + v.l > 0 ? v.w / (v.w + v.l) : 0;
                          return (
                            <div key={s}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                                <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em" }}>{String(idx + 1).padStart(2, "0")}</span>
                                  <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{stratCode(s)}</span>
                                  <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text2 }}>{stratShort(s)}</span>
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em", color: C.text }}>
                                  {(wr * 100).toFixed(0)}% <span style={{ color: C.muted }}>· {v.count}T · </span>
                                  <span style={{ color: v.pnl >= 0 ? C.green : C.red }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                                </div>
                              </div>
                              <div style={{ height: "1px", background: C.border, width: "100%" }}>
                                <div style={{ height: "1px", background: C.text, width: `${wr * 100}%`, transition: "width 0.6s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Recent trades */}
                  {trades.length > 0 && (
                    <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "4px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                        RECENT TRADES
                      </div>
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "12px" }}>
                        {trades.slice(0, 5).map(t => (
                          <div key={t.id} className="row-hvr" onClick={() => editTrade(t)}
                            style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{t.pair || "—"}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "3px", letterSpacing: "0.04em" }}>{t.date}{t.session ? ` · ${t.session}` : ""}</div>
                            </div>
                            {t.strategy && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em" }}>{stratCode(t.strategy)}</span>}
                            <span style={{ fontFamily: DISPLAY, fontSize: "15px", color: C.text, fontWeight: 500, letterSpacing: "-0.01em", minWidth: "50px", textAlign: "right" }}>{t.rr ? `${t.rr}R` : "—"}</span>
                            <span style={{ fontFamily: MONO, fontSize: "12px", letterSpacing: "0.06em", color: outcomeColor(t.outcome, C), minWidth: "22px", textAlign: "right" }}>{outcomeLetter(t.outcome)}</span>
                          </div>
                        ))}
                      </div>
                      {trades.length > 5 && (
                        <button onClick={() => setView("history")}
                          style={{ ...pillGhost, width: "100%", marginTop: "16px" }}>
                          VIEW ALL {trades.length} TRADES →
                        </button>
                      )}
                    </section>
                  )}

                  {/* Trade of the Week trophy */}
                  {(() => {
                    if (!friendFeed.length) return null;
                    const now = new Date();
                    const day = now.getDay();
                    const msSinceMonday = ((day === 0 ? 6 : day - 1)) * 86400000;
                    const weekStart = new Date(now.getTime() - msSinceMonday);
                    weekStart.setHours(0, 0, 0, 0);
                    const weekStartStr = weekStart.toISOString().split("T")[0];
                    const thisWeekItems = friendFeed.filter((item: any) => item.date >= weekStartStr);
                    if (!thisWeekItems.length) return null;
                    const counted = thisWeekItems.map((item: any) => {
                      const total = Object.values(item.reactions || {}).reduce((s: any, v: any) =>
                        s + (typeof v === "number" ? v : Array.isArray(v) ? v.length : 0), 0);
                      return { ...item, _rxTotal: total };
                    });
                    const top = counted.reduce((best: any, item: any) => item._rxTotal > best._rxTotal ? item : best);
                    if (top._rxTotal === 0) return null;
                    const topPnLPos = parseFloat(top.pnl) >= 0;
                    return (
                      <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                          TRADE OF THE WEEK
                        </div>
                        <div style={{ border: `1px solid ${C.border}`, borderRadius: "4px", padding: "20px 20px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{top.authorName}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px", letterSpacing: "0.04em" }}>
                                {top.authorHandle ? `@${top.authorHandle.replace(/^@/, "")}` : ""}{top.date ? ` · ${top.date}` : ""}
                              </div>
                            </div>
                            <span style={{ fontSize: "22px", lineHeight: 1 }}>🏆</span>
                          </div>
                          <div style={{ display: "flex", gap: "14px", alignItems: "baseline", marginBottom: "14px" }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{top.pair || "—"}</span>
                            {top.rr && <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text2, letterSpacing: "0.04em" }}>{top.rr}R</span>}
                            {top.pnl && <span style={{ fontFamily: MONO, fontSize: "13px", letterSpacing: "0.04em", color: topPnLPos ? C.green : C.red }}>{topPnLPos ? "+" : ""}{top.pnl}R</span>}
                          </div>
                          {top.notes && (
                            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.6, marginBottom: "14px", borderLeft: `1px solid ${C.border2}`, paddingLeft: "12px" }}>
                              {top.notes.slice(0, 120)}{top.notes.length > 120 ? "…" : ""}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {Object.entries(top.reactions || {}).map(([rx, v]: any) => {
                              const count = typeof v === "number" ? v : Array.isArray(v) ? v.length : 0;
                              if (count === 0) return null;
                              return <span key={rx} style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, background: C.panel, border: `1px solid ${C.border}`, borderRadius: "999px", padding: "4px 10px", letterSpacing: "0.04em" }}>{rx} {count}</span>;
                            })}
                            <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", alignSelf: "center", marginLeft: "auto" }}>{top._rxTotal} REACTIONS</span>
                          </div>
                        </div>
                      </section>
                    );
                  })()}

                  {/* Monthly report card */}
                  {(() => {
                    const now = new Date();
                    const monthKey = now.toISOString().slice(0, 7);
                    const monthName = now.toLocaleString("default", { month: "long" });
                    const monthTrades = trades.filter(t => t.date?.startsWith(monthKey));
                    if (monthTrades.length < 2) return null;
                    const mWins = monthTrades.filter(t => t.outcome === "Win").length;
                    const mTotal = monthTrades.length;
                    const mPnl = monthTrades.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0);
                    const mWr = Math.round((mWins / mTotal) * 100);
                    const byDay: Record<string, number> = {};
                    monthTrades.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + (parseFloat(t.pnl as string) || 0); });
                    const days = Object.entries(byDay);
                    const bestDay = days.reduce((a, b) => b[1] > a[1] ? b : a, ["—", -Infinity]);
                    const worstDay = days.reduce((a, b) => b[1] < a[1] ? b : a, ["—", Infinity]);
                    const stratPnl: Record<string, number> = {};
                    monthTrades.forEach(t => { if (t.strategy) stratPnl[t.strategy] = (stratPnl[t.strategy] || 0) + (parseFloat(t.pnl as string) || 0); });
                    const bestStrat = Object.entries(stratPnl).sort((a, b) => b[1] - a[1])[0];
                    return (
                      <section style={{ marginTop: "clamp(40px, 6vw, 56px)", padding: "20px", border: `1px solid ${C.border}`, borderRadius: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px" }}>
                          <SectionKicker label={`${monthName.toUpperCase()} REPORT`} C={C} />
                          <span style={{ fontFamily: DISPLAY, fontSize: "28px", fontWeight: 700, color: mPnl >= 0 ? C.green : C.red, letterSpacing: "-0.02em" }}>{mPnl >= 0 ? "+" : ""}{mPnl.toFixed(2)}R</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>WIN RATE</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: mWr >= 50 ? C.green : C.red }}>{mWr}%</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{mTotal} trades</div>
                          </div>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>BEST DAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.green }}>{bestDay[1] !== -Infinity ? `+${(bestDay[1] as number).toFixed(2)}R` : "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{String(bestDay[0])}</div>
                          </div>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>WORST DAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.red }}>{worstDay[1] !== Infinity ? `${(worstDay[1] as number).toFixed(2)}R` : "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{String(worstDay[0])}</div>
                          </div>
                          {bestStrat && (
                            <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TOP STRATEGY</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{stratShort(bestStrat[0])}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: bestStrat[1] >= 0 ? C.green : C.red, marginTop: "2px" }}>{bestStrat[1] >= 0 ? "+" : ""}{bestStrat[1].toFixed(2)}R</div>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })()}

                  {/* Friends */}
                  <section style={{ marginTop: "clamp(40px, 6vw, 56px)", paddingTop: "32px", borderTop: `1px solid ${C.border}` }}>
                    <FriendsFeed
                      friends={friends} friendFeed={friendFeed} showAddFriend={showAddFriend} setShowAddFriend={setShowAddFriend}
                      followHandleInput={followHandleInput} setFollowHandleInput={setFollowHandleInput}
                      followHandleMsg={followHandleMsg} followHandleLoading={followHandleLoading}
                      followByHandle={followByHandle}
                      removeFriend={removeFriend} unfollowUser={unfollowUser}
                      following={following} followers={followers} followerProfiles={followerProfiles}
                      followUser={followUser}
                      publishFeed={publishFeed} refreshFeed={refreshFeed} reactToFeed={reactToFeed}
                      myFeedReactions={myFeedReactions}
                      getMyCode={getMyCode} profile={profile} C={C} inp={inp} lbl={lbl} pillGhost={pillGhost} pillPrimary={pillPrimary}
                      openProfile={openProfile}
                    />
                  </section>
                  {/* Plan row */}
                  <section style={{ paddingTop: "28px", borderTop: `1px solid ${C.border}` }}>
                    {profile.plan !== "pro" && profile.plan !== "elite" ? (
                      <button
                        onClick={() => setShowUpgrade(true)}
                        style={{
                          width: "100%", padding: "13px 18px", background: "transparent",
                          border: `1px solid #f59e0b55`, borderRadius: "10px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "16px" }}>⚡</span>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#f59e0b" }}>Upgrade to Pro</div>
                            <div style={{ fontSize: "11px", color: C.muted, marginTop: "1px" }}>Unlimited imports · Advanced analytics</div>
                          </div>
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: "#f59e0b" }}>£5.99/mo →</span>
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "15px" }}>⚡</span>
                          <div>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>TRADR Pro</span>
                            <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, marginLeft: "8px", letterSpacing: "0.06em" }}>ACTIVE</span>
                          </div>
                        </div>
                        {profile.stripeCustomerId && (
                          <button
                            onClick={async () => {
                              try {
                                const r = await fetch("/api/stripe-portal", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ stripeCustomerId: profile.stripeCustomerId }),
                                });
                                const { url } = await r.json();
                                window.location.href = url;
                              } catch { showToast("Could not open billing portal — try again."); }
                            }}
                            style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "5px 10px", fontSize: "11px", color: C.muted, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.06em" }}
                          >Manage →</button>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Connections */}
                  <section style={{ paddingTop: "28px", borderTop: `1px solid ${C.border}` }}>
                    <SectionKicker label="CONNECTIONS" C={C} />
                    <div style={{ marginTop: "16px", display: "flex", flexDirection: "column" }}>
                      {/* Tradovate */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: C.text }}>
                            Tradovate
                            {tradovateSession && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, marginLeft: "8px", letterSpacing: "0.06em" }}>LIVE</span>}
                          </div>
                          <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                            {tradovateSession ? `${tradovateSession.accountName ?? "Connected"} · ${tradovateSession.env.toUpperCase()}` : "Live positions & auto-import"}
                          </div>
                        </div>
                        <button onClick={() => setShowLiveModal(true)}
                          style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "5px 10px", fontSize: "11px", color: C.muted, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                          {tradovateSession ? "Manage →" : "Connect →"}
                        </button>
                      </div>
                      {/* Stripe */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" }}>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: C.text }}>
                            Stripe Billing
                            {profile.stripeCustomerId && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, marginLeft: "8px", letterSpacing: "0.06em" }}>CONNECTED</span>}
                          </div>
                          <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>Subscription management</div>
                        </div>

                      </div>
                    </div>
                  </section>

                  {/* Data export */}
                  <section style={{ paddingTop: "28px", borderTop: `1px solid ${C.border}` }}>
                    <SectionKicker label="YOUR DATA" C={C} />
                    <div style={{ marginTop: "14px", display: "flex", gap: "10px" }}>
                      <button onClick={() => {
                          if (profile.plan !== "pro" && profile.plan !== "elite") { setShowUpgrade(true); return; }
                          exportCSV();
                        }}
                        style={{ flex: 1, padding: "11px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: profile.plan === "pro" || profile.plan === "elite" ? C.text : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {profile.plan !== "pro" && profile.plan !== "elite" ? "🔒 CSV" : "Export CSV"}
                      </button>
                      <button onClick={exportData}
                        style={{ flex: 1, padding: "11px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Export JSON
                      </button>
                    </div>
                  </section>

                  {/* Danger zone */}
                  <section style={{ paddingTop: "28px", borderTop: `1px solid ${C.border}` }}>
                    <SectionKicker label="DELETE ACCOUNT" C={C} />
                    <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input
                        value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        style={{ padding: "11px 14px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.text, fontFamily: MONO, fontSize: "12px", letterSpacing: "0.04em", outline: "none" }}
                      />
                      <button
                        onClick={deleteAccount}
                        disabled={deletingAccount || deleteConfirm.toUpperCase() !== "DELETE"}
                        style={{ padding: "11px", border: `1px solid ${deleteConfirm.toUpperCase() === "DELETE" ? C.red : C.border2}`, borderRadius: "8px", background: "transparent", color: deleteConfirm.toUpperCase() === "DELETE" ? C.red : C.muted, cursor: deleteConfirm.toUpperCase() === "DELETE" ? "pointer" : "not-allowed", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", opacity: deletingAccount ? 0.6 : 1, transition: "all 0.2s" }}>
                        {deletingAccount ? "Deleting…" : "Delete My Account"}
                      </button>
                    </div>
                  </section>

                  {/* Legal footer */}
                  <div style={{ paddingTop: "32px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                    <a href="/privacy.html" target="_blank" rel="noopener"
                      style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textDecoration: "none" }}>
                      Privacy
                    </a>
                    <a href="/terms.html" target="_blank" rel="noopener"
                      style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textDecoration: "none" }}>
                      Terms
                    </a>
                    <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginLeft: "auto" }}>
                      TRADR © {new Date().getFullYear()}
                    </span>
                  </div>
                </div>
              )}

              {/* ANALYTICS */}
              {homeSection === "analytics" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "clamp(40px, 6vw, 56px)", marginTop: "clamp(24px, 5vw, 40px)" }}>
                  <section>
                    <SectionKicker label="WIN RATE BY STRATEGY" C={C} />
                    <div style={{ marginTop: "20px" }}><WinRateChart trades={trades} C={C} /></div>
                  </section>
                  <section>
                    <SectionKicker label="MONTHLY P&L" C={C} />
                    <div style={{ marginTop: "16px" }}>
                      {trades.length < 2
                        ? <div style={{ fontSize: "12px", color: C.muted, fontFamily: BODY }}>Log more trades to see monthly trends.</div>
                        : <MonthlyPnLChart trades={trades} C={C} />}
                    </div>
                  </section>
                  <section>
                    <SectionKicker label="SESSION PERFORMANCE" C={C} />
                    <div style={{ marginTop: "12px", borderTop: `1px solid ${C.border}` }}>
                      {Object.entries(sessionStats).map(([session, v]: any) => {
                        const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                        return (
                          <div key={session} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "baseline", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{session}</span>
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.04em" }}>{wr}%</span>
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: v.pnl >= 0 ? C.green : C.red, letterSpacing: "0.04em", minWidth: "60px", textAlign: "right" }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  <section>
                    <SectionKicker label="P&L CALENDAR" C={C} />
                    <div style={{ marginTop: "20px" }}>
                      <CalendarView trades={trades} C={C} onDayClick={(key: string) => { const dt = trades.filter(t => t.date === key); setCalDayTrades({ key, trades: dt }); }} />
                      {calDayTrades && (
                        <div style={{ marginTop: "20px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                            <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>{calDayTrades.key} · {calDayTrades.trades.length} TRADE{calDayTrades.trades.length !== 1 ? "S" : ""}</span>
                            <button onClick={() => setCalDayTrades(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "12px" }}>close</button>
                          </div>
                          {calDayTrades.trades.map((t: any) => (
                            <div key={t.id} className="row-hvr" onClick={() => { setView("history"); setExpandedId(t.id); }}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text }}>{t.pair}</span>
                              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                {t.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2 }}>{t.rr}R</span>}
                                <span style={{ fontFamily: MONO, fontSize: "11px", color: outcomeColor(t.outcome, C), letterSpacing: "0.06em" }}>{outcomeLetter(t.outcome)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* AI INSIGHTS */}
              {homeSection === "ai" && (
                (profile.plan === "pro" || profile.plan === "elite") ? (
                  <div style={{ marginTop: "clamp(24px, 5vw, 40px)" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "24px" }}>
                      RULE-BASED INSIGHTS — UPDATES AFTER EACH TRADE.
                    </div>
                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                      {insights.map((ins: any, i: number) => {
                        const col = ins.type === "positive" ? C.green : ins.type === "warning" ? C.text2 : ins.type === "danger" ? C.red : C.muted;
                        return (
                          <div key={i} style={{ padding: "20px 0", borderBottom: `1px solid ${C.border}`, display: "flex", gap: "16px", alignItems: "baseline" }}>
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: col, letterSpacing: "0.1em", minWidth: "48px" }}>{ins.kicker}</span>
                            <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text, lineHeight: 1.55, flex: 1 }}>{ins.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginTop: "clamp(24px, 5vw, 40px)",
                    border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "32px 20px",
                    textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
                    background: "linear-gradient(135deg, #f59e0b08, #d9770608)",
                  }}>
                    <div style={{ fontSize: "28px" }}>🔒</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>Insights — Pro Feature</div>
                    <div style={{ fontSize: "12px", color: C.muted, maxWidth: "240px", lineHeight: 1.6 }}>
                      Pattern detection, edge analysis, and discipline scoring. Upgrade to Pro to unlock.
                    </div>
                    <button
                      onClick={() => setShowUpgrade(true)}
                      style={{
                        background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000",
                        border: "none", borderRadius: "8px", padding: "10px 20px",
                        fontSize: "13px", fontWeight: 700, cursor: "pointer",
                      }}
                    >⚡ Upgrade to Pro</button>
                  </div>
                )
              )}

              {/* RULES */}
              {homeSection === "rules" && (
                <div style={{ marginTop: "clamp(24px, 5vw, 40px)", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      Read before every {stratShort(activeStrategy)} session.
                    </div>
                    <StrategySelect strategies={allStrategyNames} value={activeStrategy} onChange={(s: string) => { setActiveStrategy(s); setEditingRule(null); }} C={C} align="right" />
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {ruleItems.map((rule: any, idx: number) => (
                      <div key={rule.id} className="check-row" style={{ minHeight: "52px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px", padding: "8px 0" }}>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", minWidth: "24px" }}>{String(idx + 1).padStart(2, "0")}</span>
                        {editingRule === rule.id
                          ? <EditInline val={rule.text} onSave={(t: string) => saveEditRule(rule.id, t)} onCancel={() => setEditingRule(null)} C={C} />
                          : <>
                            <span style={{ flex: 1, fontSize: "14px", color: C.text, lineHeight: 1.55, fontFamily: BODY }}>{rule.text}</span>
                            <div className="ca" style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s" }}>
                              <button onClick={() => setEditingRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>edit</button>
                              <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>rm</button>
                            </div>
                          </>}
                      </div>
                    ))}
                  </div>
                  {addingRule
                    ? <div style={{ display: "flex", gap: "10px", alignItems: "center", paddingTop: "8px" }}>
                      <input autoFocus value={newRuleText} onChange={e => setNewRuleText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addRule(); if (e.key === "Escape") { setAddingRule(false); setNewRuleText(""); } }}
                        placeholder="New rule..." style={{ ...inp, flex: 1 }} />
                      <button onClick={addRule} style={{ ...pillPrimary(!!newRuleText.trim()), width: "auto", padding: "10px 16px" }}>Add</button>
                      <button onClick={() => { setAddingRule(false); setNewRuleText(""); }} style={{ ...pillGhost, padding: "10px 14px" }}>X</button>
                    </div>
                    : <button onClick={() => setAddingRule(true)} style={{ ...pillGhost, alignSelf: "flex-start" }}>+ ADD RULE</button>
                  }
                </div>
              )}

              {/* SETTINGS */}
              {homeSection === "settings" && (
                <div style={{ marginTop: "clamp(24px, 5vw, 40px)", display: "flex", flexDirection: "column", gap: "28px" }}>
                  {/* Back nav */}
                  <div>
                    <button
                      onClick={() => setHomeSection("feed")}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                      <span style={{ fontSize: "12px" }}>←</span> Overview
                    </button>
                  </div>

                  {/* Profile */}
                  <section>
                    <SectionKicker label="PROFILE" C={C} />
                    <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ position: "relative" }}>
                        <AvatarCircle name={profile.name} avatar={profileDraft.avatar || profile.avatar} size={56} color={C.text} onClick={() => document.getElementById("avatarInput")?.click()} C={C} />
                      </div>
                      <input id="avatarInput" type="file" accept="image/jpeg,image/png" onChange={handleAvatarUpload} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{profile.name}</div>
                        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px", display: "flex", alignItems: "center", gap: "5px" }}>
                          {profile.handle}
                          {(profile.plan === "pro" || profile.plan === "elite") && (
                            <CrownIcon size={11} color={C.text} />
                          )}
                        </div>
                      </div>
                      <button onClick={() => { setProfileDraft({ ...profile }); setEditingProfile(!editingProfile); }} style={pillGhost}>
                        {editingProfile ? "CANCEL" : "EDIT"}
                      </button>
                    </div>
                    {editingProfile && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "24px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                          <div><label style={lbl}>Name</label><input value={profileDraft.name} onChange={e => setProfileDraft({ ...profileDraft, name: e.target.value })} style={inp} /></div>
                          <div><label style={lbl}>Handle</label><input value={profileDraft.handle} onChange={e => setProfileDraft({ ...profileDraft, handle: e.target.value })} style={inp} /></div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: `1px solid ${C.border}` }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.06em" }}>Public trades</div>
                            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "3px" }}>Show your trades on your profile</div>
                          </div>
                          <button onClick={() => setProfileDraft({ ...profileDraft, publicTrades: !profileDraft.publicTrades })}
                            style={{ width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer", background: profileDraft.publicTrades ? C.green : C.border2, position: "relative", transition: "background 150ms" }}>
                            <span style={{ position: "absolute", top: "3px", left: profileDraft.publicTrades ? "22px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: C.bg, transition: "left 150ms" }} />
                          </button>
                        </div>
                        {profileDraft.publicTrades && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.06em" }}>Share with mentor</div>
                              <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "3px" }}>Copy your public profile link</div>
                            </div>
                            <button onClick={() => {
                              const handle = (profile.handle || "").replace(/^@/, "");
                              const url = `https://tradrjournal.xyz/@${handle}`;
                              navigator.clipboard?.writeText(url).then(() => showToast("Mentor link copied!")).catch(() => showToast("Link: " + url));
                            }} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>
                              Copy link
                            </button>
                          </div>
                        )}
                        <div><label style={lbl}>Bio</label><textarea value={profileDraft.bio} onChange={e => setProfileDraft({ ...profileDraft, bio: e.target.value })} rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                          <div><label style={lbl}>Broker</label><input value={profileDraft.broker} onChange={e => setProfileDraft({ ...profileDraft, broker: e.target.value })} placeholder="IC Markets" style={inp} /></div>
                          <div><label style={lbl}>Timezone</label><input value={profileDraft.timezone} onChange={e => setProfileDraft({ ...profileDraft, timezone: e.target.value })} style={inp} /></div>
                        </div>
                        <div>
                          <label style={lbl}>Circle alias <span style={{ color: C.dim }}>(shown on leaderboards · 3–12 chars)</span></label>
                          <input
                            value={profileDraft.alias || ""}
                            onChange={e => {
                              const v = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
                              setProfileDraft({ ...profileDraft, alias: v });
                            }}
                            placeholder="e.g. DYLON-PRO"
                            style={{ ...inp, fontFamily: MONO, letterSpacing: "0.08em" }}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                          <div><label style={lbl}>Target R:R</label><input type="number" value={profileDraft.targetRR} onChange={e => setProfileDraft({ ...profileDraft, targetRR: e.target.value })} style={inp} /></div>
                          <div><label style={lbl}>Max Trades/Day</label><input type="number" value={profileDraft.maxTradesPerDay} onChange={e => setProfileDraft({ ...profileDraft, maxTradesPerDay: e.target.value })} style={inp} /></div>
                          <div><label style={lbl}>Max Daily Loss (R) — Kill Switch</label><input type="number" step="0.5" value={profileDraft.maxDailyLoss || ""} onChange={e => setProfileDraft({ ...profileDraft, maxDailyLoss: e.target.value })} placeholder="e.g. 3" style={inp} /></div>
                        </div>
                        <button onClick={async () => {
                          const name = (profileDraft.name || "").trim();
                          const handle = (profileDraft.handle || "").trim();
                          if (!name) { showToast("Name can't be empty"); return; }
                          if (!handle) { showToast("Handle can't be empty"); return; }
                          // Check handle uniqueness (skip check if unchanged)
                          const normNew = normaliseHandle(handle);
                          const normOld = normaliseHandle(profile.handle || "");
                          if (normNew !== normOld) {
                            const taken = await isHandleTaken(handle);
                            if (taken) { showToast(`@${normNew} is already taken`); return; }
                          }
                          await saveProfile({ ...profileDraft, name, handle });
                          setEditingProfile(false);
                          showToast("Profile saved");
                        }} style={{ ...pillPrimary(true), marginTop: "8px" }}>Save profile →</button>
                      </div>
                    )}
                  </section>

                  {/* Preferences */}
                  <section>
                    <SectionKicker label="PREFERENCES" C={C} />
                    <div style={{ marginTop: "12px", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: "14px", color: C.text, fontFamily: BODY }}>Dark mode</span>
                        <button onClick={toggleDark} style={{ background: darkMode ? C.text : C.border, border: "none", borderRadius: "999px", width: "40px", height: "22px", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                          <div style={{ position: "absolute", top: "3px", left: darkMode ? "20px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: darkMode ? C.bg : C.text, transition: "left 0.2s" }} />
                        </button>
                      </div>
                      {/* Text Size */}
                      <div style={{ padding: "16px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: "11px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "12px" }}>Text Size</div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {([["S", 0.85], ["M", 1.0], ["L", 1.15], ["XL", 1.3]] as [string, number][]).map(([label, scale]) => (
                            <button
                              key={label}
                              onClick={() => setFontScale(scale)}
                              style={{
                                flex: 1, padding: "10px 4px", border: `1px solid ${fontScale === scale ? C.text : C.border2}`,
                                borderRadius: "8px", background: fontScale === scale ? C.text : "transparent",
                                color: fontScale === scale ? C.bg : C.muted,
                                fontSize: label === "S" ? "11px" : label === "M" ? "13px" : label === "L" ? "15px" : "17px",
                                fontFamily: BODY, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {[["Broker", profile.broker || "—"], ["Timezone", profile.timezone || "—"], ["Target R:R", profile.targetRR ? `${profile.targetRR}R` : "—"], ["Max Trades/Day", profile.maxTradesPerDay || "—"]].map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{k}</span>
                          <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ LOG TRADE ══════════════════════════ */}
          {view === "log" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "clamp(16px, 4vw, 28px)" }}>
              <SectionKicker label={editId ? "EDIT TRADE" : "NEW TRADE"} C={C} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div><label style={lbl}>Date</label><input type="date" name="date" value={form.date} onChange={handleChange} style={inp} /></div>
                <div><label style={lbl}>Pair / Instrument</label><input name="pair" value={form.pair} onChange={handleChange} placeholder="EURUSD" style={inp} /></div>
              </div>
              <div>
                <label style={lbl}>Strategy</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  {allStrategyNames.map((s: string) => <StrategyPill key={s} name={s} selected={form.strategy === s} onClick={() => setForm((f: any) => ({ ...f, strategy: s, setup: "" }))} C={C} />)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div><label style={lbl}>Session</label><select name="session" value={form.session} onChange={handleChange} style={sel}><option value="">Select</option>{SESSIONS.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label style={lbl}>Bias</label><select name="bias" value={form.bias} onChange={handleChange} style={sel}><option value="">Select</option>{BIAS.map(b => <option key={b}>{b}</option>)}</select></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div><label style={lbl}>Entry Time</label><input type="time" name="entryTime" value={form.entryTime || ""} onChange={handleChange} style={inp} /></div>
                <div><label style={lbl}>Exit Time</label><input type="time" name="exitTime" value={form.exitTime || ""} onChange={handleChange} style={inp} /></div>
                <div><label style={lbl}>Direction</label><select name="direction" value={form.direction || ""} onChange={handleChange} style={sel}><option value="">Select</option><option>Long</option><option>Short</option></select></div>
              </div>
              <div>
                <label style={lbl}>Setup {form.strategy && <span style={{ color: C.muted, marginLeft: "6px" }}>· {stratCode(form.strategy)}</span>}</label>
                <select name="setup" value={form.setup} onChange={handleChange} style={sel}>
                  <option value="">Select setup</option>
                  {(form.strategy ? _allStratMap[form.strategy]?.setups || [] : allSetups).map((s: string) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "12px" }}>
                <div><label style={lbl}>Entry</label><input type="number" name="entryPrice" value={form.entryPrice} onChange={handleChange} placeholder="0.00" style={inp} /></div>
                <div><label style={lbl}>Stop Loss</label><input type="number" name="slPrice" value={form.slPrice} onChange={handleChange} placeholder="0.00" style={inp} /></div>
                <div><label style={lbl}>Take Profit</label><input type="number" name="tpPrice" value={form.tpPrice} onChange={handleChange} placeholder="0.00" style={inp} /></div>
              </div>
              {form.rr && (
                <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Calculated R:R</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: "22px", color: C.text, fontWeight: 500, letterSpacing: "-0.02em" }}>{form.rr}R</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "16px" }}>
                <div><label style={lbl}>Outcome</label><select name="outcome" value={form.outcome} onChange={handleChange} style={sel}><option value="">Select</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select></div>
                <div><label style={lbl}>P&L (R)</label><input type="number" name="pnl" value={form.pnl} onChange={handleChange} placeholder="+2.5 or -1" style={inp} /></div>
                <div><label style={lbl}>P&L ($)</label><input type="number" name="pnlDollar" value={form.pnlDollar} onChange={handleChange} placeholder="e.g. +320" style={inp} /></div>
              </div>
              <div><label style={lbl}>Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} placeholder="What did price do? Why did you enter?" rows={3} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={lbl}>MAE — Max adverse excursion <span style={{ color: C.dim }}>(R)</span></label>
                  <input name="mae" type="number" step="0.01" value={form.mae || ""} onChange={handleChange} placeholder="e.g. 0.8" style={inp} />
                </div>
                <div>
                  <label style={lbl}>MFE — Max favourable excursion <span style={{ color: C.dim }}>(R)</span></label>
                  <input name="mfe" type="number" step="0.01" value={form.mfe || ""} onChange={handleChange} placeholder="e.g. 3.2" style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Emotional State</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                  {EMOTION_TAGS.map(tag => {
                    const active = getEmotionTags(form.emotions).includes(tag.id);
                    return (
                      <button key={tag.id} type="button"
                        onClick={() => {
                          const current = getEmotionTags(form.emotions);
                          const next = active ? current.filter(t => t !== tag.id) : [...current, tag.id];
                          setForm((f: any) => ({ ...f, emotions: next }));
                        }}
                        style={{ background: active ? tag.color + "22" : "transparent", color: active ? tag.color : C.muted, border: `1px solid ${active ? tag.color : C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s ease" }}>
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={lbl}>Screenshot</label>
                {form.screenshot ? (
                  <div style={{ position: "relative", marginTop: "6px" }}>
                    <img src={form.screenshot} alt="screenshot" style={{ width: "100%", border: `1px solid ${C.border}`, display: "block", maxHeight: "200px", objectFit: "cover" }} />
                    <button onClick={() => removeScreenshot(null)}
                      style={{ position: "absolute", top: "8px", right: "8px", background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "999px", color: C.text, padding: "4px 10px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.08em" }}>REMOVE</button>
                  </div>
                ) : (
                  <label htmlFor="ssUpload" style={{ display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${C.border2}`, padding: "20px", cursor: "pointer", color: C.muted, fontSize: "12px", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                    Upload screenshot
                    <input id="ssUpload" type="file" accept="image/jpeg,image/png" onChange={e => handleScreenshotUpload(e, null)} />
                  </label>
                )}
              </div>
              <button onClick={submitTrade} disabled={savingTrade || !(form.pair && form.date && form.outcome)}
                style={{ ...pillPrimary(!!(form.pair && form.date && form.outcome && !savingTrade)), marginTop: "8px" }}>
                {savingTrade ? "Saving…" : editId ? "Update trade →" : "Save trade →"}
              </button>
              {editId && <button onClick={() => { setForm(EMPTY_TRADE); setEditId(null); setView("history"); }} style={pillGhost}>CANCEL EDIT</button>}
            </div>
          )}

          {/* ══════════════════════════ HISTORY ══════════════════════════ */}
          {view === "history" && (
            <div style={{ marginTop: "clamp(16px, 4vw, 28px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <SectionKicker label={`TRADES · ${filteredTrades.length}`} C={C} />
                <button onClick={() => setShowCsvImport(v => !v)} style={{ background: showCsvImport ? C.text : "transparent", color: showCsvImport ? C.bg : C.text, border: `1px solid ${showCsvImport ? C.text : C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {showCsvImport ? "Close" : "Import CSV"}
                </button>
              </div>
              {showCsvImport && (
                <CsvImportPanel
                  existingTrades={trades}
                  onImport={handleCsvImport}
                  onClose={() => setShowCsvImport(false)}
                  allStrategyNames={allStrategyNames}
                  C={C}
                  inp={inp}
                  sel={sel}
                  lbl={lbl}
                />
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "20px" }}>
                <input placeholder="Pair..." value={filter.pair} onChange={e => setFilter({ ...filter, pair: e.target.value })} style={inp} />
                <select value={filter.outcome} onChange={e => setFilter({ ...filter, outcome: e.target.value })} style={sel}><option value="">All outcomes</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px" }}>
                <select value={filter.strategy} onChange={e => setFilter({ ...filter, strategy: e.target.value, setup: "" })} style={sel}><option value="">All strategies</option>{allStrategyNames.map((s: string) => <option key={s}>{s}</option>)}</select>
                <select value={filter.setup} onChange={e => setFilter({ ...filter, setup: e.target.value })} style={sel}><option value="">All setups</option>{(filter.strategy ? _allStratMap[filter.strategy]?.setups || [] : allSetups).map((s: string) => <option key={s} value={s}>{s.split("(")[0].trim()}</option>)}</select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px", marginBottom: "20px" }}>
                <input type="date" value={filter.dateFrom} onChange={e => setFilter({ ...filter, dateFrom: e.target.value })} style={{ ...inp, colorScheme: darkMode ? "dark" : "light" }} />
                <input type="date" value={filter.dateTo} onChange={e => setFilter({ ...filter, dateTo: e.target.value })} style={{ ...inp, colorScheme: darkMode ? "dark" : "light" }} />
              </div>
              {(filter.pair || filter.outcome || filter.strategy || filter.setup || filter.dateFrom || filter.dateTo) && (
                <button onClick={() => setFilter({ outcome: "", setup: "", pair: "", strategy: "", dateFrom: "", dateTo: "" })}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 0 16px", textDecoration: "underline" }}>
                  Clear filters
                </button>
              )}
              {filteredTrades.length === 0 ? (
                trades.length === 0 ? (
                  // True empty — no trades at all yet
                  <div style={{ textAlign: "center", padding: "72px 0", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 500, fontStyle: "italic", color: C.text2, letterSpacing: "-0.02em", marginBottom: "10px" }}>
                      No trades logged yet.
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, marginBottom: "28px" }}>
                      Every edge starts with data. Log your first trade.
                    </div>
                    <button onClick={() => setView("log")} style={pillPrimary(true)}>
                      Log a trade →
                    </button>
                  </div>
                ) : (
                  // Filters active, nothing matches
                  <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontFamily: BODY, fontStyle: "italic" }}>
                    No trades match those filters.
                  </div>
                )
              ) : (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {filteredTrades.map(t => {
                    const expanded = expandedId === t.id;
                    const commentText = commentInputs[t.id] || "";
                    return (
                      <div key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div className="row-hvr" onClick={() => setExpandedId(expanded ? null : t.id)}
                          style={{ padding: "14px 0", minHeight: "52px", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "12px" }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "14px", color: C.text, letterSpacing: "0.04em" }}>{t.pair || "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "3px", letterSpacing: "0.04em" }}>{t.date}{t.session ? ` · ${t.session}` : ""}</div>
                          </div>
                          {t.strategy && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em" }}>{stratCode(t.strategy)}</span>}
                          <span style={{ fontFamily: DISPLAY, fontSize: "15px", color: C.text, fontWeight: 500, letterSpacing: "-0.01em", minWidth: "50px", textAlign: "right" }}>{t.rr ? `${t.rr}R` : "—"}</span>
                          <span style={{ fontFamily: MONO, fontSize: "12px", letterSpacing: "0.06em", color: outcomeColor(t.outcome, C), minWidth: "22px", textAlign: "right" }}>{outcomeLetter(t.outcome)}</span>
                        </div>
                        {expanded && (
                          <div style={{ padding: "4px 0 24px" }}>
                            {/* Meta line */}
                            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em", color: C.muted, textTransform: "uppercase" }}>
                              {t.strategy && <span>{stratCode(t.strategy)} · {stratShort(t.strategy)}</span>}
                              {t.bias && <span style={{ color: t.bias === "Bullish" ? C.green : t.bias === "Bearish" ? C.red : C.muted }}>{t.bias}</span>}
                              {t.setup && <span>{stratShort(t.setup)}</span>}
                              {t.pnl && <span style={{ color: parseFloat(t.pnl) >= 0 ? C.green : C.red }}>{parseFloat(t.pnl) >= 0 ? "+" : ""}{t.pnl}R</span>}
                              {t.pnlDollar && <span style={{ color: parseFloat(t.pnlDollar) >= 0 ? C.green : C.red }}>{parseFloat(t.pnlDollar) >= 0 ? "+" : ""}${t.pnlDollar}</span>}
                            </div>
                            {/* Prices */}
                            {t.entryPrice && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0", marginBottom: "16px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                                {[["ENTRY", t.entryPrice], ["SL", t.slPrice], ["TP", t.tpPrice]].map(([l2, v], i) => v ? (
                                  <div key={l2} style={{ padding: "12px 10px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
                                    <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "4px" }}>{l2}</div>
                                    <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.02em" }}>{v}</div>
                                  </div>
                                ) : null)}
                              </div>
                            )}
                            {/* Screenshot */}
                            {t.screenshot ? (
                              <div style={{ marginBottom: "16px", position: "relative" }}>
                                <img src={t.screenshot} alt="chart" style={{ width: "100%", border: `1px solid ${C.border}`, display: "block", maxHeight: "220px", objectFit: "cover" }} />
                                <div style={{ position: "absolute", top: "8px", right: "8px", display: "flex", gap: "6px" }}>
                                  <label htmlFor={`ss-${t.id}`} style={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "4px 10px", fontSize: "10px", color: C.text, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em" }}>REPLACE
                                    <input id={`ss-${t.id}`} type="file" accept="image/jpeg,image/png" onChange={e => handleScreenshotUpload(e, t.id)} /></label>
                                  <button onClick={() => removeScreenshot(t.id)} style={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "999px", color: C.text, padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em" }}>REMOVE</button>
                                </div>
                              </div>
                            ) : (
                              <label htmlFor={`ss-${t.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${C.border2}`, padding: "14px", cursor: "pointer", color: C.muted, fontSize: "11px", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
                                Add screenshot
                                <input id={`ss-${t.id}`} type="file" accept="image/jpeg,image/png" onChange={e => handleScreenshotUpload(e, t.id)} />
                              </label>
                            )}
                            {t.notes && <div style={{ fontSize: "14px", color: C.text, lineHeight: 1.65, marginBottom: "14px", borderLeft: `1px solid ${C.border2}`, paddingLeft: "14px", fontFamily: BODY }}>{t.notes}</div>}
                            {getEmotionTags(t.emotions).length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                                {getEmotionTags(t.emotions).map(id => {
                                  const tag = EMOTION_TAGS.find(e => e.id === id);
                                  if (!tag) return null;
                                  return <span key={id} style={{ background: tag.color + "22", color: tag.color, border: `1px solid ${tag.color}44`, borderRadius: "999px", padding: "3px 10px", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{tag.label}</span>;
                                })}
                              </div>
                            )}

                            {/* Reactions */}
                            <div style={{ marginBottom: "16px" }}>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "10px" }}>REACTIONS</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {REACTIONS.map(rx => {
                                  const raw = (t.reactions || {})[rx];
                                  // Support both new (string[]) and legacy (number) formats.
                                  const reactors: string[] = Array.isArray(raw) ? raw : (raw > 0 ? [] : []);
                                  const count = Array.isArray(raw) ? raw.length : (raw || 0);
                                  const myCode = profile.code || "";
                                  const iMine = Array.isArray(raw) && raw.includes(myCode);
                                  return (
                                    <button key={rx} onClick={() => toggleReaction(t.id, rx)}
                                      style={{ background: iMine ? C.text : "transparent", color: iMine ? C.bg : C.text, border: `1px solid ${iMine ? C.text : C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span>{rx}</span>
                                      {count > 0 && <span>{count}</span>}
                                    </button>
                                  );
                                  void reactors;
                                })}
                              </div>
                            </div>

                            {/* Comments */}
                            <div style={{ marginBottom: "16px" }}>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "10px" }}>NOTES {(t.comments || []).length > 0 && `(${(t.comments || []).length})`}</div>
                              {(t.comments || []).map((c: any) => (
                                <div key={c.id} style={{ padding: "10px 0", borderTop: `1px solid ${C.border}`, display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                  <AvatarCircle name={c.author} size={26} C={C} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                      <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.04em" }}>{c.author}</span>
                                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                        <span style={{ fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.04em" }}>{c.ts}</span>
                                        {(c.author === profile.name || c.author === "You") && (
                                          <button onClick={() => deleteComment(t.id, c.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: "10px", cursor: "pointer", fontFamily: MONO }}>x</button>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: "13px", color: C.text2, lineHeight: 1.55, wordBreak: "break-word", fontFamily: BODY }}>{c.text}</div>
                                  </div>
                                </div>
                              ))}
                              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "12px", borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
                                <AvatarCircle name={profile.name} avatar={profile.avatar} size={26} C={C} />
                                <input value={commentText} onChange={e => setCommentInputs((p: any) => ({ ...p, [t.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === "Enter") addComment(t.id); }}
                                  placeholder="Add a note..." style={{ ...inp, fontSize: "13px", flex: 1, padding: "6px 0" }} />
                                <button onClick={() => addComment(t.id)} style={{ ...pillPrimary(!!commentText.trim()), width: "auto", padding: "8px 16px", fontSize: "11px" }}>Post</button>
                              </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button onClick={() => editTrade(t)} style={{ ...pillGhost, padding: "8px 14px" }}>EDIT</button>
                              {confirmDelete === t.id ? (
                                <>
                                  <button onClick={() => deleteTrade(t.id)} style={{ ...pillGhost, padding: "8px 14px", color: C.red, borderColor: C.red }}>CONFIRM</button>
                                  <button onClick={() => setConfirmDelete(null)} style={{ ...pillGhost, padding: "8px 14px" }}>CANCEL</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmDelete(t.id)} style={{ ...pillGhost, padding: "8px 14px", color: C.red, borderColor: `${C.red}55` }}>DELETE</button>
                              )}
                              {t.screenshot && <a href={t.screenshot} target="_blank" rel="noreferrer" style={{ ...pillGhost, padding: "8px 14px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>CHART ↗</a>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ STATS ══════════════════════════ */}
          {view === "stats" && (
            <div style={{ marginTop: "clamp(16px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: "clamp(32px, 5vw, 48px)" }}>
              {!isDesktop && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", paddingBottom: "10px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <SubNavDropdown sections={STATS_SECTIONS} value={statsTab} onChange={setStatsTab} C={C} />
                    <button onClick={() => {
                      const norm = (profile.handle || "").replace(/^@/, "").toLowerCase();
                      const today = new Date().toISOString().split("T")[0];
                      const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
                      const avgR = total > 0 ? (totalPnL / total).toFixed(2) : "0";
                      const recentTrades = [...trades].sort((a: any,b: any) => b.date > a.date ? 1 : -1).slice(0, 15);
                      const stratMap: Record<string, {w:number,l:number,pnl:number}> = {};
                      trades.forEach((t: any) => {
                        if (!t.strategy) return;
                        if (!stratMap[t.strategy]) stratMap[t.strategy] = {w:0,l:0,pnl:0};
                        if (t.outcome === "Win") stratMap[t.strategy].w++;
                        else if (t.outcome === "Loss") stratMap[t.strategy].l++;
                        stratMap[t.strategy].pnl += parseFloat(t.pnl)||0;
                      });
                      const topStrats = Object.entries(stratMap).sort((a,b)=>b[1].pnl-a[1].pnl).slice(0,5);
                      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TRADR Report — ${profile.name||"Trader"} — ${today}</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:800px;margin:0 auto}
h1{font-size:28px;font-weight:600;letter-spacing:-0.02em;margin-bottom:4px}
.meta{font-size:12px;color:#888;font-family:monospace;letter-spacing:0.08em;margin-bottom:40px}
h2{font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin:32px 0 12px;padding-top:24px;border-top:1px solid #eee}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px}
.card{background:#f8f8f7;border-radius:8px;padding:14px;text-align:center}
.card-n{font-size:28px;font-weight:500;letter-spacing:-0.02em}
.card-l{font-size:10px;color:#888;margin-top:2px;letter-spacing:0.08em;text-transform:uppercase}
.green{color:#15803d}.red{color:#dc2626}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 0;border-bottom:2px solid #eee;font-family:monospace;font-size:10px;letter-spacing:0.1em;color:#888}
td{padding:8px 0;border-bottom:1px solid #f0f0f0}
.footer{margin-top:48px;font-size:11px;color:#aaa;font-family:monospace;letter-spacing:0.08em;border-top:1px solid #eee;padding-top:16px}
@media print{body{padding:20px}.no-print{display:none}}
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:24px;padding:10px 20px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:monospace;letter-spacing:0.08em">Print / Save as PDF</button>
<h1>${profile.name||"Trader"}</h1>
<div class="meta">@${norm} &nbsp;·&nbsp; TRADR PERFORMANCE REPORT &nbsp;·&nbsp; ${today}</div>
<div class="grid">
<div class="card"><div class="card-n">${total}</div><div class="card-l">Trades</div></div>
<div class="card"><div class="card-n ${wr>=50?"green":"red"}">${wr}%</div><div class="card-l">Win Rate</div></div>
<div class="card"><div class="card-n ${parseFloat(avgR)>=0?"green":"red"}">${parseFloat(avgR)>=0?"+":""}${avgR}R</div><div class="card-l">Avg R / Trade</div></div>
<div class="card"><div class="card-n ${totalPnL>=0?"green":"red"}">${totalPnL>=0?"+":""}${totalPnL.toFixed(1)}R</div><div class="card-l">Total P&L</div></div>
</div>
<h2>Top Strategies</h2>
<table><tr><th>Strategy</th><th>W</th><th>L</th><th>Win %</th><th>Total P&L</th></tr>
${topStrats.map(([name,s]:[string,any])=>`<tr><td>${name}</td><td>${s.w}</td><td>${s.l}</td><td>${s.w+s.l>0?Math.round(s.w/(s.w+s.l)*100):0}%</td><td class="${s.pnl>=0?"green":"red"}">${s.pnl>=0?"+":""}${s.pnl.toFixed(2)}R</td></tr>`).join("")}
</table>
<h2>Recent Trades</h2>
<table><tr><th>Date</th><th>Pair</th><th>Strategy</th><th>Session</th><th>Outcome</th><th>P&L</th></tr>
${recentTrades.map((t:any)=>`<tr><td>${t.date}</td><td>${t.pair||"—"}</td><td>${t.strategy||"—"}</td><td>${t.session||"—"}</td><td class="${t.outcome==="Win"?"green":t.outcome==="Loss"?"red":""}">${t.outcome||"—"}</td><td class="${parseFloat(t.pnl)>=0?"green":"red"}">${parseFloat(t.pnl)>=0?"+":""}${t.pnl||0}R</td></tr>`).join("")}
</table>
<div class="footer">Generated by TRADR · tradrjournal.xyz · ${today}</div>
</body></html>`;
                      const w = window.open("", "_blank");
                      if (w) { w.document.write(html); w.document.close(); }
                    }} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>
                      Export PDF ↗
                    </button>
                  </div>
                  <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
                </div>
              )}

              {statsTab === "overview" && total === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontStyle: "italic" }}>Log trades to see stats.</div>}

              {statsTab === "overview" && total > 0 && (
                <>
                  <section>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
                      <SectionKicker label="OVERVIEW" C={C}/>
                      <button onClick={()=>{ const txt=`${profile.handle||"Trader"} · ${total} trades · ${winRate}% WR · ${pnlPos?"+":""}${totalPnL}R\n\n@tradrjournal https://tradrjournal.xyz`; window.open(`https://x.com/intent/post?text=${encodeURIComponent(txt)}`,"_blank","noopener"); }} style={{ background:"transparent", border:`1px solid ${C.border2}`, borderRadius:"999px", padding:"6px 12px", cursor:"pointer", fontFamily:MONO, fontSize:"9px", letterSpacing:"0.08em", color:C.muted, display:"flex", alignItems:"center", gap:"5px" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Share Stats
                      </button>
                    </div>
                    <div style={{ borderTop:`1px solid ${C.border}` }}>
                      {[
                        ["Total Trades", total],
                        ["Win Rate", `${winRate}%`],
                        ["Total P&L", pnlMode === "$" && hasDollarData ? `${totalPnlDollar >= 0 ? "+" : "−"}$${Math.abs(totalPnlDollar).toFixed(2)}` : `${pnlPos ? "+" : ""}${totalPnL}R`],
                        ["Average R:R", avgRR === "—" ? "—" : `${avgRR}R`],
                        ["Wins / Losses / B/E", `${wins} / ${losses} / ${bes}`],
                        ["Best Streak", (() => { let best = 0, cur = 0, last: any = null; trades.slice().reverse().forEach((t: any) => { if (t.outcome === "Win") { cur = last === "Win" ? cur + 1 : 1; last = "Win"; best = Math.max(best, cur); } else { last = t.outcome; cur = 0; } }); return best > 0 ? `${best}W` : "—"; })()],
                      ].map(([k, v]) => (
                        <div key={k as any} style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{k}</span>
                          <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  {Object.entries(sessionStats).length > 0 && (
                    <section>
                      <SectionKicker label="SESSION BREAKDOWN" C={C} />
                      <div style={{ marginTop: "14px", borderTop: `1px solid ${C.border}` }}>
                        {Object.entries(sessionStats).map(([session, v]: any) => {
                          const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                          return (
                            <div key={session} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "baseline", padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{session}</span>
                              <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.04em" }}>{wr}%</span>
                              <span style={{ fontFamily: MONO, fontSize: "11px", color: v.pnl >= 0 ? C.green : C.red, letterSpacing: "0.04em", minWidth: "60px", textAlign: "right" }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {Object.entries(pairStats).length > 0 && (
                    <section>
                      <SectionKicker label="PAIR PERFORMANCE" C={C} />
                      <div style={{ marginTop: "14px", borderTop: `1px solid ${C.border}` }}>
                        {Object.entries(pairStats).sort((a: any, b: any) => b[1].pnl - a[1].pnl).map(([pair, v]: any) => {
                          const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                          return (
                            <div key={pair} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "12px", alignItems: "baseline", padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{pair}</span>
                              <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>{v.w + v.l}T</span>
                              <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text }}>{wr}%</span>
                              <span style={{ fontFamily: MONO, fontSize: "11px", color: v.pnl >= 0 ? C.green : C.red, minWidth: "60px", textAlign: "right" }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}


              {statsTab === "performance" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
                  <div style={{ display:"flex", gap:"8px" }}>
                    {(["r","$"] as const).map(m=>(
                      <button key={m} onClick={()=>setPerfPnlMode(m)} style={{ background:perfPnlMode===m?C.text:"transparent", color:perfPnlMode===m?C.bg:C.muted, border:`1px solid ${C.border2}`, borderRadius:"999px", padding:"6px 14px", cursor:"pointer", fontFamily:MONO, fontSize:"10px", letterSpacing:"0.1em", textTransform:"uppercase" }}>
                        {m==="r"?"R-Multiple":"Dollar"}
                      </button>
                    ))}
                  </div>
                  {total===0
                    ? <div style={{ textAlign:"center", padding:"60px 0", color:C.muted, fontSize:"13px", fontFamily:MONO }}>LOG TRADES TO SEE PERFORMANCE</div>
                    : <>
                        <section>
                          <SectionKicker label="TRADE STATISTICS" C={C}/>
                          <div style={{ marginTop:"14px" }}><TradeStatCards trades={trades} C={C}/></div>
                        </section>
                        <section><AvgStatsCards trades={trades} C={C}/></section>
                        <section><DailyInsights trades={trades} C={C} useDollar={perfPnlMode==="$"&&hasDollarData}/></section>
                        <section>
                          <SectionKicker label="DAILY P&L" C={C}/>
                          <div style={{ marginTop:"14px", display:"grid", gridTemplateColumns:isDesktop?"1fr 1fr":"1fr", gap:"14px" }}>
                            <DailyCumulativePnLChart trades={trades} C={C} useDollar={perfPnlMode==="$"&&hasDollarData}/>
                            <NetDailyPnLChart trades={trades} C={C} useDollar={perfPnlMode==="$"&&hasDollarData}/>
                          </div>
                        </section>
                        <section>
                          <SectionKicker label="TRADE DURATION ANALYSIS" C={C}/>
                          <div style={{ marginTop:"14px" }}><TradeDurationChart trades={trades} C={C}/></div>
                        </section>
                        <section>
                          <SectionKicker label="DRAWDOWN CURVE" C={C}/>
                          <div style={{ marginTop:"14px" }}><DrawdownCurve trades={trades} C={C}/></div>
                        </section>
                      </>
                  }
                </div>
              )}

              {statsTab === "strategies" && (
                <>
                  <section>
                    <SectionKicker label="WIN RATE BY STRATEGY" C={C} />
                    <div style={{ marginTop: "20px" }}><WinRateChart trades={trades} C={C} /></div>
                  </section>
                  <section>
                    <SectionKicker label="MONTHLY P&L" C={C} />
                    <div style={{ marginTop: "20px" }}><MonthlyPnLChart trades={trades} C={C} /></div>
                  </section>
                  {Object.entries(stratStats).length > 0 && (
                    <section>
                      <SectionKicker label="STRATEGY DETAIL" C={C} />
                      <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
                        {Object.entries(stratStats).map(([s, v]: any, idx) => {
                          const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                          return (
                            <div key={s}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                                <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em" }}>{String(idx + 1).padStart(2, "0")}</span>
                                  <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{stratCode(s)}</span>
                                  <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text2 }}>{stratShort(s)}</span>
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.04em" }}>
                                  {v.count}T · {wr}% · <span style={{ color: v.pnl >= 0 ? C.green : C.red }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                                </div>
                              </div>
                              <div style={{ height: "1px", background: C.border }}>
                                <div style={{ height: "1px", background: C.text, width: `${Math.min((v.count / total) * 100, 100)}%`, transition: "width 0.5s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}

              {statsTab === "calendar" && (
                <section>
                  <CalendarView trades={trades} C={C} onDayClick={(key: string) => { const dt = trades.filter(t => t.date === key); setCalDayTrades({ key, trades: dt }); }} />
                  {calDayTrades && (
                    <div style={{ marginTop: "20px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", alignItems: "baseline" }}>
                        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>{calDayTrades.key} · {calDayTrades.trades.length} TRADE{calDayTrades.trades.length !== 1 ? "S" : ""}</span>
                        <button onClick={() => setCalDayTrades(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "12px" }}>close</button>
                      </div>
                      {calDayTrades.trades.map((t: any) => (
                        <div key={t.id} className="row-hvr" onClick={() => { setView("history"); setExpandedId(t.id); }}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text }}>{t.pair}</span>
                          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            {t.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2 }}>{t.rr}R</span>}
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: outcomeColor(t.outcome, C), letterSpacing: "0.06em" }}>{outcomeLetter(t.outcome)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {statsTab === "psychology" && (
                <section>
                  {(() => {
                    const tagStats = EMOTION_TAGS.map(tag => {
                      const tagged = trades.filter(t => getEmotionTags(t.emotions).includes(tag.id));
                      const wins = tagged.filter(t => t.outcome === "Win").length;
                      const losses = tagged.filter(t => t.outcome === "Loss").length;
                      const wr = tagged.length ? Math.round((wins / tagged.length) * 100) : null;
                      const avgPnl = tagged.length ? tagged.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0) / tagged.length : null;
                      return { ...tag, count: tagged.length, wins, losses, wr, avgPnl };
                    }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);

                    if (!tagStats.length) return (
                      <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontStyle: "italic" }}>
                        Tag your emotional state when logging trades to see patterns here.
                      </div>
                    );

                    return (
                      <div>
                        <SectionKicker label="EMOTION × OUTCOME" C={C} />
                        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {tagStats.map(tag => (
                            <div key={tag.id} style={{ padding: "14px 16px", border: `1px solid ${C.border}`, borderRadius: "8px", background: tag.color + "0a" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <span style={{ fontFamily: MONO, fontSize: "11px", color: tag.color, letterSpacing: "0.08em", textTransform: "uppercase" }}>{tag.label}</span>
                                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>{tag.count} trade{tag.count !== 1 ? "s" : ""}</span>
                              </div>
                              <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "3px" }}>WIN RATE</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: (tag.wr ?? 0) >= 50 ? C.green : C.red }}>{tag.wr !== null ? `${tag.wr}%` : "—"}</div>
                                </div>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "3px" }}>AVG P&L</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: (tag.avgPnl ?? 0) >= 0 ? C.green : C.red }}>{tag.avgPnl !== null ? `${tag.avgPnl >= 0 ? "+" : ""}${tag.avgPnl.toFixed(2)}R` : "—"}</div>
                                </div>
                                <div style={{ flex: 1, textAlign: "right" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green }}>{tag.wins}W</span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}> / </span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.red }}>{tag.losses}L</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </section>
              )}
            </div>
          )}

              {statsTab === "heatmap" && (
                <section>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "16px" }}>P&L BY SESSION × DAY</div>
                  <SessionHeatmap trades={trades} C={C} />
                  <div style={{ marginTop: "32px" }}>
                    <SectionKicker label="DRAWDOWN CURVE" C={C} />
                    <div style={{ marginTop: "14px" }}><DrawdownCurve trades={trades} C={C} /></div>
                  </div>
                </section>
              )}

              {statsTab === "maemfe" && (
                <section>
                  <SectionKicker label="MAE vs MFE — TRADE EFFICIENCY" C={C} />
                  <div style={{ marginTop: "8px", fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.6, marginBottom: "16px" }}>
                    MAE = how far price moved against you · MFE = how far it moved in your favour · capture efficiency = P&L ÷ MFE
                  </div>
                  <MAEMFEChart trades={trades} C={C} />
                </section>
              )}

          {/* ══════════════════════════ CHECKLIST ══════════════════════════ */}
          {view === "checklist" && (
            <div style={{ marginTop: "clamp(16px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <SectionKicker label={`${checklistTab === "rules" ? "RULES" : "PRE-TRADE"} · ${stratShort(activeStrategy).toUpperCase()}`} C={C} />
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <StrategySelect strategies={allStrategyNames} value={activeStrategy} onChange={(s: string) => { setActiveStrategy(s); setEditingCheckItem(null); setEditingRule(null); }} C={C} align="right" />
                  {customStrategies.find((s: any) => s.name === activeStrategy) && (
                    <>
                      <button onClick={() => openEditStrategy(customStrategies.find((s: any) => s.name === activeStrategy))}
                        style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
                        Edit
                      </button>
                      <button onClick={() => { if (confirm(`Delete "${activeStrategy}"?`)) deleteCustomStrategy(activeStrategy); }}
                        style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
                        Del
                      </button>
                    </>
                  )}
                  <button onClick={openNewStrategy}
                    style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    + New
                  </button>
                </div>
              </div>

              {showStrategyEditor && (
                <StrategyEditor
                  draft={strategyDraft} setDraft={setStrategyDraft}
                  onSave={saveStrategyDraft} onCancel={() => setShowStrategyEditor(false)}
                  isEdit={!!editingStrategy} C={C} inp={inp} lbl={lbl}
                />
              )}
              {!isDesktop && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", paddingBottom: "10px", borderBottom: `1px solid ${C.border}`, marginTop: "4px" }}>
                  <SubNavDropdown sections={CHECKLIST_SECTIONS} value={checklistTab} onChange={setChecklistTab} C={C} />
                  <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
                </div>
              )}

              {checklistTab === "pretrade" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <ConfluenceTracker
                    checkItems={checkItems} checkedCount={checkedCount} totalItems={totalItems}
                    isChecked={isChecked} activeStrategy={activeStrategy} C={C}
                    stratThresholds={stratThresholds} saveStratThresholds={saveStratThresholds}
                    inp={inp} pillGhost={pillGhost}
                  />
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {checkItems.map((item: any) => {
                      const ch = isChecked(item.id);
                      return (
                        <div key={item.id} className="check-row" style={{ borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px", minHeight: "52px" }}>
                          {/* 44×44 touch target wrapping the 18px visual circle */}
                          <div onClick={() => toggleCheck(item.id)}
                            style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                            <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `1px solid ${ch ? C.text : C.border2}`, background: ch ? C.text : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                              {ch && <span style={{ color: C.bg, fontSize: "10px", lineHeight: 1 }}>✓</span>}
                            </div>
                          </div>
                          {editingCheckItem === item.id
                            ? <EditInline val={item.text} onSave={(t: string) => saveEditCheck(item.id, t)} onCancel={() => setEditingCheckItem(null)} C={C} />
                            : <>
                              <span onClick={() => toggleCheck(item.id)}
                                style={{ flex: 1, fontSize: "14px", color: ch ? C.muted : C.text, textDecoration: ch ? "line-through" : "none", cursor: "pointer", lineHeight: 1.5, fontFamily: BODY }}>{item.text}</span>
                              <div className="ca" style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s" }}>
                                <button onClick={() => setEditingCheckItem(item.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>edit</button>
                                <button onClick={() => deleteCheckItem(item.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>rm</button>
                              </div>
                            </>}
                        </div>
                      );
                    })}
                  </div>
                  {addingCheck
                    ? <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input autoFocus value={newCheckText} onChange={e => setNewCheckText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addCheckItem(); if (e.key === "Escape") { setAddingCheck(false); setNewCheckText(""); } }}
                        placeholder="New condition..." style={{ ...inp, flex: 1 }} />
                      <button onClick={addCheckItem} style={{ ...pillPrimary(!!newCheckText.trim()), width: "auto", padding: "10px 16px" }}>Add</button>
                      <button onClick={() => { setAddingCheck(false); setNewCheckText(""); }} style={{ ...pillGhost, padding: "10px 14px" }}>X</button>
                    </div>
                    : <button onClick={() => setAddingCheck(true)} style={{ ...pillGhost, alignSelf: "flex-start" }}>+ ADD CONDITION</button>
                  }
                  {checkedCount > 0 && <button onClick={resetChecklist} style={{ ...pillGhost, alignSelf: "flex-start" }}>↺ RESET CHECKLIST</button>}

                  <PositionSizeCalc C={C} inp={inp} profile={profile} saveProfile={saveProfile} />
                </div>
              )}

              {checklistTab === "rules" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Read before every {stratShort(activeStrategy)} session.
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {ruleItems.map((rule: any, idx: number) => (
                      <div key={rule.id} className="check-row" style={{ minHeight: "52px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px", padding: "8px 0" }}>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", minWidth: "24px" }}>{String(idx + 1).padStart(2, "0")}</span>
                        {editingRule === rule.id
                          ? <EditInline val={rule.text} onSave={(t: string) => saveEditRule(rule.id, t)} onCancel={() => setEditingRule(null)} C={C} />
                          : <>
                            <span style={{ flex: 1, fontSize: "14px", color: C.text, lineHeight: 1.55, fontFamily: BODY }}>{rule.text}</span>
                            <div className="ca" style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s" }}>
                              <button onClick={() => setEditingRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>edit</button>
                              <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>rm</button>
                            </div>
                          </>}
                      </div>
                    ))}
                  </div>
                  {addingRule
                    ? <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input autoFocus value={newRuleText} onChange={e => setNewRuleText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addRule(); if (e.key === "Escape") { setAddingRule(false); setNewRuleText(""); } }}
                        placeholder="New rule..." style={{ ...inp, flex: 1 }} />
                      <button onClick={addRule} style={{ ...pillPrimary(!!newRuleText.trim()), width: "auto", padding: "10px 16px" }}>Add</button>
                      <button onClick={() => { setAddingRule(false); setNewRuleText(""); }} style={{ ...pillGhost, padding: "10px 14px" }}>X</button>
                    </div>
                    : <button onClick={() => setAddingRule(true)} style={{ ...pillGhost, alignSelf: "flex-start" }}>+ ADD RULE</button>
                  }
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ PROFILE ══════════════════════════ */}
          {view === "profile" && (
            <ProfileView
              profile={profile}
              myCode={getMyCode()}
              followers={followers}
              following={following}
              friendCodes={friendCodes}
              myCircles={myCircles}
              followUser={followUser}
              unfollowUser={unfollowUser}
              wins={wins}
              losses={losses}
              total={total}
              winRate={winRate}
              totalPnL={totalPnL}
              pnlPos={pnlPos}
              avgRR={avgRR}
              streak={streak}
              showToast={showToast}
              C={C}
              pillGhost={pillGhost}
              pillPrimary={pillPrimary}
              setView={setView}
              setActiveCircle={setActiveCircle}
              setCirclesView={setCirclesView}
            />
          )}

          {/* ══════════════════════════ IMPORT ══════════════════════════ */}
          {view === "import" && (() => {
            const COMING_SOON_BROKERS = [
              { name: "NinjaTrader",        desc: "Live sync for NinjaTrader 8 accounts.",           tag: "FUTURES" },
              { name: "Interactive Brokers", desc: "IBKR TWS — equities, futures, FX.",              tag: "MULTI-ASSET" },
              { name: "TopstepX Direct",     desc: "Live eval stats without CSV exports.",           tag: "PROP FIRM" },
              { name: "Apex Trader Funding", desc: "Direct API sync. No more manual statements.",    tag: "PROP FIRM" },
              { name: "Earn2Trade",          desc: "Auto-import from your Gauntlet/Trader Career.",  tag: "PROP FIRM" },
              { name: "MT5 Live",            desc: "Real-time sync from MetaTrader 5 accounts.",     tag: "FOREX / CFD" },
              { name: "Tradier",             desc: "US equities and options broker sync.",            tag: "EQUITIES" },
              { name: "Coinbase Advanced",   desc: "Spot and futures crypto trade import.",          tag: "CRYPTO" },
            ];
            return (
              <div style={{ marginTop: "clamp(16px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: "clamp(32px, 5vw, 48px)" }}>
                {!isDesktop && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
                  </div>
                )}

                {/* ── Coming soon teaser banner ── */}
                <section style={{ border: `1px solid ${C.border2}`, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
                  {/* subtle background grid */}
                  <div style={{ position: "absolute", inset: 0, backgroundImage: `repeating-linear-gradient(0deg, ${C.border} 0px, ${C.border} 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, ${C.border} 0px, ${C.border} 1px, transparent 1px, transparent 32px)`, opacity: 0.35, pointerEvents: "none" }} />
                  <div style={{ position: "relative" }}>
                    <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.20em", textTransform: "uppercase", marginBottom: "10px" }}>Integrations · Roadmap</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "clamp(20px, 4vw, 26px)", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: "10px" }}>
                      More brokers.<br />Zero manual entry.
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.65, maxWidth: "360px", marginBottom: "18px" }}>
                      We're building direct sync for every major prop firm and broker. Log trades the moment they close — no CSV, no copy-paste.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.text, letterSpacing: "0.12em", textTransform: "uppercase", border: `1px solid ${C.border2}`, padding: "8px 16px" }}>
                        Launching soon — stay tuned
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                        {COMING_SOON_BROKERS.length} integrations in progress
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── Live connections ── */}
                <section>
                  <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                    LIVE NOW
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                    {/* Tradovate tile */}
                    <button onClick={() => setShowLiveModal(true)}
                      style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ border: `1px solid ${tradovateSession ? C.green + "66" : C.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", transition: "border-color 0.2s" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>Tradovate</div>
                            <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 7px", border: `1px solid ${C.border2}`, color: C.muted }}>FUTURES</span>
                          </div>
                          {tradovateSession ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                              <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.06em" }}>
                                {tradovateSession.accountName ?? "Connected"} · {tradovateSession.env.toUpperCase()}
                              </span>
                            </div>
                          ) : (
                            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>
                              Live positions + auto-import closed fills
                            </div>
                          )}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: tradovateSession ? C.text : C.muted, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${tradovateSession ? C.text : C.border2}`, paddingBottom: "2px" }}>
                          {tradovateSession ? "Manage →" : "Connect →"}
                        </div>
                      </div>
                    </button>

                    {/* Rithmic CSV tile */}
                    <button onClick={() => { setView("history"); setShowCsvImport(true); }}
                      style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>Rithmic CSV</div>
                            <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 7px", border: `1px solid ${C.border2}`, color: C.muted }}>PROP FIRM</span>
                          </div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>
                            Apex, TopstepX, Earn2Trade — import your trade statement
                          </div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border2}`, paddingBottom: "2px" }}>
                          Import →
                        </div>
                      </div>
                    </button>

                    {/* Generic CSV tile */}
                    <button onClick={() => { setView("history"); setShowCsvImport(true); }}
                      style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>CSV Import</div>
                            <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 7px", border: `1px solid ${C.border2}`, color: C.muted }}>MT4 / MT5 / TV</span>
                          </div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>
                            MT4, MT5, TradingView, ThinkorSwim and most broker exports
                          </div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border2}`, paddingBottom: "2px" }}>
                          Import →
                        </div>
                      </div>
                    </button>
                  </div>
                </section>

                {/* ── Coming soon grid ── */}
                <section>
                  <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                    COMING SOON
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: "1px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    {COMING_SOON_BROKERS.map((b, i) => (
                      <div key={b.name}
                        style={{ padding: "18px 20px", borderRight: isDesktop && i % 2 === 0 ? `1px solid ${C.border}` : "none", borderBottom: i < COMING_SOON_BROKERS.length - (isDesktop ? 2 : 1) ? `1px solid ${C.border}` : "none", background: C.bg }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                          <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: C.text2, letterSpacing: "-0.01em" }}>{b.name}</div>
                          <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 6px", border: `1px solid ${C.border2}`, color: C.dim, whiteSpace: "nowrap", flexShrink: 0, marginLeft: "8px" }}>{b.tag}</span>
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: "12px", color: C.dim, lineHeight: 1.55 }}>{b.desc}</div>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: "10px" }}>— Coming soon</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ── Request a broker ── */}
                <section style={{ paddingBottom: "clamp(20px, 4vw, 32px)" }}>
                  <div style={{ border: `1px solid ${C.border}`, padding: "20px 24px", display: "flex", flexDirection: isDesktop ? "row" : "column", justifyContent: "space-between", alignItems: isDesktop ? "center" : "flex-start", gap: "14px" }}>
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: C.text2, letterSpacing: "-0.01em", marginBottom: "4px" }}>Don't see your broker?</div>
                      <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>Tell us which one you use and we'll prioritise it.</div>
                    </div>
                    <button onClick={() => setFeedbackOpen(true)}
                      style={{ background: C.text, color: C.bg, border: "none", padding: "12px 20px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
                      Request →
                    </button>
                  </div>
                </section>
              </div>
            );
          })()}

          {/* ══════════════════════════ CIRCLES ══════════════════════════ */}
          {view === "circles" && (
            <TradingCircles
              myCircles={myCircles} circlesView={circlesView} setCirclesView={setCirclesView}
              activeCircle={activeCircle} setActiveCircle={setActiveCircle}
              circleForm={circleForm} setCircleForm={setCircleForm}
              circleJoinCode={circleJoinCode} setCircleJoinCode={setCircleJoinCode}
              circleMsg={circleMsg} setCircleMsg={setCircleMsg}
              createCircle={createCircle} joinCircle={joinCircle}
              publishToCircle={publishToCircle} fetchCircleLeaderboard={fetchCircleLeaderboard}
              profile={profile} getMyCode={getMyCode} showToast={showToast}
              wins={wins} losses={losses} total={total} winRate={winRate}
              totalPnL={totalPnL} pnlPos={pnlPos} weekPnL={weekPnL} weekPnLPos={weekPnLPos} weekPnLStr={weekPnLStr}
              avgRR={avgRR} streak={streak}
              STRATEGY_NAMES={allStrategyNames} C={C} inp={inp} sel={sel} lbl={lbl}
              pillPrimary={pillPrimary} pillGhost={pillGhost}
              following={following} followUser={followUser} unfollowUser={unfollowUser}
              kickMember={kickMember}
              leaveCircle={leaveCircle}
              openProfile={openProfile}
              isJoiningCircle={isJoiningCircle}
              isCreatingCircle={isCreatingCircle}
              totalPnlDollar={totalPnlDollar}
              hasDollarData={hasDollarData}
            />
          )}
          </div>{/* end main */}
        </div>{/* end grid */}

        {/* ── BOTTOM NAV (mobile only — desktop uses the top-nav strip inside the masthead) ── */}
        {!isDesktop && (
          <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", background: C.bg, borderTop: `0.5px solid ${C.border}`, display: "flex", zIndex: 10, paddingBottom: "env(safe-area-inset-bottom)" }}>
            {NAV_TABS.map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)}
                style={{ flex: 1, minHeight: "44px", padding: "0 4px", background: "none", border: "none", borderTop: view === tab.id ? `1px solid ${C.text}` : "1px solid transparent", marginTop: "-0.5px", color: view === tab.id ? C.text : C.dim, fontSize: "9px", letterSpacing: "0.10em", cursor: "pointer", fontFamily: MONO, textTransform: "uppercase", transition: "color 0.12s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Feedback floating button ── */}
        <button
          onClick={() => setFeedbackOpen(true)}
          style={{ position: "fixed", bottom: isDesktop ? "28px" : "calc(44px + env(safe-area-inset-bottom) + 16px)", right: "16px", zIndex: 998, background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "12px 20px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", boxShadow: "0 2px 12px rgba(0,0,0,0.25)", display: "flex", alignItems: "center" }}>
          Feedback
        </button>

        {/* ── Tradovate connect / live positions sheet ── */}
        {showLiveModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowLiveModal(false)}>
            <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "520px", padding: "10px 24px calc(40px + env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 28px" }} />

              {!tradovateSession ? (
                /* ── Connect form ── */
                <>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "10px" }}>Tradovate · Connect Account</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", marginBottom: "6px" }}>Live Positions</div>
                  <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.55, marginBottom: "24px" }}>
                    Connect your Tradovate account to see open positions in real time and auto-import closed fills into your journal.
                  </div>

                  {/* Env toggle */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
                    {(["demo", "live"] as const).map(env => (
                      <button key={env} onClick={() => setTradovateForm(f => ({ ...f, env }))}
                        style={{ flex: 1, padding: "10px", border: `1px solid ${tradovateForm.env === env ? C.text : C.border2}`, borderRadius: "6px", background: tradovateForm.env === env ? C.text : "transparent", color: tradovateForm.env === env ? C.bg : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.15s" }}>
                        {env}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Username</div>
                      <input
                        type="text"
                        value={tradovateForm.username}
                        onChange={e => setTradovateForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="Tradovate username"
                        autoComplete="username"
                        style={{ width: "100%", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "12px 14px", fontFamily: BODY, fontSize: "14px", color: C.text, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Password</div>
                      <input
                        type="password"
                        value={tradovateForm.password}
                        onChange={e => setTradovateForm(f => ({ ...f, password: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") connectTradovate(); }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        style={{ width: "100%", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "12px 14px", fontFamily: BODY, fontSize: "14px", color: C.text, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {tradovateError && (
                    <div style={{ fontFamily: BODY, fontSize: "12px", color: C.red, marginBottom: "14px", padding: "10px 14px", background: C.red + "18", borderRadius: "6px" }}>
                      {tradovateError}
                    </div>
                  )}

                  <div style={{ fontFamily: BODY, fontSize: "11px", color: C.dim, lineHeight: 1.5, marginBottom: "20px" }}>
                    Credentials are sent to your Vercel proxy and never stored in plain text. Only the session token is saved locally.
                  </div>

                  <button
                    onClick={connectTradovate}
                    disabled={tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim()}
                    style={{ width: "100%", padding: "14px", border: "none", borderRadius: "8px", background: tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim() ? C.border2 : C.text, color: tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim() ? C.muted : C.bg, cursor: tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim() ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px" }}>
                    {tradovateConnecting ? "Connecting…" : "Connect Tradovate →"}
                  </button>
                  <button onClick={() => setShowLiveModal(false)}
                    style={{ width: "100%", padding: "12px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Cancel
                  </button>
                </>
              ) : (
                /* ── Connected state ── */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.green }} />
                        Connected
                      </div>
                      <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>
                        {tradovateSession.accountName ?? "Tradovate"}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "4px" }}>
                        {tradovateSession.env.toUpperCase()} ACCOUNT{tradovateSession.lastSyncTime ? ` · Last sync ${new Date(tradovateSession.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                    <button onClick={syncTradovateFills} disabled={tradovateSyncing}
                      style={{ padding: "10px 18px", border: `1px solid ${C.border2}`, borderRadius: "999px", background: "transparent", color: tradovateSyncing ? C.muted : C.text, cursor: tradovateSyncing ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {tradovateSyncing ? "Syncing…" : "Sync fills"}
                    </button>
                  </div>

                  {/* Live positions list */}
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Open Positions {tradovatePositions.length > 0 && `(${tradovatePositions.length})`}</span>
                      <button onClick={() => refreshTradovatePositions(tradovateSession)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Refresh</button>
                    </div>
                    {tradovatePositions.length === 0 ? (
                      <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, padding: "20px 0", textAlign: "center", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                        No open positions
                      </div>
                    ) : (
                      <div style={{ borderTop: `1px solid ${C.border}` }}>
                        {tradovatePositions.map(pos => (
                          <div key={pos.contractId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{pos.symbol}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                                {pos.netPos > 0 ? "+" : ""}{pos.netPos} contracts · avg {pos.netPrice.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: pos.openPnl >= 0 ? C.green : C.red, letterSpacing: "-0.01em" }}>
                                {pos.openPnlStr}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "2px" }}>Open P&L</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={disconnectTradovate}
                    style={{ width: "100%", padding: "12px", border: `1px solid ${C.red}55`, borderRadius: "8px", background: "transparent", color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Disconnect Account
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Feedback modal ── */}
        {feedbackOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setFeedbackOpen(false)}>
            <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "520px", padding: "10px 24px 40px" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 24px" }} />
              <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, marginBottom: "6px" }}>Send feedback</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, marginBottom: "20px" }}>Found a bug? Got an idea? Dylon reads every message.</div>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="What's on your mind…"
                rows={5}
                style={{ width: "100%", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "14px", fontFamily: BODY, fontSize: "14px", color: C.text, resize: "none", lineHeight: 1.6, outline: "none" }}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button onClick={() => setFeedbackOpen(false)}
                  style={{ flex: 1, padding: "12px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Cancel
                </button>
                <button onClick={submitFeedback}
                  disabled={!feedbackText.trim() || feedbackSending || feedbackSent}
                  style={{ flex: 2, padding: "12px", border: "none", borderRadius: "8px", background: feedbackSent ? C.green : feedbackText.trim() && !feedbackSending ? C.text : C.border2, color: feedbackSent ? C.bg : feedbackText.trim() && !feedbackSending ? C.bg : C.muted, cursor: feedbackText.trim() && !feedbackSending && !feedbackSent ? "pointer" : "not-allowed", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", transition: "background 0.2s, color 0.2s" }}>
                  {feedbackSent ? "Sent! ✓" : feedbackSending ? "Sending…" : "Send to Dylon"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showUpgrade && (
          <UpgradeModal
            C={C}
            userId={profile.uid ?? ""}
            userEmail={profile.email ?? user?.email ?? ""}
            stripeCustomerId={profile.stripeCustomerId}
            onCustomerId={(cid) => setProfile(p => ({ ...p, stripeCustomerId: cid }))}
            onClose={() => setShowUpgrade(false)}
          />
        )}


        {viewProfile && (
          <ProfileModal
            handle={viewProfile}
            myCode={getMyCode()}
            following={following}
            followUser={followUser}
            unfollowUser={unfollowUser}
            onClose={() => setViewProfile(null)}
            C={C}
          />
        )}
        {toast && <Toast message={toast} onDone={() => setToast(null)} C={C} />}
      </div>
    </div>
  );
}

// ─── SECTION KICKER ──────────────────────────────────────────────────────────
function SectionKicker({ label, C }: any) {
  return (
    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 500 }}>
      {label}
    </div>
  );
}

// ─── HOME SECTION TABS ───────────────────────────────────────────────────────
// Replaces the emoji-dropdown with editorial mono text tabs.
function HomeSectionTabs({ homeSection, setHomeSection, C }: any) {
  const SECTIONS = [
    { id: "feed", label: "Overview" },
    { id: "analytics", label: "Analytics" },
    { id: "ai", label: "Insights" },
    { id: "rules", label: "Rules" },
  ];
  return (
    <div style={{ display: "flex", gap: "22px", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: "10px", overflowX: "auto", flexWrap: "wrap" }}>
      {SECTIONS.map(s => (
        <button key={s.id} onClick={() => setHomeSection(s.id)}
          style={{ background: "none", border: "none", padding: 0, color: homeSection === s.id ? C.text : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: homeSection === s.id ? `1px solid ${C.text}` : "1px solid transparent", paddingBottom: "4px", marginBottom: "-11px", whiteSpace: "nowrap" }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ─── CONFLUENCE TRACKER (editorial) ──────────────────────────────────────────
function ConfluenceTracker({ checkItems, checkedCount, totalItems, isChecked, activeStrategy, C, stratThresholds, saveStratThresholds, inp, pillGhost }: any) {
  const [editMode, setEditMode] = useState(false);
  const thresh = stratThresholds[activeStrategy] || { minCount: Math.ceil(totalItems * 0.75), required: [] };
  const minCount = thresh.minCount || 1;
  const required = thresh.required || [];

  const reqMet = required.every((id: any) => isChecked(id));
  const countMet = checkedCount >= minCount;
  const greenLight = reqMet && countMet;
  const pct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;

  const statusCol = greenLight ? C.green : countMet && !reqMet ? C.text2 : C.red;
  const statusText = greenLight ? "CLEAR TO ENTER" : (!countMet) ? `NEED ${minCount - checkedCount} MORE` : "REQUIRED CONFLUENCE MISSING";

  function toggleRequired(id: any) {
    const updated = required.includes(id) ? required.filter((r: any) => r !== id) : [...required, id];
    const u = { ...stratThresholds, [activeStrategy]: { ...thresh, required: updated } };
    saveStratThresholds(u);
  }
  function setMin(val: any) {
    const v = Math.max(1, Math.min(totalItems, parseInt(val) || 1));
    const u = { ...stratThresholds, [activeStrategy]: { ...thresh, minCount: v } };
    saveStratThresholds(u);
  }

  return (
    <div>
      {/* Score — editorial, no card */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "20px 0", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>CONFLUENCE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontFamily: DISPLAY, fontSize: "40px", fontWeight: 700, color: C.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{checkedCount}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: "18px", color: C.muted, fontWeight: 500 }}>/ {totalItems}</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "6px", letterSpacing: "0.06em" }}>Min required: <span style={{ color: C.text }}>{minCount}</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: statusCol, letterSpacing: "0.1em", maxWidth: "160px", lineHeight: 1.4 }}>{statusText}</div>
          </div>
        </div>
        {/* Progress bar — 1px hairline */}
        <div style={{ position: "relative", background: C.border, height: "1px", width: "100%" }}>
          <div style={{ background: statusCol, height: "1px", width: `${pct}%`, transition: "width 0.35s ease" }} />
          <div style={{ position: "absolute", top: "-3px", bottom: "-3px", left: `${Math.round((minCount / totalItems) * 100)}%`, width: "1px", background: C.text }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.04em" }}>
          <span>{pct}% MET</span>
          <span>THRESHOLD {Math.round((minCount / totalItems) * 100)}%</span>
        </div>
        {required.length > 0 && (
          <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "8px" }}>MUST-HAVES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.04em" }}>
              {required.map((rid: any) => {
                const item = checkItems.find((i: any) => i.id === rid);
                if (!item) return null;
                const met = isChecked(rid);
                return (
                  <span key={rid} style={{ color: met ? C.green : C.red }}>
                    {met ? "✓" : "✕"} {stratShort(item.text)}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={() => setEditMode(!editMode)} style={{ ...pillGhost, marginTop: "16px", width: "100%" }}>
          {editMode ? "CLOSE SETTINGS" : "ENTRY RULE SETTINGS"}
        </button>
      </div>

      {editMode && (
        <div style={{ padding: "4px 0 20px", marginBottom: "4px" }}>
          <SectionKicker label={`ENTRY RULES — ${stratShort(activeStrategy).toUpperCase()}`} C={C} />
          <div style={{ marginTop: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", alignItems: "baseline" }}>
              <label style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>Minimum confluences to enter</label>
              <span style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{minCount} / {totalItems}</span>
            </div>
            <input type="range" min={1} max={totalItems} value={minCount} onChange={e => setMin(e.target.value)}
              style={{ width: "100%", accentColor: C.text, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.06em" }}>
              <span>1 LENIENT</span>
              <span>{totalItems} STRICT</span>
            </div>
          </div>
          <div style={{ marginTop: "24px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "8px" }}>MARK AS REQUIRED</div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginBottom: "14px", lineHeight: 1.55 }}>
              Toggle any confluence as required — the clear-to-enter signal only fires if these are checked, regardless of minimum count.
            </div>
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {checkItems.map((item: any) => {
                const isReq = required.includes(item.id);
                return (
                  <div key={item.id} onClick={() => toggleRequired(item.id)}
                    style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `1px solid ${isReq ? C.text : C.border2}`, background: isReq ? C.text : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isReq && <span style={{ color: C.bg, fontSize: "9px", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontFamily: BODY, fontSize: "13px", color: isReq ? C.text : C.text2, flex: 1, lineHeight: 1.5 }}>{item.text}</span>
                    <span style={{ fontFamily: MONO, fontSize: "10px", color: isReq ? C.text : C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{isReq ? "Required" : "Optional"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE (self) ──────────────────────────────────────────────────────────
// Editorial self-profile page. Shows identity, core stats, follow counts,
// friends chips (mutual follows), and circle memberships split public/private.
// Private circles only expose name + my rank — no member list, no stats.
function ProfileView({ profile, myCode, followers, following, friendCodes, myCircles, followUser, unfollowUser, wins, losses, total, winRate, totalPnL, pnlPos, avgRR, streak, showToast, C, pillGhost, pillPrimary, setView, setActiveCircle, setCirclesView }: any) {
  // Clickable follow/following/friends lists. Null = no list open.
  const [followList, setFollowList] = useState<null | "followers" | "following" | "friends">(null);

  // Rough rank within each circle based on locally-cached members. Shared sync
  // keeps this reasonably fresh. If a circle has no members list (just created
  // solo), rank defaults to 1 of 1.
  function myRankIn(circle: any) {
    const members = circle.members || [];
    const idx = members.findIndex((m: any) => m.code === myCode);
    return { rank: idx >= 0 ? idx + 1 : 1, of: Math.max(members.length, 1) };
  }
  const publicCircles = myCircles.filter((c: any) => (c.privacy || "public") === "public");
  const privateCircles = myCircles.filter((c: any) => c.privacy === "private");

  const activeCodes: string[] =
    followList === "followers" ? followers :
    followList === "following" ? following :
    followList === "friends" ? friendCodes : [];

  function openCircle(circle: any) {
    setActiveCircle(circle);
    setCirclesView("detail");
    setView("circles");
  }

  return (
    <div style={{ marginTop: "clamp(16px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: "clamp(28px, 4vw, 44px)" }}>
      {/* ── Header: avatar, name, handle, invite code ── */}
      <section style={{ display: "flex", alignItems: "flex-start", gap: "18px", flexWrap: "wrap" }}>
        <AvatarCircle name={profile.name || "Trader"} avatar={profile.avatar} size={72} C={C} />
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 7vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, color: C.text, margin: 0 }}>
            {profile.name || "Trader"}
          </h1>
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", marginTop: "8px", textTransform: "lowercase", display: "flex", alignItems: "center", gap: "6px" }}>
            {profile.handle || "@trader"}
            {(profile.plan === "pro" || profile.plan === "elite") && (
              <CrownIcon size={12} color={C.text} />
            )}
          </div>
          {profile.bio && (
            <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.6, marginTop: "12px", maxWidth: "48ch" }}>{profile.bio}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>CODE</div>
            <div style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.1em" }}>{myCode}</div>
            <button onClick={() => { navigator.clipboard?.writeText(myCode); showToast("Code copied"); }}
              style={{ ...pillGhost, padding: "4px 10px", fontSize: "9px" }}>COPY</button>
            <button onClick={() => {
              const handle = (profile.handle ?? "").replace(/^@/, "");
              navigator.clipboard?.writeText(`https://tradrjournal.xyz/@${handle}`).then(() => showToast("Profile link copied!"));
            }} style={{ ...pillGhost, padding: "4px 10px", fontSize: "9px" }}>SHARE PROFILE</button>
          </div>
        </div>
      </section>

      {/* ── Social counts: clickable → expand to list below ── */}
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
          {([
            ["FOLLOWERS", followers.length, "followers"],
            ["FOLLOWING", following.length, "following"],
            ["FRIENDS", friendCodes.length, "friends"],
          ] as [string, number, "followers" | "following" | "friends"][]).map(([k, v, id], i) => {
            const open = followList === id;
            return (
              <button key={k} onClick={() => setFollowList(open ? null : id)}
                style={{ padding: "18px 14px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}`, background: open ? C.panel : "transparent", border: "none", borderTop: "none", borderRight: "none", borderBottom: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: open ? C.text : C.muted, letterSpacing: "0.14em", marginBottom: "8px" }}>{k}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: "28px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
              </button>
            );
          })}
        </div>
        {followList && (
          <div style={{ padding: "16px 0 4px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em" }}>
                {followList === "followers" ? `FOLLOWERS · ${followers.length}` : followList === "following" ? `FOLLOWING · ${following.length}` : `FRIENDS · ${friendCodes.length}`}
              </div>
              <button onClick={() => setFollowList(null)} style={{ background: "none", border: "none", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>Close</button>
            </div>
            {activeCodes.length === 0 ? (
              <div style={{ fontFamily: BODY, fontStyle: "italic", fontSize: "13px", color: C.muted, lineHeight: 1.6, padding: "8px 0" }}>
                {followList === "followers" && "Nobody's following you yet."}
                {followList === "following" && "You're not following anyone yet — tap Follow on a circle leaderboard."}
                {followList === "friends" && "No mutual follows yet. Friends are traders who follow you back."}
              </div>
            ) : (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {activeCodes.map((code: string) => {
                  const iFollow = following.includes(code);
                  const followsMe = followers.includes(code);
                  const isMutual = iFollow && followsMe;
                  return (
                    <div key={code} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                      <AvatarCircle name={code.split("-")[0]} size={28} C={C} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: DISPLAY, fontSize: "15px", color: C.text, letterSpacing: "-0.01em", fontWeight: 500 }}>{code.split("-")[0]}</div>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.08em", marginTop: "2px", textTransform: "uppercase" }}>
                          {isMutual ? "FRIENDS · MUTUAL" : iFollow ? "YOU FOLLOW" : followsMe ? "FOLLOWS YOU" : ""}
                        </div>
                      </div>
                      {iFollow ? (
                        <button onClick={() => unfollowUser(code)}
                          style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "5px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                          {isMutual ? "Unfriend" : "Unfollow"}
                        </button>
                      ) : (
                        <button onClick={() => followUser(code)}
                          style={{ background: C.text, color: C.bg, border: `1px solid ${C.text}`, borderRadius: "999px", padding: "5px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                          {followsMe ? "Follow back" : "Follow"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Core stats ── */}
      <section>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>SNAPSHOT</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
          {[
            ["W/L", `${wins}/${losses}`],
            ["WIN RATE", total > 0 ? `${winRate}%` : "—"],
            ["P&L", total > 0 ? `${pnlPos ? "+" : ""}${totalPnL}R` : "—"],
            ["AVG R:R", avgRR === "—" ? "—" : `${avgRR}R`],
          ].map(([k, v], i) => (
            <div key={k as string} style={{ padding: "16px 12px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "6px" }}>{k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>{v}</div>
            </div>
          ))}
        </div>
        {streak.count >= 2 && (
          <div style={{ fontFamily: MONO, fontSize: "10px", color: streak.type === "Win" ? C.green : C.red, letterSpacing: "0.1em", marginTop: "14px", textTransform: "uppercase" }}>
            {streak.count}{streak.type === "Win" ? "W" : "L"} STREAK
          </div>
        )}
      </section>

      {/* ── Friends (mutual) ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>FRIENDS · {friendCodes.length}</div>
        {friendCodes.length === 0 ? (
          <div style={{ fontFamily: BODY, fontStyle: "italic", fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>
            No mutual follows yet. Follow traders in your circles — once they follow back, they show up here.
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {friendCodes.map((code: string) => (
              <div key={code} style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px" }}>
                <AvatarCircle name={code.split("-")[0]} size={20} C={C} />
                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.text, letterSpacing: "0.06em" }}>{code.split("-")[0]}</span>
                <button onClick={() => unfollowUser(code)} style={{ background: "none", border: "none", color: C.dim, fontSize: "10px", cursor: "pointer", fontFamily: MONO, padding: 0, marginLeft: "2px" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Public circles ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>PUBLIC CIRCLES · {publicCircles.length}</div>
        {publicCircles.length === 0 ? (
          <div style={{ fontFamily: BODY, fontStyle: "italic", fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>
            Not in any public circles yet.
          </div>
        ) : (
          <div>
            {publicCircles.map((c: any) => {
              const { rank, of } = myRankIn(c);
              return (
                <div key={c.code} onClick={() => openCircle(c)}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{c.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "3px", textTransform: "uppercase" }}>
                      {c.strategy ? `${c.strategy} · ` : ""}{of} members · {c.code}
                    </div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                    #{rank} <span style={{ color: C.muted }}>of {of}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Private circles (name + rank only) ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>PRIVATE CIRCLES · {privateCircles.length}</div>
        {privateCircles.length === 0 ? (
          <div style={{ fontFamily: BODY, fontStyle: "italic", fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>
            No private circles.
          </div>
        ) : (
          <div>
            {privateCircles.map((c: any) => {
              const { rank, of } = myRankIn(c);
              return (
                <div key={c.code} onClick={() => openCircle(c)}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{c.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                    #{rank} <span style={{ color: C.muted }}>of {of}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ paddingTop: "8px", paddingBottom: "40px" }}>
        <button onClick={() => setView("home")} style={{ ...pillGhost, padding: "10px 18px" }}>
          Edit profile in Settings →
        </button>
      </section>
    </div>
  );
}

// ─── ONBOARDING FLOW ──────────────────────────────────────────────────────────

const ONBOARDING_STEPS = ["welcome", "about", "instruments", "strategy", "ready"] as const;
type OnboardingStep = typeof ONBOARDING_STEPS[number];

const AVATAR_EMOJIS = [
  "🎯","🦁","🐂","🦅","⚡","🔥","💎","🏆",
  "🦈","🧠","🎲","👑","🐺","🦊","🤖","⚔️",
  "🌊","🏔️","🎭","⭐","💰","🪄","🛡️","🎪",
];

const FUTURES_INSTRUMENTS = [
  { code: "ES",  label: "E-mini S&P 500"  },
  { code: "NQ",  label: "E-mini Nasdaq"   },
  { code: "MES", label: "Micro S&P 500"   },
  { code: "MNQ", label: "Micro Nasdaq"    },
  { code: "YM",  label: "E-mini Dow"      },
  { code: "RTY", label: "E-mini Russell"  },
  { code: "CL",  label: "Crude Oil"       },
  { code: "GC",  label: "Gold"            },
  { code: "SI",  label: "Silver"          },
  { code: "NG",  label: "Natural Gas"     },
  { code: "ZB",  label: "T-Bond"          },
  { code: "6E",  label: "Euro FX"         },
];

interface OnboardingData {
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  twitter: string;
  instruments: string[];
  strategy: string;
}

// ─── STRIPE SETUP GUIDE ────────────────────────────────────────────────────────

function OnboardingFlow({ C, allStrategyNames, onComplete }: {
  C: any;
  allStrategyNames: string[];
  onComplete: (data: OnboardingData) => Promise<void>;
}) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [strategy, setStrategy] = useState("");
  const [customStrategy, setCustomStrategy] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameErr, setNameErr] = useState("");

  function onNameChange(v: string) {
    setName(v);
    setNameErr("");
    if (!handleEdited) {
      const slug = v.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_]/g, "");
      setHandle(slug ? `@${slug}` : "");
    }
  }

  function onHandleChange(v: string) {
    setHandleEdited(true);
    const raw = v.startsWith("@") ? v.slice(1) : v;
    const clean = raw.replace(/[^a-z0-9_.]/gi, "").toLowerCase();
    setHandle(clean ? `@${clean}` : "");
  }

  function toggleInstrument(code: string) {
    setInstruments(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  function goNext() {
    if (stepIndex < ONBOARDING_STEPS.length - 1) setStep(ONBOARDING_STEPS[stepIndex + 1]);
  }
  function goBack() {
    if (stepIndex > 0) setStep(ONBOARDING_STEPS[stepIndex - 1]);
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    const finalStrategy = showCustom ? customStrategy.trim() : strategy;
    await onComplete({ name, handle, avatar, bio, twitter, instruments, strategy: finalStrategy });
    setSaving(false);
  }

  const inp: React.CSSProperties = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${C.border2}`, borderRadius: 0,
    color: C.text, padding: "14px 0", fontSize: "16px",
    fontFamily: BODY, width: "100%", outline: "none", minHeight: "44px",
  };
  const pillPrimary = (active: boolean): React.CSSProperties => ({
    background: active ? C.text : C.border2, color: active ? C.bg : C.muted,
    border: "none", borderRadius: "999px", padding: "16px 32px",
    fontSize: "14px", fontWeight: 500, cursor: active ? "pointer" : "default",
    fontFamily: BODY, letterSpacing: "0.01em",
    width: "100%", transition: "background 0.15s", minHeight: "44px",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  const MonoLbl = ({ children, optional }: { children: string; optional?: boolean }) => (
    <label style={{
      fontFamily: MONO, fontSize: "10px", color: C.muted,
      letterSpacing: "0.14em", textTransform: "uppercase" as const,
      display: "block", marginBottom: "8px",
    }}>
      {children}{optional && <span style={{ color: C.dim, fontSize: "9px", marginLeft: "6px" }}>optional</span>}
    </label>
  );

  const StepBadge = ({ n }: { n: number }) => (
    <div style={{
      fontFamily: MONO, fontSize: "10px", color: C.muted,
      letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: "16px",
    }}>
      — Step {n} of {ONBOARDING_STEPS.length}
    </div>
  );

  const Heading = ({ line1, line2 }: { line1: string; line2: string }) => (
    <h1 style={{
      fontFamily: DISPLAY, fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
      letterSpacing: "-0.03em", lineHeight: 1.05, color: C.text, marginBottom: "12px",
    }}>
      {line1}<br />
      <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>{line2}</span>
    </h1>
  );

  return (
    <div style={{
      minHeight: "100dvh", background: C.bg, color: C.text,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px", fontFamily: BODY,
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "48px" }}>
          <TrMark size={28} bg={C.panel} />
          <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 700, letterSpacing: "-0.02em", color: C.text, lineHeight: 1 }}>TRADR</span>
        </div>

        {/* Progress indicator */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "44px" }}>
          {ONBOARDING_STEPS.map((s, i) => (
            <div key={s} style={{
              height: "2px", flex: 1, borderRadius: "1px",
              background: stepIndex >= i ? C.text : C.border,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        {/* ── STEP 1: Name + handle + avatar ── */}
        {step === "welcome" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={1} />
            <Heading line1="Let's set up" line2="your profile." />
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "28px" }}>
              This is how other traders see you on leaderboards and in circles.
            </p>

            {/* Emoji avatar picker */}
            <div style={{ marginBottom: "28px" }}>
              <MonoLbl optional>Pick an avatar</MonoLbl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {AVATAR_EMOJIS.map(e => (
                  <button key={e} onClick={() => setAvatar(avatar === e ? "" : e)} style={{
                    width: "42px", height: "42px", borderRadius: "50%",
                    border: `1.5px solid ${avatar === e ? C.text : C.border}`,
                    background: avatar === e ? C.panel : "transparent",
                    cursor: "pointer", fontSize: "20px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "border-color 0.15s, background 0.15s",
                  }}>{e}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "32px" }}>
              <div>
                <MonoLbl>Your name</MonoLbl>
                <input
                  value={name} onChange={e => onNameChange(e.target.value)}
                  placeholder="e.g. Dylon" style={inp} autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) goNext(); }}
                />
                {nameErr && <div style={{ fontSize: "12px", color: C.red, marginTop: "6px" }}>{nameErr}</div>}
              </div>
              <div>
                <MonoLbl optional>Handle</MonoLbl>
                <input
                  value={handle} onChange={e => onHandleChange(e.target.value)}
                  placeholder="@yourhandle" style={inp}
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) goNext(); }}
                />
              </div>
            </div>

            <button onClick={() => { if (!name.trim()) { setNameErr("Name is required."); return; } goNext(); }} style={pillPrimary(!!name.trim())}>
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: About yourself ── */}
        {step === "about" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={2} />
            <Heading line1="Tell us about" line2="yourself." />
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "28px" }}>
              Optional — shows on your public profile. You can always update it later.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginBottom: "32px" }}>
              <div>
                <MonoLbl optional>Bio</MonoLbl>
                <textarea
                  value={bio} onChange={e => setBio(e.target.value)}
                  placeholder="Multi-strategy trader | Consistency over everything"
                  rows={3}
                  style={{ ...inp, resize: "none", lineHeight: 1.6 }}
                />
              </div>
              <div>
                <MonoLbl optional>X / Twitter</MonoLbl>
                <input
                  value={twitter} onChange={e => setTwitter(e.target.value.replace(/^@+/, ""))}
                  placeholder="@handle" style={inp}
                  onKeyDown={e => { if (e.key === "Enter") goNext(); }}
                />
              </div>
            </div>

            <button onClick={goNext} style={pillPrimary(true)}>
              {bio.trim() || twitter.trim() ? "Continue →" : "Skip →"}
            </button>
          </div>
        )}

        {/* ── STEP 3: Instruments ── */}
        {step === "instruments" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={3} />
            <Heading line1="What futures do" line2="you trade?" />
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "24px" }}>
              Select all that apply. More markets coming soon.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "32px" }}>
              {FUTURES_INSTRUMENTS.map(({ code, label }) => {
                const active = instruments.includes(code);
                return (
                  <button key={code} onClick={() => toggleInstrument(code)} style={{
                    background: active ? C.text : "transparent",
                    color: active ? C.bg : C.text2,
                    border: `1px solid ${active ? C.text : C.border2}`,
                    borderRadius: "8px", padding: "8px 14px",
                    cursor: "pointer", transition: "all 0.15s",
                    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em" }}>{code}</span>
                    <span style={{ fontFamily: BODY, fontSize: "10px", opacity: 0.7 }}>{label}</span>
                  </button>
                );
              })}
            </div>

            <button onClick={goNext} style={pillPrimary(true)}>
              {instruments.length === 0 ? "Skip →" : `Continue with ${instruments.length} selected →`}
            </button>
          </div>
        )}

        {/* ── STEP 4: Strategy ── */}
        {step === "strategy" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={4} />
            <Heading line1="What's your" line2="main strategy?" />
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "24px" }}>
              We'll pre-load your checklist and rules. Add more strategies later.
            </p>

            <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${C.border}`, marginBottom: "32px" }}>
              {allStrategyNames.map((s: string) => (
                <div key={s} onClick={() => { setStrategy(strategy === s ? "" : s); setShowCustom(false); }} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "15px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                }}>
                  <span style={{
                    fontFamily: BODY, fontSize: "14px",
                    color: strategy === s ? C.text : C.text2, fontWeight: strategy === s ? 500 : 400,
                  }}>{s}</span>
                  <div style={{
                    width: "18px", height: "18px", borderRadius: "50%",
                    border: `1px solid ${strategy === s ? C.text : C.border2}`,
                    background: strategy === s ? C.text : "transparent",
                    flexShrink: 0, transition: "all 0.15s",
                  }} />
                </div>
              ))}

              {/* Custom strategy */}
              <div onClick={() => { setShowCustom(true); setStrategy(""); }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "15px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
              }}>
                <span style={{
                  fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: showCustom ? C.text : C.muted, fontWeight: showCustom ? 500 : 400,
                }}>Custom strategy…</span>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  border: `1px solid ${showCustom ? C.text : C.border2}`,
                  background: showCustom ? C.text : "transparent",
                  flexShrink: 0, transition: "all 0.15s",
                }} />
              </div>

              {showCustom && (
                <div style={{ padding: "10px 0 2px" }}>
                  <input
                    value={customStrategy} onChange={e => setCustomStrategy(e.target.value)}
                    placeholder="e.g. Breakout Momentum"
                    style={{ ...inp, fontSize: "14px" }} autoFocus
                    onKeyDown={e => { if (e.key === "Enter" && customStrategy.trim()) goNext(); }}
                  />
                </div>
              )}

              {/* Skip option */}
              <div onClick={() => { setStrategy(""); setShowCustom(false); setCustomStrategy(""); }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "15px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
              }}>
                <span style={{
                  fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: !strategy && !showCustom ? C.text : C.muted,
                  fontWeight: !strategy && !showCustom ? 500 : 400,
                }}>I'll decide later</span>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  border: `1px solid ${!strategy && !showCustom ? C.text : C.border2}`,
                  background: !strategy && !showCustom ? C.text : "transparent",
                  flexShrink: 0, transition: "all 0.15s",
                }} />
              </div>
            </div>

            <button
              onClick={() => { if (showCustom && !customStrategy.trim()) return; goNext(); }}
              style={pillPrimary(!showCustom || !!customStrategy.trim())}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 5: Ready ── */}
        {step === "ready" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={5} />
            <h1 style={{
              fontFamily: DISPLAY, fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.05, color: C.text, marginBottom: "16px",
            }}>
              You're in,<br />
              <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>{name || "trader"}.</span>
            </h1>
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "32px" }}>
              Your edge is built one trade at a time. Log your first trade — the stats follow automatically.
            </p>

            {/* Summary */}
            <div style={{
              borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
              padding: "18px 0", marginBottom: "28px",
              display: "flex", flexDirection: "column", gap: "12px",
            }}>
              {avatar && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Avatar</span>
                  <span style={{ fontSize: "22px" }}>{avatar}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Name</span>
                <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text }}>{name}</span>
              </div>
              {handle && handle !== "@" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Handle</span>
                  <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text }}>{handle}</span>
                </div>
              )}
              {instruments.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Markets</span>
                  <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text }}>{instruments.join(", ")}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Strategy</span>
                <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text }}>
                  {showCustom ? (customStrategy || "Custom") : (strategy || "Not set")}
                </span>
              </div>
            </div>

            <button onClick={finish} disabled={saving} style={pillPrimary(!saving)}>
              {saving ? "Setting up…" : "Log my first trade →"}
            </button>
          </div>
        )}

        {/* Back link */}
        {step !== "welcome" && (
          <button onClick={goBack} style={{
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: "12px", fontFamily: MONO,
            letterSpacing: "0.1em", textTransform: "uppercase",
            marginTop: "20px", padding: "8px 0",
          }}>
            ← Back
          </button>
        )}

      </div>

      <style>{`@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ─── TRADING CIRCLES (editorial) ─────────────────────────────────────────────
function TradingCircles({ myCircles, circlesView, setCirclesView, activeCircle, setActiveCircle, circleForm, setCircleForm, circleJoinCode, setCircleJoinCode, circleMsg, setCircleMsg, createCircle, joinCircle, publishToCircle, fetchCircleLeaderboard, profile, getMyCode, showToast, wins, losses, total, winRate, totalPnL, pnlPos, weekPnL, weekPnLPos, weekPnLStr, avgRR, streak, STRATEGY_NAMES, C, inp, sel, lbl, pillPrimary, pillGhost, following, followUser, unfollowUser, kickMember, leaveCircle, openProfile, isJoiningCircle, isCreatingCircle, totalPnlDollar, hasDollarData }: any) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lbSort, setLbSort] = useState<"all" | "week">("all");
  const [loadingLB, setLoadingLB] = useState(false);
  const [circleTab, setCircleTab] = useState<"leaderboard" | "chat" | "members">("leaderboard");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const CIRCLE_EMOJIS = ["◆","▲","●","■","⬡","◈","△","○","□","✦"];
  const MEDALS = ["🥇","🥈","🥉"];

  // Returns the primary metric label + formatted value for a leaderboard entry
  function metricDisplay(entry: any, circle: any): { val: string; raw: number; label: string } {
    const m = circle?.metric || "dollar";
    if (m === "dollar") { const v = entry.totalPnLDollar || 0; return { val: `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`, raw: v, label: "$ P&L" }; }
    if (m === "r")       { const v = entry.totalPnL || 0; return { val: `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`, raw: v, label: "R P&L" }; }
    if (m === "winrate") { const v = entry.winRate || 0; return { val: `${v.toFixed(0)}%`, raw: v, label: "WIN RATE" }; }
    if (m === "trades")  { const v = entry.total || 0; return { val: `${v}`, raw: v, label: "TRADES" }; }
    if (m === "avgr")    { const v = entry.avgRR || 0; return { val: `${v.toFixed(2)}R`, raw: v, label: "AVG R" }; }
    const v = entry.totalPnLDollar || 0; return { val: `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`, raw: v, label: "$ P&L" };
  }

  // Label for the circle's competition metric
  const METRIC_LABELS: Record<string, string> = { dollar: "$ DOLLAR P&L", r: "R-MULTIPLE", winrate: "WIN RATE", trades: "MOST TRADES", avgr: "AVG R" };

  async function loadChatMessages(circleCode: string) {
    setChatLoading(true);
    try {
      const { data } = await supabase
        .from("circle_messages")
        .select("*")
        .eq("circle_code", circleCode)
        .order("created_at", { ascending: true })
        .limit(100);
      setChatMessages(data || []);
    } catch {}
    setChatLoading(false);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function sendChatMessage(circleCode: string, myId: string) {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    setChatInput("");
    try {
      await supabase.from("circle_messages").insert({
        circle_code: circleCode,
        sender_id: myId,
        sender_name: profile.name || "Trader",
        sender_handle: profile.handle || "",
        text,
      });
    } catch { setChatInput(text); }
    setChatSending(false);
  }

  async function deleteChatMessage(id: string) {
    await supabase.from("circle_messages").delete().eq("id", id);
    setChatMessages(prev => prev.filter((m: any) => m.id !== id));
  }

  function fmtMsgTime(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function openCircle(circle: any) {
    setActiveCircle(circle);
    setCirclesView("detail");
    setExpandedMember(null);
    setCircleTab("leaderboard");
    setChatMessages([]);
    setChatInput("");
    setLoadingLB(true);
    const entries = await fetchCircleLeaderboard(circle);
    setLeaderboard(entries);
    setLoadingLB(false);
  }

  useEffect(() => {
    if (circlesView !== "detail" || !activeCircle) return;
    let alive = true;
    async function refresh() {
      try {
        const entries = await fetchCircleLeaderboard(activeCircle);
        if (alive) setLeaderboard(entries);
      } catch {}
    }
    const id = setInterval(refresh, 120_000);
    let unsub = () => {};
    try { unsub = subscribeToCircle(activeCircle.code, () => { refresh(); }); } catch {}
    const chatChannel = supabase
      .channel(`circle_chat_${activeCircle.code}`)
      .on("postgres_changes" as any, {
        event: "INSERT", schema: "public",
        table: "circle_messages",
        filter: `circle_code=eq.${activeCircle.code}`,
      }, (payload: any) => {
        setChatMessages(prev => prev.some((m: any) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .subscribe();
    return () => {
      alive = false; clearInterval(id);
      try { unsub(); } catch {}
      supabase.removeChannel(chatChannel);
    };
  }, [circlesView, activeCircle, fetchCircleLeaderboard]);

  // ── Derived circle stats ──────────────────────────────────────────────
  const myRank = leaderboard.findIndex((e: any) => e.memberCode === getMyCode()) + 1;
  const leader = leaderboard[0];
  const circleAvgWR = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((s: number, e: any) => s + (e.winRate || 0), 0) / leaderboard.length)
    : 0;
  const circleTotalTrades = leaderboard.reduce((s: number, e: any) => s + (e.total || 0), 0);

  function shareInviteLink(circle: any) {
    const url = `https://tradrjournal.xyz/?join=${circle.code}`;
    const msg = `Join my TRADR circle "${circle.name}" → ${url}`;
    if (navigator.share) {
      navigator.share({ title: "Join my TRADR circle", text: msg, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      showToast("Invite link copied");
    }
  }

  return (
    <div style={{ marginTop: "clamp(16px, 4vw, 28px)" }}>

      {/* ── BROWSE ── */}
      {circlesView === "browse" && (
        <>
          <section>
            <SectionKicker label="COMPETE. CONNECT. COMPARE." C={C} />
            <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(44px, 11vw, 68px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.95, color: C.text, marginTop: "20px", marginBottom: "28px" }}>
              Your <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>circles</span>.
            </h1>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={() => setCirclesView("create")} style={{ ...pillPrimary(true), width: "auto", padding: "12px 20px" }}>+ Create circle</button>
              <button onClick={() => setCirclesView("join")} style={{ ...pillGhost, padding: "12px 20px" }}>⤵ JOIN CIRCLE</button>
            </div>
          </section>

          {myCircles.length > 0 ? (
            <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
              <SectionKicker label={`MY CIRCLES · ${myCircles.length}`} C={C} />
              <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {myCircles.map((circle: any) => (
                  <div key={circle.id} className="row-hvr" onClick={() => openCircle(circle)}
                    style={{ padding: "20px", background: C.panel, borderRadius: "14px", cursor: "pointer", border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                      {/* Symbol mark */}
                      <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "22px", color: C.text2, flexShrink: 0, border: `1px solid ${C.border2}` }}>
                        {circle.emoji || "◆"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{circle.name}</span>
                          <span style={{ fontFamily: MONO, fontSize: "18px", color: C.muted, flexShrink: 0 }}>›</span>
                        </div>
                        {circle.description && <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.5, marginBottom: "10px" }}>{circle.description}</div>}
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                          <span>{circle.members?.length || 1} members</span>
                          {circle.strategy && <span>{stratCode(circle.strategy)}</span>}
                          <span style={{ color: circle.privacy === "public" ? C.green : C.muted }}>{circle.privacy === "public" ? "● PUBLIC" : "◐ PRIVATE"}</span>
                          {circle.isOwner && <span style={{ color: C.text2 }}>OWNER</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section style={{ marginTop: "clamp(40px, 6vw, 56px)", padding: "48px 24px", background: C.panel, borderRadius: "16px", textAlign: "center", border: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: "32px", color: C.border2, marginBottom: "16px", letterSpacing: "-0.02em" }}>◆</div>
              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontStyle: "italic", fontWeight: 500, color: C.text2, letterSpacing: "-0.01em", marginBottom: "8px" }}>No circles yet.</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>Create one or join with a code from a friend.</div>
            </section>
          )}
        </>
      )}

      {/* ── CREATE ── */}
      {circlesView === "create" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setCirclesView("browse")} style={{ ...pillGhost, padding: "8px 14px" }}>‹ BACK</button>
            <SectionKicker label="CREATE A CIRCLE" C={C} />
          </div>
          <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 7vw, 44px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: C.text, marginTop: "8px" }}>
            Start <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>something small</span>.
          </h2>
          {/* Symbol picker */}
          <div>
            <label style={lbl}>Symbol</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              {CIRCLE_EMOJIS.map(em => {
                const active = (circleForm.emoji || "◆") === em;
                return (
                  <button key={em} onClick={() => setCircleForm((f: any) => ({ ...f, emoji: em }))}
                    style={{ width: "36px", height: "36px", borderRadius: "8px", fontSize: "16px", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: active ? C.text : "transparent", color: active ? C.bg : C.muted, border: `1px solid ${active ? C.text : C.border2}`, transition: "all 100ms", lineHeight: 1 }}>
                    {em}
                  </button>
                );
              })}
            </div>
          </div>
          <div><label style={lbl}>Circle name</label><input value={circleForm.name} onChange={e => setCircleForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. London ICT Traders" style={inp} /></div>
          <div><label style={lbl}>Description (optional)</label><textarea value={circleForm.description} onChange={e => setCircleForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="What's this circle about?" rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
          <div>
            <label style={lbl}>Strategy focus (optional)</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              <button onClick={() => setCircleForm((f: any) => ({ ...f, strategy: "" }))}
                style={{ background: circleForm.strategy === "" ? C.text : "transparent", border: `1px solid ${circleForm.strategy === "" ? C.text : C.border2}`, borderRadius: "999px", padding: "7px 13px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em", color: circleForm.strategy === "" ? C.bg : C.muted, textTransform: "uppercase" }}>
                Any
              </button>
              {STRATEGY_NAMES.map((s: string) => (
                <StrategyPill key={s} name={s} selected={circleForm.strategy === s} onClick={() => setCircleForm((f: any) => ({ ...f, strategy: s }))} C={C} />
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Privacy</label>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {[["public", "● Public"], ["private", "◐ Private"]].map(([val, label]) => (
                <button key={val} onClick={() => setCircleForm((f: any) => ({ ...f, privacy: val }))}
                  style={{ background: circleForm.privacy === val ? C.text : "transparent", border: `1px solid ${circleForm.privacy === val ? C.text : C.border2}`, borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", color: circleForm.privacy === val ? C.bg : C.text, textTransform: "uppercase" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: 1.55 }}>
              {circleForm.privacy === "public" ? "Anyone with the invite code can join." : "Invite only — you share the code."}
            </div>
          </div>
          {/* Competition metric */}
          <div>
            <label style={lbl}>Competition metric</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              {([
                ["dollar", "$ Dollar P&L"],
                ["r",      "R-Multiple"],
                ["winrate","Win Rate"],
                ["trades", "Most Trades"],
                ["avgr",   "Avg R"],
              ] as const).map(([val, label]) => (
                <button key={val} onClick={() => setCircleForm((f: any) => ({ ...f, metric: val }))}
                  style={{ background: (circleForm.metric || "dollar") === val ? C.text : "transparent", border: `1px solid ${(circleForm.metric || "dollar") === val ? C.text : C.border2}`, borderRadius: "999px", padding: "7px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: (circleForm.metric || "dollar") === val ? C.bg : C.muted, textTransform: "uppercase", transition: "all 100ms" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "8px", lineHeight: 1.55 }}>
              {{
                dollar:  "Leaderboard ranks by total dollar P&L.",
                r:       "Leaderboard ranks by total R gained/lost.",
                winrate: "Leaderboard ranks by win percentage.",
                trades:  "Leaderboard ranks by number of trades logged.",
                avgr:    "Leaderboard ranks by average R per trade.",
              }[circleForm.metric as string] || "Leaderboard ranks by total dollar P&L."}
            </div>
          </div>
          <button onClick={createCircle} disabled={isCreatingCircle || !circleForm.name.trim()} style={{ ...pillPrimary(!!circleForm.name.trim() && !isCreatingCircle), marginTop: "8px" }}>
            {isCreatingCircle ? "Creating…" : "Create circle →"}
          </button>
        </div>
      )}

      {/* ── JOIN ── */}
      {circlesView === "join" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setCirclesView("browse")} style={{ ...pillGhost, padding: "8px 14px" }}>‹ BACK</button>
            <SectionKicker label="JOIN A CIRCLE" C={C} />
          </div>
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontFamily: MONO, fontSize: "28px", color: C.muted, marginBottom: "20px", letterSpacing: "-0.02em" }}>⤵</div>
            <div style={{ fontFamily: DISPLAY, fontSize: "clamp(28px, 6vw, 38px)", fontWeight: 500, letterSpacing: "-0.02em", color: C.text, marginBottom: "32px", fontStyle: "italic" }}>
              Enter the code.
            </div>
            <input value={circleJoinCode} onChange={e => setCircleJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && joinCircle()}
              placeholder="TRADR-ABCD-EFGH"
              style={{ ...inp, textAlign: "center", fontFamily: MONO, fontSize: "22px", letterSpacing: "0.14em", padding: "16px 0" }} />
            <button onClick={joinCircle} disabled={isJoiningCircle || !circleJoinCode.trim()} style={{ ...pillPrimary(!!circleJoinCode.trim() && !isJoiningCircle), marginTop: "20px" }}>
              {isJoiningCircle ? "Joining…" : "Join →"}
            </button>
            {circleMsg && <div style={{ fontFamily: BODY, fontSize: "13px", color: circleMsg.toLowerCase().includes("joined") ? C.green : C.red, marginTop: "14px" }}>{circleMsg}</div>}
          </div>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.6, textAlign: "center", maxWidth: "32ch", margin: "0 auto" }}>
            Ask the circle owner for their invite link or code, then paste it above.
          </div>
        </div>
      )}

      {/* ── CIRCLE DETAIL ── */}
      {circlesView === "detail" && activeCircle && (
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(24px, 4vw, 36px)" }}>
          {/* Header bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
            <button onClick={() => { setCirclesView("browse"); setActiveCircle(null); setLeaderboard([]); }} style={{ ...pillGhost, padding: "8px 14px" }}>‹ BACK</button>
            {!activeCircle.isOwner && (
              <button onClick={() => { if (window.confirm(`Leave "${activeCircle.name}"? You can rejoin with the code.`)) leaveCircle(activeCircle.code); }}
                style={{ background: "transparent", color: C.muted, border: `0.5px solid ${C.border2}`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Leave
              </button>
            )}
          </div>

          {/* Circle hero */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "16px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "12px", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "28px", color: C.text, flexShrink: 0, border: `1px solid ${C.border2}` }}>
                {activeCircle.emoji || "◆"}
              </div>
              <div>
                <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 8vw, 48px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.95, color: C.text, marginBottom: "6px" }}>
                  {activeCircle.name}
                </h1>
                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {activeCircle.code}
                </div>
              </div>
            </div>
            {activeCircle.description && (
              <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.6, maxWidth: "48ch", marginBottom: "16px" }}>{activeCircle.description}</div>
            )}
            {/* Aggregate stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0", background: C.panel, borderRadius: "12px", overflow: "hidden", border: `1px solid ${C.border}` }}>
              {[
                ["MEMBERS", activeCircle.members?.length || 1],
                ["ON BOARD", leaderboard.length || "—"],
                ["TRADES", circleTotalTrades || "—"],
                ["AVG WR", leaderboard.length > 0 ? `${circleAvgWR}%` : "—"],
              ].map(([k, v], i) => (
                <div key={k as string} style={{ padding: "14px 10px", textAlign: "center", borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
                  <div style={{ fontFamily: MONO, fontSize: "8px", color: C.muted, letterSpacing: "0.12em", marginTop: "5px" }}>{k}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Weekly leader callout */}
          {leader && (
            <div style={{ background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.14em", marginBottom: "4px" }}>🏆 {METRIC_LABELS[activeCircle?.metric || "dollar"] || "$ DOLLAR P&L"}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{leader.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 700, color: C.green, letterSpacing: "-0.02em" }}>{metricDisplay(leader, activeCircle).val}</div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.08em" }}>{leader.winRate.toFixed(0)}% WR · {leader.total} trades</div>
              </div>
            </div>
          )}

          {/* Your rank callout (if on the board) */}
          {myRank > 0 && myRank > 1 && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
              <span style={{ fontFamily: MONO, fontSize: "24px", fontWeight: 700, color: C.text2, letterSpacing: "-0.02em" }}>#{myRank}</span>
              <div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "2px" }}>YOUR RANK</div>
                <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2 }}>Keep publishing to climb the board.</div>
              </div>
            </div>
          )}

          {/* Publish strip */}
          <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em" }}>YOUR STATS TO PUBLISH</div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.text2, letterSpacing: "0.1em", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "3px 10px" }}>
                RANKED BY {METRIC_LABELS[activeCircle?.metric || "dollar"] || "$ P&L"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0", marginBottom: "14px" }}>
              {[["W/L", `${wins}/${losses}`], ["WR", `${winRate}%`], hasDollarData ? ["$ P&L", `${totalPnlDollar >= 0 ? "+" : ""}$${Math.abs(totalPnlDollar).toFixed(0)}`] : ["P&L", `${pnlPos ? "+" : ""}${totalPnL}R`], ["AVG R", avgRR === "—" ? "—" : `${avgRR}R`]].map(([k, v], i) => (
                <div key={k} style={{ padding: "4px 10px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "6px" }}>{k}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>{v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => publishToCircle(activeCircle.code)} style={{ ...pillPrimary(true), width: "100%", padding: "14px 20px" }}>PUBLISH MY STATS →</button>
          </section>

          {/* Tabs: Leaderboard / Chat / Members */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["leaderboard", "chat", "members"] as const).map(tab => (
                  <button key={tab}
                    onClick={() => { setCircleTab(tab); if (tab === "chat" && chatMessages.length === 0) loadChatMessages(activeCircle.code); }}
                    style={{ background: circleTab === tab ? C.text : "transparent", color: circleTab === tab ? C.bg : C.muted, border: `1px solid ${circleTab === tab ? C.text : C.border2}`, borderRadius: "999px", padding: "5px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {tab === "leaderboard" ? "Board" : tab === "chat" ? "Chat" : "Members"}
                  </button>
                ))}
              </div>
              {circleTab === "leaderboard" && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {(["all", "week"] as const).map(s => (
                    <button key={s} onClick={() => setLbSort(s)}
                      style={{ background: lbSort === s ? C.text2 + "22" : "transparent", border: `1px solid ${lbSort === s ? C.text2 : C.border2}`, borderRadius: "999px", padding: "4px 10px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", color: lbSort === s ? C.text : C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {s === "all" ? "ALL TIME" : "THIS WEEK"}
                    </button>
                  ))}
                  <button onClick={async () => { setLoadingLB(true); const e = await fetchCircleLeaderboard(activeCircle); setLeaderboard(e); setLoadingLB(false); }}
                    style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "11px" }}>↻</button>
                </div>
              )}
            </div>

            {/* ── LEADERBOARD ── */}
            {circleTab === "leaderboard" && (
              <div>
                {loadingLB ? (
                  <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading…</div>
                ) : leaderboard.length === 0 ? (
                  <div style={{ padding: "40px 24px", textAlign: "center", background: C.panel, borderRadius: "12px" }}>
                    <div style={{ fontFamily: MONO, fontSize: "24px", color: C.border2, marginBottom: "12px" }}>—</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontStyle: "italic", color: C.text2, marginBottom: "6px" }}>No stats published yet.</div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted }}>Be the first — hit "Publish My Stats" above.</div>
                  </div>
                ) : (
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {leaderboard.map((entry: any, i: number) => {
                      const isMe = entry.memberCode === getMyCode();
                      const md = metricDisplay(entry, activeCircle);
                      const pPos = md.raw >= 0;
                      const isFirst = i === 0;
                      const pnlCol = isFirst && pPos ? C.green : pPos ? C.text : C.red;
                      const isExpanded = expandedMember === entry.memberCode;
                      const isFollowing = (following || []).includes(entry.memberCode);
                      const medal = MEDALS[i] || null;
                      return (
                        <div key={entry.memberCode} style={{ borderBottom: `1px solid ${C.border}`, background: isFirst ? `${C.green}08` : "transparent" }}>
                          <div
                            onClick={() => setExpandedMember(isExpanded ? null : entry.memberCode)}
                            style={{ padding: "16px 0", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "14px", cursor: "pointer", paddingLeft: isExpanded ? "10px" : 0, paddingRight: isExpanded ? "10px" : 0 }}>
                            <span style={{ fontFamily: MONO, fontSize: "13px", color: isFirst ? C.green : C.muted, letterSpacing: "0.06em", minWidth: "28px" }}>
                              {medal || String(i + 1).padStart(2, "0")}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                                {isMe && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.12em", textTransform: "uppercase" }}>· YOU</span>}
                              </div>
                              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "3px", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                <span>{entry.total} trades</span>
                                <span style={{ color: entry.winRate >= 50 ? C.green : entry.winRate > 0 ? C.red : C.muted }}>{entry.winRate.toFixed(0)}% WR</span>
                                {entry.topStrategy && <span>{stratCode(entry.topStrategy)}</span>}
                                {entry.streak?.count >= 2 && <span style={{ color: entry.streak.type === "Win" ? C.green : C.red }}>{entry.streak.count}{entry.streak.type === "Win" ? "W" : "L"}</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                              <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 700, color: pnlCol, letterSpacing: "-0.01em", lineHeight: 1 }}>{md.val}</div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.06em" }}>{md.label}</div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div style={{ padding: "0 10px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                              <div>
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "4px" }}>
                                  {entry.alias && entry.alias !== entry.memberCode ? "ALIAS · USER CODE" : "USER CODE"}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.10em", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {entry.alias && entry.alias !== entry.memberCode ? `${entry.alias} · ${entry.memberCode}` : entry.memberCode}
                                  </span>
                                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(entry.memberCode); showToast("Code copied"); }}
                                    style={{ ...pillGhost, padding: "6px 12px", fontSize: "9px" }}>COPY</button>
                                </div>
                              </div>
                              {!isMe && (
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button onClick={(e) => { e.stopPropagation(); isFollowing ? unfollowUser(entry.memberCode) : followUser(entry.memberCode); }}
                                    style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "8px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>
                                    {isFollowing ? "✓ Following" : "+ Follow"}
                                  </button>
                                  {activeCircle?.isOwner && (
                                    <button onClick={async (e) => { e.stopPropagation(); await kickMember(activeCircle.code, entry.memberCode); setLeaderboard(prev => prev.filter(r => r.memberCode !== entry.memberCode)); setExpandedMember(null); }}
                                      style={{ background: "transparent", color: C.red, border: `1px solid ${C.red}44`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                                      KICK
                                    </button>
                                  )}
                                </div>
                              )}
                              {entry.handle && openProfile && (
                                <button onClick={(e) => { e.stopPropagation(); openProfile(entry.handle); }}
                                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", padding: 0, textDecoration: "underline" }}>View Profile →</button>
                              )}
                              {entry.updatedAt && (
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                                  Last published · {new Date(entry.updatedAt).toLocaleString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── CHAT ── */}
            {circleTab === "chat" && (() => {
              const myId = profile?.uid;
              return (
                <div>
                  <div style={{ borderTop: `1px solid ${C.border}`, minHeight: "260px", maxHeight: "420px", overflowY: "auto", paddingTop: "8px" }}>
                    {chatLoading
                      ? <div style={{ padding: "40px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading…</div>
                      : chatMessages.length === 0
                        ? <div style={{ padding: "48px 0", textAlign: "center" }}>
                            <div style={{ fontFamily: MONO, fontSize: "22px", color: C.border2, marginBottom: "10px", letterSpacing: "0.14em" }}>· · ·</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontStyle: "italic", color: C.text2, marginBottom: "6px" }}>No messages yet.</div>
                            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted }}>Be the first to say something.</div>
                          </div>
                        : chatMessages.map((msg: any) => {
                            const isMe = msg.sender_id === myId;
                            return (
                              <div key={msg.id} style={{ padding: "10px 0", display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", gap: "10px", alignItems: "flex-end" }}>
                                {!isMe && (
                                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "10px", color: C.muted, flexShrink: 0, border: `1px solid ${C.border}` }}>
                                    {(msg.sender_name || "?")[0].toUpperCase()}
                                  </div>
                                )}
                                <div style={{ maxWidth: "75%" }}>
                                  {!isMe && <div onClick={() => openProfile && msg.sender_handle && openProfile(msg.sender_handle)} style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.08em", marginBottom: "4px", cursor: openProfile && msg.sender_handle ? "pointer" : "default" }}>{msg.sender_name}{msg.sender_handle ? ` @${msg.sender_handle}` : ""}</div>}
                                  <div style={{ background: isMe ? C.text : C.panel, color: isMe ? C.bg : C.text, borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontFamily: BODY, fontSize: "14px", lineHeight: 1.5, wordBreak: "break-word", border: isMe ? "none" : `1px solid ${C.border}` }}>{msg.text}</div>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "4px", display: "flex", gap: "10px", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "center" }}>
                                    <span>{fmtMsgTime(msg.created_at)}</span>
                                    {isMe && <button onClick={() => deleteChatMessage(msg.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", padding: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Delete</button>}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                    }
                    <div ref={chatBottomRef} />
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", paddingTop: "14px", borderTop: `1px solid ${C.border}`, marginTop: "4px" }}>
                    <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(activeCircle.code, myId); } }}
                      placeholder="Message the circle…" rows={2}
                      style={{ ...inp, flex: 1, resize: "none", lineHeight: 1.5, fontFamily: BODY, fontSize: "14px" }} />
                    <button onClick={() => sendChatMessage(activeCircle.code, myId)}
                      disabled={!chatInput.trim() || chatSending}
                      style={{ ...pillPrimary(!!chatInput.trim() && !chatSending), width: "auto", padding: "10px 18px", opacity: chatSending ? 0.6 : 1, flexShrink: 0 }}>
                      {chatSending ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── MEMBERS ── */}
            {circleTab === "members" && (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {(activeCircle.members || []).length === 0 ? (
                  <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>No member data available.</div>
                ) : (activeCircle.members || []).map((m: any, idx: number) => {
                  const isMe = m.code === getMyCode();
                  const isFollowing = (following || []).includes(m.code);
                  const lbEntry = leaderboard.find((e: any) => e.memberCode === m.code);
                  return (
                    <div key={m.code || idx} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: "18px", flexShrink: 0, border: `1px solid ${C.border}` }}>
                        {m.avatar ? (m.avatar.length <= 8 && !m.avatar.startsWith("http") && !m.avatar.startsWith("data:") ? m.avatar : "👤") : "👤"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{m.name || "Trader"}</span>
                          {isMe && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.12em" }}>· YOU</span>}
                          {m.code === activeCircle.createdBy || m.isOwner ? <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>OWNER</span> : null}
                        </div>
                        {m.alias && <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{m.alias}</div>}
                        {lbEntry && <div style={{ fontFamily: MONO, fontSize: "10px", color: lbEntry.totalPnL >= 0 ? C.green : C.red, letterSpacing: "0.06em", marginTop: "2px" }}>{lbEntry.totalPnL >= 0 ? "+" : ""}{lbEntry.totalPnL.toFixed(1)}R · {lbEntry.winRate.toFixed(0)}% WR</div>}
                      </div>
                      {!isMe && (
                        <button onClick={() => isFollowing ? unfollowUser(m.code) : followUser(m.code)}
                          style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>
                          {isFollowing ? "✓" : "+Follow"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Invite strip */}
          <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "12px" }}>INVITE TO CIRCLE</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ flex: 1, borderBottom: `1px solid ${C.border2}`, padding: "12px 0", fontFamily: MONO, fontSize: "16px", color: C.text, letterSpacing: "0.14em" }}>{activeCircle.code}</div>
              <button onClick={() => { navigator.clipboard?.writeText(activeCircle.code); showToast("Code copied"); }}
                style={{ ...pillGhost, padding: "8px 16px" }}>CODE</button>
              <button onClick={() => { navigator.clipboard?.writeText(`https://tradrjournal.xyz/?join=${activeCircle.code}`); showToast("Link copied"); }}
                style={{ ...pillGhost, padding: "8px 16px" }}>LINK</button>
              <button onClick={() => shareInviteLink(activeCircle)}
                style={{ ...pillPrimary(true), width: "auto", padding: "8px 16px" }}>SHARE</button>
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.5 }}>
              LINK copies a join URL · SHARE sends a ready-made invite.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── PUBLIC PROFILE MODAL ────────────────────────────────────────────────────
function ProfileModal({ handle, myCode, following, followUser, unfollowUser, onClose, C }: any) {
  const [pubProfile, setPubProfile] = useState<any>(null);
  const [feedTrades, setFeedTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetCode, setTargetCode] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const norm = handle.replace(/^@/, "").toLowerCase();
        // Resolve handle → code first
        let code: string | null = null;
        const handleRow = await (window as any).storage.get(`tradr_handle_${norm}`, true);
        if (handleRow) {
          try { code = JSON.parse(handleRow.value)?.code || null; } catch {}
          if (!code) code = handleRow.owner_id || null;
          setTargetCode(code);
        }
        // Try to load published public profile
        const profileRow = await (window as any).storage.get(`tradr_profile_pub_${norm}`, true);
        if (profileRow) {
          const p = JSON.parse(profileRow.value);
          setPubProfile(p);
          if (p.publicTrades && code) {
            const feedRow = await (window as any).storage.get(`tradr_feed_${code}`, true);
            if (feedRow) {
              try { const t = JSON.parse(feedRow.value); setFeedTrades(Array.isArray(t) ? t : []); } catch {}
            }
          }
        } else if (code) {
          // Fallback: build a minimal profile from feed data so the modal isn't empty
          const feedRow = await (window as any).storage.get(`tradr_feed_${code}`, true);
          if (feedRow) {
            try {
              const t = JSON.parse(feedRow.value);
              const trades = Array.isArray(t) ? t : [];
              setFeedTrades(trades);
              if (trades.length > 0) {
                // Infer name/handle from feed entries
                const first = trades[0];
                setPubProfile({ name: first.authorName || norm, handle: norm, avatar: first.authorAvatar || "", bio: "", publicTrades: true });
              } else {
                setPubProfile({ name: norm, handle: norm, avatar: "", bio: "", publicTrades: false });
              }
            } catch { setPubProfile({ name: norm, handle: norm, avatar: "", bio: "", publicTrades: false }); }
          } else {
            setPubProfile({ name: norm, handle: norm, avatar: "", bio: "", publicTrades: false });
          }
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [handle]);

  const stats = useMemo(() => {
    if (!feedTrades.length) return null;
    const wins = feedTrades.filter((t: any) => t.outcome === "Win" || parseFloat(t.pnl) > 0).length;
    const total = feedTrades.length;
    const winRate = total > 0 ? (wins / total * 100) : 0;
    const totalPnL = feedTrades.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);
    const rrVals = feedTrades.map((t: any) => parseFloat(t.rr)).filter((v: number) => !isNaN(v) && v > 0);
    const avgR = rrVals.length > 0 ? rrVals.reduce((a: number, b: number) => a + b, 0) / rrVals.length : null;
    return { wins, total, winRate, totalPnL, avgR };
  }, [feedTrades]);

  const isMe = targetCode === myCode;
  const isFollowing = targetCode ? (following || []).includes(targetCode) : false;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto", padding: "10px 24px 48px" }}
        onClick={e => e.stopPropagation()}>
        {/* Drag handle */}
        <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 24px" }} />

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading profile…</div>
        ) : !pubProfile ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontStyle: "italic", color: C.text2, fontWeight: 500, marginBottom: "8px" }}>Profile not found</div>
            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted }}>This trader hasn't published their profile yet.</div>
          </div>
        ) : (<>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <AvatarCircle name={pubProfile.name} avatar={pubProfile.avatar} size={60} C={C} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{pubProfile.name}</div>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", marginTop: "3px" }}>@{pubProfile.handle?.replace(/^@/, "")}</div>
            </div>
            {!isMe && targetCode && (
              <button
                onClick={() => isFollowing ? unfollowUser(targetCode) : followUser(targetCode)}
                style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "9px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
                {isFollowing ? "✓ Following" : "+ Follow"}
              </button>
            )}
            {isMe && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>YOU</span>}
          </div>

          {/* Bio */}
          {pubProfile.bio && (
            <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.65, marginBottom: "22px", paddingBottom: "22px", borderBottom: `1px solid ${C.border}` }}>
              {pubProfile.bio}
            </div>
          )}

          {/* Stats */}
          {stats && stats.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "24px" }}>
              {[
                { label: "TOTAL P&L", value: `${stats.totalPnL >= 0 ? "+" : ""}${stats.totalPnL.toFixed(1)}R`, color: stats.totalPnL >= 0 ? C.green : C.red },
                { label: "WIN RATE", value: `${stats.winRate.toFixed(0)}%`, color: stats.winRate >= 50 ? C.green : C.red },
                { label: "AVG R", value: stats.avgR ? `${stats.avgR.toFixed(1)}R` : "—", color: C.text },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center", padding: "14px 8px", background: C.panel, borderRadius: "10px" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: s.color, letterSpacing: "-0.01em" }}>{s.value}</div>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginTop: "4px" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Trade history */}
          {pubProfile.publicTrades && feedTrades.length > 0 && (<>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "12px" }}>TRADES · {feedTrades.length}</div>
            {feedTrades.slice(0, 25).map((t: any, i: number) => {
              const pos = parseFloat(t.pnl) >= 0;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{t.pair || "—"}</div>
                    <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{t.date}{t.strategy ? ` · ${t.strategy}` : ""}</div>
                  </div>
                  {t.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2 }}>{t.rr}R</span>}
                  {t.pnl !== undefined && <span style={{ fontFamily: MONO, fontSize: "12px", color: pos ? C.green : C.red }}>{pos ? "+" : ""}{t.pnl}R</span>}
                </div>
              );
            })}
          </>)}

          {pubProfile.publicTrades && feedTrades.length === 0 && (
            <div style={{ padding: "20px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>No published trades yet.</div>
          )}

          {!pubProfile.publicTrades && (
            <div style={{ padding: "16px", background: C.panel, borderRadius: "10px", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted }}>
              This trader's trades are private.
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ─── FRIENDS FEED (editorial) ────────────────────────────────────────────────
function FriendsFeed({ friends, friendFeed, showAddFriend, setShowAddFriend, followHandleInput, setFollowHandleInput, followHandleMsg, followHandleLoading, followByHandle, followUser, removeFriend, unfollowUser, following, followers, followerProfiles, publishFeed, refreshFeed, reactToFeed, myFeedReactions, getMyCode, profile, C, inp, lbl, pillGhost, pillPrimary, openProfile }: any) {
  const [tab, setTab] = useState<"feed"|"people">("feed");

  const followingCount = following?.length || 0;
  const followerCount = followerProfiles?.length || 0;

  // helpers
  const tabBtn = (id: "feed"|"people", label: string) => (
    <button key={id} onClick={() => setTab(id)} style={{
      background: "none", border: "none", padding: "0 0 6px 0", cursor: "pointer",
      fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase",
      color: tab === id ? C.text : C.muted,
      borderBottom: tab === id ? `1px solid ${C.text}` : "1px solid transparent",
    }}>{label}</button>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          {tabBtn("feed", "Feed")}
          {tabBtn("people", `People${followingCount ? ` · ${followingCount}` : ""}`)}
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {tab === "feed" && friends.length > 0 && (
            <button onClick={async () => { await publishFeed(); await refreshFeed(); }}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", padding: 0 }}>
              ↻
            </button>
          )}
          <button onClick={() => setShowAddFriend(!showAddFriend)}
            style={{ background: showAddFriend ? C.text : "transparent", color: showAddFriend ? C.bg : C.text, border: `1px solid ${C.text}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {showAddFriend ? "Close" : "+ Follow"}
          </button>
        </div>
      </div>

      {/* ── Follow panel ── */}
      {showAddFriend && (
        <div style={{ marginBottom: "24px", padding: "18px", border: `1px solid ${C.border}`, borderRadius: "10px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Your handle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "3px" }}>YOUR HANDLE</div>
              <div style={{ fontFamily: MONO, fontSize: "14px", color: C.text, letterSpacing: "0.04em" }}>@{profile?.handle || "—"}</div>
            </div>
            <button onClick={async () => { await publishFeed(); }}
              style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: C.muted }}>
              Publish feed
            </button>
          </div>
          {/* Follow input */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "8px" }}>FOLLOW BY USERNAME</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input value={followHandleInput} onChange={e => setFollowHandleInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !followHandleLoading && followByHandle()}
                placeholder="@username" style={{ ...inp, flex: 1, margin: 0 }} disabled={followHandleLoading} />
              <button onClick={followByHandle} disabled={!followHandleInput.trim() || followHandleLoading}
                style={{ ...pillPrimary(!!followHandleInput.trim() && !followHandleLoading), width: "auto", padding: "10px 18px", opacity: followHandleLoading ? 0.6 : 1 }}>
                {followHandleLoading ? "…" : "Follow"}
              </button>
            </div>
            {followHandleMsg && (
              <div style={{ fontFamily: BODY, fontSize: "12px", color: followHandleMsg.includes("not found") || followHandleMsg.includes("That's you") ? C.red : C.green, marginTop: "8px" }}>
                {followHandleMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FEED tab ── */}
      {tab === "feed" && (
        <div>
          {friendFeed.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
              {followingCount === 0 ? (
                <>
                  <div style={{ fontSize: "32px", marginBottom: "14px" }}>👥</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, marginBottom: "6px", letterSpacing: "-0.01em" }}>Follow traders to get started</div>
                  <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, maxWidth: "260px", margin: "0 auto 20px" }}>
                    Their trades and stats appear here in real time.
                  </div>
                  <button onClick={() => setShowAddFriend(true)}
                    style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    + Follow someone
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "28px", marginBottom: "12px" }}>📭</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text2, marginBottom: "6px" }}>Feed is empty</div>
                  <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>
                    The traders you follow haven't published recently.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Avatar strip — quick view of who you're following */}
              {following?.length > 0 && (
                <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "4px", marginBottom: "24px" }}>
                  {following.map((code: string) => {
                    const f = friends.find((x: any) => x.code === code) || { code, name: code, handle: "" };
                    return (
                      <div key={code} onClick={() => openProfile && f.handle && openProfile(f.handle)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", cursor: "pointer", flexShrink: 0 }}>
                        <AvatarCircle name={f.name} avatar={f.avatar} size={38} C={C} />
                        <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.04em", maxWidth: "44px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.handle ? `@${f.handle}` : f.name?.split(" ")[0] || code.slice(0, 6)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Feed items */}
              {friendFeed.map((item: any, i: number) => {
                const pnl = parseFloat(item.pnl || "0");
                const isWin = item.outcome === "Win";
                const isLoss = item.outcome === "Loss";
                const outcomeColor = isWin ? C.green : isLoss ? C.red : C.muted;
                const outcomeLetter = isWin ? "W" : isLoss ? "L" : "BE";
                return (
                  <div key={item.authorCode + "-" + item.tradeId + "-" + i}
                    style={{ padding: "18px 0", borderBottom: `1px solid ${C.border}` }}>
                    {/* Author row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                      <div onClick={() => openProfile && item.authorHandle && openProfile(item.authorHandle)}
                        style={{ cursor: openProfile && item.authorHandle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                        <AvatarCircle name={item.authorName} avatar={item.authorAvatar} size={32} C={C} />
                        <div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{item.authorName}</div>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.04em" }}>
                            {item.authorHandle ? `@${item.authorHandle}` : "@trader"} · {item.date}
                          </div>
                        </div>
                      </div>
                      {/* Outcome badge */}
                      <div style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 700, color: outcomeColor, letterSpacing: "0.08em" }}>
                        {outcomeLetter}
                      </div>
                    </div>

                    {/* Trade card */}
                    <div style={{ background: C.panel ?? "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 600, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{item.pair || "—"}</div>
                          {item.strategy && <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "5px" }}>{item.strategy}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {item.pnl && <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 600, color: pnl >= 0 ? C.green : C.red, letterSpacing: "-0.02em", lineHeight: 1 }}>
                            {pnl >= 0 ? "+" : ""}{item.pnl}R
                          </div>}
                          {item.rr && <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "5px" }}>{item.rr}R setup</div>}
                        </div>
                      </div>
                      {item.notes && (
                        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}`, fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.6 }}>
                          {item.notes.slice(0, 160)}{item.notes.length > 160 ? "…" : ""}
                        </div>
                      )}
                    </div>

                    {/* Reactions row */}
                    <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      {REACTIONS.map(rx => {
                        const raw = (item.reactions || {})[rx];
                        const count = typeof raw === "number" ? raw : (Array.isArray(raw) ? raw.length : 0);
                        const iMine = myFeedReactions?.has(`${item.authorCode}_${item.tradeId}_${rx}`);
                        const active = iMine || count > 0;
                        return (
                          <button key={rx} onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                            style={{
                              background: iMine ? C.text + "18" : "transparent",
                              color: iMine ? C.text : active ? C.text2 : C.muted,
                              border: `1px solid ${iMine ? C.text + "44" : active ? C.border2 : C.border}`,
                              borderRadius: "999px", padding: "4px 10px", cursor: "pointer",
                              fontSize: "11px", fontFamily: MONO, letterSpacing: "0.04em",
                              display: "flex", alignItems: "center", gap: "5px",
                            }}>
                            <span>{rx === "FIRE" ? "🔥" : rx === "GEM" ? "💎" : rx === "UP" ? "👍" : rx === "TARGET" ? "🎯" : rx === "PAIN" ? "💀" : "🤯"}</span>
                            {count > 0 && <span style={{ fontSize: "10px" }}>{count}</span>}
                          </button>
                        );
                      })}
                      <button onClick={() => { const o=item.outcome==="Win"?"WIN":item.outcome==="Loss"?"LOSS":"BE"; const p=item.pnl?` ${parseFloat(item.pnl)>=0?"+":""}${item.pnl}R`:""; window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${o} ${item.pair||""}${p}${item.rr?" | "+item.rr+"R":""} — @tradrjournal\nhttps://tradrjournal.xyz`)}`, "_blank", "noopener"); }}
                        style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "999px", padding: "4px 10px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.08em", color: C.muted, display: "flex", alignItems: "center", gap: "4px" }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Share
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PEOPLE tab ── */}
      {tab === "people" && (
        <div>
          {followingCount === 0 && followerCount === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>🔍</div>
              <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text2, marginBottom: "6px" }}>Nobody yet</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, marginBottom: "18px" }}>Share your handle with other traders to build your network.</div>
              <button onClick={() => setShowAddFriend(true)}
                style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                + Follow someone
              </button>
            </div>
          ) : (
            <div>
              {/* Following */}
              {followingCount > 0 && (
                <div style={{ marginBottom: "28px" }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "12px" }}>
                    FOLLOWING · {followingCount}
                  </div>
                  {following.map((code: string) => {
                    const f = friends.find((x: any) => x.code === code) || { code, name: code, handle: "" };
                    const followsBack = followers?.includes(code);
                    return (
                      <div key={code} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div onClick={() => openProfile && f.handle && openProfile(f.handle)}
                          style={{ cursor: openProfile && f.handle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                          <AvatarCircle name={f.name} avatar={f.avatar} size={34} C={C} />
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontFamily: BODY, fontSize: "13px", fontWeight: 600, color: C.text }}>{f.name || code}</span>
                              {followsBack && <span style={{ fontFamily: MONO, fontSize: "8px", color: C.green, letterSpacing: "0.08em", border: `1px solid ${C.green}44`, borderRadius: "4px", padding: "1px 5px" }}>MUTUAL</span>}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.04em", marginTop: "2px" }}>
                              {f.handle ? `@${f.handle}` : code.slice(0, 12)}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => unfollowUser(code)}
                          style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "5px 10px", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em" }}>
                          Unfollow
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Followers */}
              {followerCount > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "12px" }}>
                    FOLLOWERS · {followerCount}
                  </div>
                  {followerProfiles.map((f: any) => {
                    const iFollow = following?.includes(f.code);
                    return (
                      <div key={f.code} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div onClick={() => openProfile && f.handle && openProfile(f.handle)}
                          style={{ cursor: openProfile && f.handle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                          <AvatarCircle name={f.name} avatar={f.avatar} size={34} C={C} />
                          <div>
                            <div style={{ fontFamily: BODY, fontSize: "13px", fontWeight: 600, color: C.text }}>{f.name || f.code}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.04em", marginTop: "2px" }}>
                              {f.handle ? `@${f.handle}` : f.code?.slice(0, 12)}
                            </div>
                          </div>
                        </div>
                        {iFollow ? (
                          <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.08em" }}>MUTUAL</span>
                        ) : (
                          <button onClick={() => { setFollowHandleInput(f.handle || f.code); followByHandle(); }}
                            style={{ background: C.text, color: C.bg, border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em" }}>
                            Follow back
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────
function UpgradeModal({ C, userId, userEmail, stripeCustomerId, onCustomerId, onClose }: {
  C: Record<string, string>;
  userId: string;
  userEmail: string;
  stripeCustomerId?: string;
  onCustomerId: (id: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpgrade() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: userEmail, stripeCustomerId }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg ?? `Request failed (${res.status})`);
      }
      const { url, customerId: newCid } = await res.json();
      if (newCid) onCustomerId(newCid);
      window.location.href = url; // navigate to Stripe Checkout
    } catch (err: any) {
      console.error("[upgrade]", err);
      setError(err.message ?? "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, padding: "20px",
  };
  const card: React.CSSProperties = {
    background: "#1A1A18", border: `1px solid ${C.border2 ?? "#3A3A34"}`,
    borderRadius: "16px", padding: "28px 24px", width: "100%", maxWidth: "360px",
    display: "flex", flexDirection: "column", gap: "18px",
  };

  const FEATURES = [
    { icon: "📊", text: "Unlimited trade history" },
    { icon: "📥", text: "CSV & broker auto-import" },
    { icon: "🔍", text: "Advanced analytics & heatmaps" },
    { icon: "🧠", text: "Full insights — patterns & edge detection" },
    { icon: "🏆", text: "Priority in Trading Circles leaderboard" },
    { icon: "📤", text: "Export reports (CSV + PDF)" },
  ];

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card}>
        {/* Header */}
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "#000", borderRadius: "6px", padding: "3px 10px",
            fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          }}>⚡ PRO</div>
          <div style={{ marginTop: "12px", fontSize: "21px", fontWeight: 800, color: C.text ?? "#EDEDE8", lineHeight: 1.2 }}>
            Upgrade to TRADR Pro
          </div>
          <div style={{ marginTop: "4px", fontSize: "13px", color: C.muted ?? "#8A8A82" }}>
            Everything you need to trade with a real edge.
          </div>
        </div>

        {/* Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: "38px", fontWeight: 900, color: C.text ?? "#EDEDE8", lineHeight: 1 }}>£5.99</span>
          <span style={{ fontSize: "13px", color: C.muted ?? "#8A8A82" }}>/month · cancel any time</span>
        </div>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {FEATURES.map(f => (
            <div key={f.text} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: C.text2 ?? "#BCBCB4" }}>
              <span style={{ fontSize: "15px", width: "20px", flexShrink: 0 }}>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#ef444422", border: "1px solid #ef444455", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#ef4444" }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          style={{
            background: loading ? (C.muted ?? "#8A8A82") : "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "#000", border: "none", borderRadius: "10px",
            padding: "14px", fontSize: "15px", fontWeight: 800,
            cursor: loading ? "default" : "pointer", width: "100%",
            transition: "opacity 0.2s", opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Redirecting to checkout…" : "Upgrade Now — £5.99/mo"}
        </button>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: C.muted ?? "#8A8A82", cursor: "pointer", fontSize: "12px", textAlign: "center", letterSpacing: "0.06em" }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

