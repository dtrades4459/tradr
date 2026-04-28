import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { onStorageError } from "./lib/storage";
import { subscribeToCircle } from "./data/circles";
import { subscribeToFollows } from "./data/follows";

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
  comments: TradeComment[];
  reactions: ReactionMap;
  createdAt?: string;
  updatedAt?: string;
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
}

export interface CircleMember {
  name: string;
  handle: string;
  avatar: string;
  code: string;
  joinedAt: string;
}

export interface Circle {
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
const SESSIONS = ["London","New York","Asia","London/NY Overlap","Pre-Market","After Hours"];
const BIAS = ["Bullish","Bearish","Neutral"];
const OUTCOMES = ["Win","Loss","Breakeven"];
// Text reaction markers — no emoji.
const REACTIONS = ["FIRE","GEM","UP","TARGET","PAIN","MIND"];
const TABS = ["home","log","history","stats","checklist","circles"];

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
function stratCode(name: string) { return STRATEGIES[name]?.code || name.slice(0, 3).toUpperCase(); }

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
    id: Date.now() + Math.random(),
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
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "9px", color: C.muted, padding: "4px 0", fontFamily: MONO, letterSpacing: "0.08em" }}>{d}</div>)}
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
              {data && <div style={{ fontSize: "8px", color: textCol, fontFamily: MONO, letterSpacing: "0.04em" }}>{data.pnl >= 0 ? "+" : ""}{data.pnl.toFixed(1)}</div>}
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
  if (avatar) return <img src={avatar} alt="av" style={style} onClick={onClick} />;
  return (
    <div style={{ ...style, background: bg }} onClick={onClick}>
      <span style={{ fontSize: size * 0.34, color: col, letterSpacing: "0.04em", fontFamily: MONO }}>{initials}</span>
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
      padding: "7px 13px",
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
        padding: "7px 14px", cursor: "pointer", fontFamily: MONO, display: "inline-flex",
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
        }}>
          {strategies.map((s: string) => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }} style={{
              display: "flex", width: "100%", alignItems: "center", gap: "10px",
              background: s === value ? C.panel2 : "transparent", border: "none",
              borderRadius: "8px", padding: "9px 11px", cursor: "pointer", textAlign: "left",
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
        padding: "6px 12px", cursor: "pointer", fontFamily: MONO, display: "inline-flex",
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
              display: "block", width: "100%", background: s.id === value ? C.panel2 : "transparent",
              border: "none", borderRadius: "8px", padding: "9px 11px", cursor: "pointer",
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
        width: "32px", height: "32px",
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
  const addCheck = () => { if (!newCheck.trim()) return; setDraft((d: any) => ({ ...d, checklist: [...d.checklist, { id: Date.now() + Math.random(), text: newCheck.trim() }] })); setNewCheck(""); };
  const removeCheck = (id: any) => setDraft((d: any) => ({ ...d, checklist: d.checklist.filter((x: any) => x.id !== id) }));
  const addRule = () => { if (!newRule.trim()) return; setDraft((d: any) => ({ ...d, rules: [...d.rules, { id: Date.now() + Math.random(), text: newRule.trim() }] })); setNewRule(""); };
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
function CsvImportPanel({ existingTrades, onImport, onClose, allStrategyNames, C, inp, sel, lbl }: any) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultStrategy, setDefaultStrategy] = useState("");
  const [error, setError] = useState("");

  function handleFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
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
            Works with MT4/MT5 account history, TradingView strategy exports, ThinkorSwim trade history, and most crypto exchange CSVs. Common column names are auto-detected; you can override any mapping before importing.
          </div>
        </div>
      )}

      {error && <div style={{ fontFamily: BODY, fontSize: "12px", color: C.red }}>{error}</div>}

      {headers.length > 0 && (
        <>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted }}>
            <span style={{ color: C.text }}>{fileName}</span> — {rows.length} row{rows.length === 1 ? "" : "s"} detected.
          </div>

          <div>
            <label style={lbl}>Column mapping</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", marginTop: "8px" }}>
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
const EMPTY_TRADE: Partial<Trade> = { date: new Date().toISOString().split("T")[0], pair: "", session: "", bias: "", strategy: "", setup: "", entryPrice: "", slPrice: "", tpPrice: "", rr: "", outcome: "", pnl: "", pnlDollar: "", notes: "", emotions: "", screenshot: "", comments: [], reactions: {} };
const DEF_PROFILE: Profile = { name: "Trader", handle: "@trader", bio: "Multi-strategy trader | Consistency over everything", avatar: "", broker: "", timezone: "London (GMT)", startDate: new Date().toISOString().split("T")[0], targetRR: "2", maxTradesPerDay: "2" };

export default function Tradr({ user }: { user?: any } = {}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [view, setView] = useState("home");
  // ── Circles state ──────────────────────────────────────────────
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [circlesView, setCirclesView] = useState<string>("browse");
  const [activeCircle, setActiveCircle] = useState<Circle | null>(null);
  const [circleForm, setCircleForm] = useState<{ name: string; description: string; strategy: string; privacy: string }>({ name: "", description: "", strategy: "", privacy: "public" });
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
  const [pnlMode, setPnlMode] = useState<"r" | "$">("r");
  const [timeMode, setTimeMode] = useState<"week" | "all">("week");
  // Follow system: one-way. following = codes I follow, followers = codes following me.
  // Friends = intersect(following, followers) — i.e. mutual follows.
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [followerProfiles, setFollowerProfiles] = useState<Array<{ code: string; name: string; handle: string }>>([]);
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

  // Circle action loading states
  const [isCreatingCircle, setIsCreatingCircle] = useState(false);
  const [isJoiningCircle, setIsJoiningCircle] = useState(false);

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
  }, [trades, myCircles, loading]);

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
    try { const t = await (window as any).storage.get("tradr_trades"); if (t) setTrades(JSON.parse(t.value)); } catch { }
    try {
      const pr = await (window as any).storage.get("tradr_profile");
      let p = pr ? JSON.parse(pr.value) : { ...DEF_PROFILE };
      if (user?.id && p.uid !== user.id) {
        p = { ...p, uid: user.id };
        try { await (window as any).storage.set("tradr_profile", JSON.stringify(p)); } catch { }
      }
      setProfile(p); setProfileDraft(p);
    } catch { }
    try { const fr = await (window as any).storage.get("tradr_friends"); if (fr) setFriends(JSON.parse(fr.value)); } catch { }
    try { const ff = await (window as any).storage.get("tradr_feed", true); if (ff) setFriendFeed(JSON.parse(ff.value)); } catch { }
    try { const sc = await (window as any).storage.get("tradr_checklists"); if (sc) setStratChecklists(JSON.parse(sc.value)); } catch { }
    try { const sr = await (window as any).storage.get("tradr_rules"); if (sr) setStratRules(JSON.parse(sr.value)); } catch { }
    try { const dm = await (window as any).storage.get("tradr_dark"); if (dm) setDarkMode(JSON.parse(dm.value)); } catch { }
    try { const ci = await (window as any).storage.get("tradr_circles"); if (ci) setMyCircles(JSON.parse(ci.value)); } catch { }
    try { const st = await (window as any).storage.get("tradr_thresholds"); if (st) setStratThresholds(JSON.parse(st.value)); } catch { }
    try {
      const cs = await (window as any).storage.get("tradr_custom_strategies");
      if (cs) {
        const parsed = JSON.parse(cs.value);
        setCustomStrategies(parsed);
        // Merge into STRATEGIES so stratCode/stratShort/setups lookup work.
        parsed.forEach((s: any) => { STRATEGIES[s.name] = s; });
      }
    } catch { }
    setLoading(false);
  }

  async function saveCustomStrategies(u: any[]) {
    // Drop old custom entries from STRATEGIES then add the new set.
    customStrategies.forEach((s: any) => { delete STRATEGIES[s.name]; });
    u.forEach((s: any) => { STRATEGIES[s.name] = s; });
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

  async function saveTrades(u: Trade[]) { setTrades(u); await (window as any).storage.set("tradr_trades", JSON.stringify(u)); }
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
    await (window as any).storage.set("tradr_profile", JSON.stringify(u));
    // Register (or update) the handle in the shared lookup table so others
    // can follow this user by @handle. Pass the old handle so the stale row
    // gets cleaned up if the handle changed.
    if (u.handle) {
      registerHandle(u.handle, profile.handle || null);
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
        createdBy: profile.name || "Trader", createdAt: new Date().toISOString(),
      };
      // Write metadata (owned by me) + my own member row.
      await (window as any).storage.set("tradr_circle_" + code, JSON.stringify(circle), true);
      await (window as any).storage.set(`tradr_circle_member_${code}_${me.code}`, JSON.stringify(me), true);
      const updated = [...myCircles, { ...circle, members: [me], isOwner: true }];
      await saveMyCircles(updated);
      setCircleForm({ name: "", description: "", strategy: "", privacy: "public" });
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
    const entries: any[] = [];
    for (const m of members) {
      try {
        const r = await (window as any).storage.get("tradr_circle_entry_" + circle.code + "_" + m.code, true);
        if (r) entries.push(JSON.parse(r.value));
        else entries.push({ memberCode: m.code, name: m.name, handle: m.handle, avatar: m.avatar, wins: 0, losses: 0, total: 0, winRate: 0, totalPnL: 0, avgRR: 0, streak: null, topStrategy: null, updatedAt: null });
      } catch { entries.push({ memberCode: m.code, name: m.name, handle: m.handle, avatar: m.avatar, wins: 0, losses: 0, total: 0, winRate: 0, totalPnL: 0, avgRR: 0, streak: null, topStrategy: null, updatedAt: null }); }
    }
    entries.sort((a, b) => b.totalPnL - a.totalPnL);
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

  // Stats
  const wins = trades.filter(t => t.outcome === "Win").length;
  const losses = trades.filter(t => t.outcome === "Loss").length;
  const bes = trades.filter(t => t.outcome === "Breakeven").length;
  const total = trades.length;
  const winRate: any = total ? ((wins / total) * 100).toFixed(1) : 0;
  const totalPnL = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0).toFixed(2);

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
  const filteredTrades = trades.filter(t => {
    if (filter.outcome && t.outcome !== filter.outcome) return false;
    if (filter.setup && t.setup !== filter.setup) return false;
    if (filter.pair && !t.pair.toLowerCase().includes(filter.pair.toLowerCase())) return false;
    if (filter.strategy && t.strategy !== filter.strategy) return false;
    if (filter.dateFrom && t.date < filter.dateFrom) return false;
    if (filter.dateTo && t.date > filter.dateTo) return false;
    return true;
  });

  const checkedCount = checkItems.filter((i: any) => isChecked(i.id)).length;
  const totalItems = checkItems.length;
  const scorePct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
  const insights = generateInsights(trades);
  const allSetups = allStrategyNames.flatMap((s: string) => STRATEGIES[s]?.setups || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

  // ─── SHARED STYLES (editorial) ─────────────────────────────────────────────
  const inp: React.CSSProperties = {
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${C.border2}`,
    borderRadius: 0,
    color: C.text,
    padding: "12px 0",
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
    fontSize: "12px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: MONO,
    textTransform: "uppercase",
    transition: "opacity 0.15s",
  };

  const NAV_TABS = [
    { id: "home", label: "HOME" },
    { id: "log", label: "LOG" },
    { id: "history", label: "TRADES" },
    { id: "stats", label: "STATS" },
    { id: "checklist", label: "CHECK" },
    { id: "profile", label: "PROFILE" },
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
    { id: "strategies", label: "Strategies" },
    { id: "calendar", label: "Calendar" },
    { id: "psychology", label: "Psychology" },
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
    <div style={{ minHeight: "100vh", background: DARK.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, color: DARK.text }}>
      <div style={{ fontSize: "32px", letterSpacing: "-0.02em", fontWeight: 700 }}>
        TRADR<span style={{ color: DARK.blue }}>.</span>
      </div>
    </div>
  );

  // Show onboarding for new users who haven't completed the flow yet.
  if (!profile.onboarded) {
    return (
      <OnboardingFlow
        C={C}
        allStrategyNames={allStrategyNames}
        onComplete={async (name: string, handle: string, strategy: string) => {
          const updated: Profile = {
            ...profile,
            name: name.trim(),
            handle: handle.trim() || `@${name.trim().toLowerCase().replace(/\s+/g, "")}`,
            broker: profile.broker,
            timezone: profile.timezone,
            startDate: profile.startDate,
            targetRR: profile.targetRR,
            maxTradesPerDay: profile.maxTradesPerDay,
            onboarded: true,
          };
          if (strategy) updated.targetRR = profile.targetRR;
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
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:rise 0.25s ease;}
        input[type=file]{display:none;}
      `}</style>

      {/* ── PAGE FRAME (responsive: 480px canvas on mobile, up to 960px on desktop) ── */}
      <div className="tradr-app" ref={swipeRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={{ maxWidth: isDesktop ? "960px" : "480px", margin: "0 auto", paddingBottom: isDesktop ? "32px" : "84px", minHeight: "100vh", background: C.bg, borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>

        {/* ── MASTHEAD ── */}
        <header style={{ padding: isDesktop ? "18px 40px 0" : "14px 22px 12px", borderBottom: `0.5px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", paddingBottom: isDesktop ? "14px" : 0 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: isDesktop ? "22px" : "19px", fontWeight: 700, letterSpacing: "-0.02em", color: C.text, lineHeight: 1 }}>
              TRADR<span style={{ color: C.blue }}>.</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "14px", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>{profile.handle || "@trader"}</span>
              <button onClick={() => supabase.auth.signOut()}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", padding: 0 }}>
                sign out →
              </button>
            </div>
          </div>
          {/* Desktop top-nav: main tabs left, current section's sub-nav dropdown right. One row. */}
          {isDesktop && (
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

        {/* ── CONTENT ── */}
        <div style={{ padding: isDesktop ? "32px 40px 0" : "24px 22px 0" }} className="fade-in" key={view}>

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
                                style={{ background: timeMode === m ? C.text : "transparent", color: timeMode === m ? C.bg : C.muted, border: `1px solid ${timeMode === m ? C.text : C.border2}`, borderRadius: "999px", padding: "4px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                                {m === "week" ? "This Week" : "All Time"}
                              </button>
                            ))}
                          </div>
                          {/* Unit toggle — only if dollar data exists */}
                          {hasDollarData && (
                            <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
                              {(["r", "$"] as const).map(m => (
                                <button key={m} onClick={() => setPnlMode(m)}
                                  style={{ background: pnlMode === m ? C.text : "transparent", color: pnlMode === m ? C.bg : C.muted, border: `1px solid ${pnlMode === m ? C.text : C.border2}`, borderRadius: "999px", padding: "4px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
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

                  {/* Daily risk dashboard */}
                  {(() => {
                    const today = new Date().toISOString().split("T")[0];
                    const todayTrades = trades.filter(t => t.date === today);
                    const maxTrades = parseInt(profile.maxTradesPerDay) || 0;
                    const todayPnl = todayTrades.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0);
                    const targetRR = parseFloat(profile.targetRR) || 0;
                    const atLimit = maxTrades > 0 && todayTrades.length >= maxTrades;
                    const nearLimit = maxTrades > 0 && todayTrades.length === maxTrades - 1;
                    if (todayTrades.length === 0 && maxTrades === 0) return null;
                    return (
                      <section style={{ marginTop: "28px", padding: "16px", border: `1px solid ${atLimit ? C.red + "66" : C.border}`, borderRadius: "10px", background: atLimit ? C.red + "08" : "transparent" }}>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>TODAY</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TRADES</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: atLimit ? C.red : nearLimit ? "#f59e0b" : C.text }}>
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
                        </div>
                        {atLimit && (
                          <div style={{ marginTop: "12px", fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.08em" }}>
                            ⚠ Daily trade limit reached. Step back and review.
                          </div>
                        )}
                      </section>
                    );
                  })()}

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
                              return <span key={rx} style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, background: C.surface, border: `1px solid ${C.border}`, borderRadius: "999px", padding: "4px 10px", letterSpacing: "0.04em" }}>{rx} {count}</span>;
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
                      <section style={{ marginTop: "clamp(40px, 6vw, 56px)", padding: "20px", border: `1px solid ${C.border}`, borderRadius: "12px", background: C.bg }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px" }}>
                          <SectionKicker label={`${monthName.toUpperCase()} REPORT`} C={C} />
                          <span style={{ fontFamily: DISPLAY, fontSize: "28px", fontWeight: 700, color: mPnl >= 0 ? C.green : C.red, letterSpacing: "-0.02em" }}>{mPnl >= 0 ? "+" : ""}{mPnl.toFixed(2)}R</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>WIN RATE</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: mWr >= 50 ? C.green : C.red }}>{mWr}%</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{mTotal} trades</div>
                          </div>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>BEST DAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.green }}>{bestDay[1] !== -Infinity ? `+${(bestDay[1] as number).toFixed(2)}R` : "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{bestDay[0]}</div>
                          </div>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>WORST DAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.red }}>{worstDay[1] !== Infinity ? `${(worstDay[1] as number).toFixed(2)}R` : "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{worstDay[0]}</div>
                          </div>
                          {bestStrat && (
                            <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>BEST STRATEGY</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{stratShort(bestStrat[0])}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: bestStrat[1] >= 0 ? C.green : C.red, marginTop: "2px" }}>{bestStrat[1] >= 0 ? "+" : ""}{bestStrat[1].toFixed(2)}R</div>
                            </div>
                          )}
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
                  <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
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
                    />
                  </section>
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
                      <div key={rule.id} className="check-row" style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: "14px" }}>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", minWidth: "24px" }}>{String(idx + 1).padStart(2, "0")}</span>
                        {editingRule === rule.id
                          ? <EditInline val={rule.text} onSave={(t: string) => saveEditRule(rule.id, t)} onCancel={() => setEditingRule(null)} C={C} />
                          : <>
                            <span style={{ flex: 1, fontSize: "14px", color: C.text, lineHeight: 1.55, fontFamily: BODY }}>{rule.text}</span>
                            <div className="ca" style={{ display: "flex", gap: "10px", opacity: 0, transition: "opacity 0.15s" }}>
                              <button onClick={() => setEditingRule(rule.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>edit</button>
                              <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: "none", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>remove</button>
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
                        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{profile.handle}</div>
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
              <div>
                <label style={lbl}>Setup {form.strategy && <span style={{ color: C.muted, marginLeft: "6px" }}>· {stratCode(form.strategy)}</span>}</label>
                <select name="setup" value={form.setup} onChange={handleChange} style={sel}>
                  <option value="">Select setup</option>
                  {(form.strategy ? STRATEGIES[form.strategy]?.setups || [] : allSetups).map((s: string) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div><label style={lbl}>Outcome</label><select name="outcome" value={form.outcome} onChange={handleChange} style={sel}><option value="">Select</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div><label style={lbl}>P&L (R)</label><input type="number" name="pnl" value={form.pnl} onChange={handleChange} placeholder="+2.5 or -1" style={inp} /></div>
                  <div><label style={lbl}>P&L ($)</label><input type="number" name="pnlDollar" value={form.pnlDollar} onChange={handleChange} placeholder="e.g. +320" style={inp} /></div>
                </div>
              </div>
              <div><label style={lbl}>Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} placeholder="What did price do? Why did you enter?" rows={3} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
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
                <select value={filter.setup} onChange={e => setFilter({ ...filter, setup: e.target.value })} style={sel}><option value="">All setups</option>{(filter.strategy ? STRATEGIES[filter.strategy]?.setups || [] : allSetups).map((s: string) => <option key={s} value={s}>{s.split("(")[0].trim()}</option>)}</select>
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
                          style={{ padding: "16px 0", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "12px" }}>
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
                  <SubNavDropdown sections={STATS_SECTIONS} value={statsTab} onChange={setStatsTab} C={C} />
                  <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
                </div>
              )}

              {statsTab === "overview" && total === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontStyle: "italic" }}>Log trades to see stats.</div>}

              {statsTab === "overview" && total > 0 && (
                <>
                  <section>
                    <SectionKicker label="OVERVIEW" C={C} />
                    <div style={{ marginTop: "14px", borderTop: `1px solid ${C.border}` }}>
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
                        <div key={item.id} className="check-row" style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px" }}>
                          <div onClick={() => toggleCheck(item.id)}
                            style={{ width: "18px", height: "18px", borderRadius: "50%", border: `1px solid ${ch ? C.text : C.border2}`, background: ch ? C.text : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
                            {ch && <span style={{ color: C.bg, fontSize: "10px", lineHeight: 1 }}>✓</span>}
                          </div>
                          {editingCheckItem === item.id
                            ? <EditInline val={item.text} onSave={(t: string) => saveEditCheck(item.id, t)} onCancel={() => setEditingCheckItem(null)} C={C} />
                            : <>
                              <span onClick={() => toggleCheck(item.id)}
                                style={{ flex: 1, fontSize: "14px", color: ch ? C.muted : C.text, textDecoration: ch ? "line-through" : "none", cursor: "pointer", lineHeight: 1.5, fontFamily: BODY }}>{item.text}</span>
                              <div className="ca" style={{ display: "flex", gap: "10px", opacity: 0, transition: "opacity 0.15s" }}>
                                <button onClick={() => setEditingCheckItem(item.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>edit</button>
                                <button onClick={() => deleteCheckItem(item.id)} style={{ background: "none", border: "none", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>remove</button>
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
                </div>
              )}

              {checklistTab === "rules" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Read before every {stratShort(activeStrategy)} session.
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {ruleItems.map((rule: any, idx: number) => (
                      <div key={rule.id} className="check-row" style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: "14px" }}>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", minWidth: "24px" }}>{String(idx + 1).padStart(2, "0")}</span>
                        {editingRule === rule.id
                          ? <EditInline val={rule.text} onSave={(t: string) => saveEditRule(rule.id, t)} onCancel={() => setEditingRule(null)} C={C} />
                          : <>
                            <span style={{ flex: 1, fontSize: "14px", color: C.text, lineHeight: 1.55, fontFamily: BODY }}>{rule.text}</span>
                            <div className="ca" style={{ display: "flex", gap: "10px", opacity: 0, transition: "opacity 0.15s" }}>
                              <button onClick={() => setEditingRule(rule.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>edit</button>
                              <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: "none", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}>remove</button>
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
            />
          )}
        </div>

        {/* ── BOTTOM NAV (mobile only — desktop uses the top-nav strip inside the masthead) ── */}
        {!isDesktop && (
          <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", background: C.bg, borderTop: `0.5px solid ${C.border}`, display: "flex", zIndex: 10, paddingBottom: "env(safe-area-inset-bottom)" }}>
            {NAV_TABS.map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)}
                style={{ flex: 1, padding: "12px 4px 12px", background: "none", border: "none", borderTop: view === tab.id ? `1px solid ${C.text}` : "1px solid transparent", marginTop: "-0.5px", color: view === tab.id ? C.text : C.dim, fontSize: "9px", letterSpacing: "0.10em", cursor: "pointer", fontFamily: MONO, textTransform: "uppercase", transition: "color 0.12s ease" }}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {toast && <Toast message={toast} onDone={() => setToast(null)} C={C} />}
      </div>
    </div>
  );
}

// ─── SECTION KICKER ──────────────────────────────────────────────────────────
function SectionKicker({ label, C }: any) {
  return (
    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.dim, letterSpacing: "0.18em", display: "flex", alignItems: "center", gap: "10px", textTransform: "uppercase" }}>
      <span style={{ flex: "0 0 16px", height: "0.5px", background: C.border2 }} />
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
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", marginTop: "8px", textTransform: "lowercase" }}>
            {profile.handle || "@trader"}
          </div>
          {profile.bio && (
            <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.6, marginTop: "12px", maxWidth: "48ch" }}>{profile.bio}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>CODE</div>
            <div style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.1em" }}>{myCode}</div>
            <button onClick={() => { navigator.clipboard?.writeText(myCode); showToast("Code copied"); }}
              style={{ ...pillGhost, padding: "4px 10px", fontSize: "9px" }}>COPY</button>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {[
            ["W/L", `${wins}/${losses}`],
            ["WR", total > 0 ? `${winRate}%` : "—"],
            ["P&L", total > 0 ? `${pnlPos ? "+" : ""}${totalPnL}R` : "—"],
            ["R:R", avgRR === "—" ? "—" : `${avgRR}R`],
          ].map(([k, v], i) => (
            <div key={k as string} style={{ padding: "4px 10px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
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

const ONBOARDING_STEPS = ["welcome", "strategy", "ready"] as const;
type OnboardingStep = typeof ONBOARDING_STEPS[number];

function OnboardingFlow({ C, allStrategyNames, onComplete }: {
  C: any;
  allStrategyNames: string[];
  onComplete: (name: string, handle: string, strategy: string) => Promise<void>;
}) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [strategy, setStrategy] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameErr, setNameErr] = useState("");

  const inp: React.CSSProperties = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${C.border2}`, borderRadius: 0,
    color: C.text, padding: "14px 0", fontSize: "16px",
    fontFamily: "'Inter', system-ui, sans-serif", width: "100%", outline: "none",
  };
  const pillPrimary = (active: boolean): React.CSSProperties => ({
    background: active ? C.text : C.border2, color: active ? C.bg : C.muted,
    border: "none", borderRadius: "999px", padding: "16px 32px",
    fontSize: "14px", fontWeight: 500, cursor: active ? "pointer" : "default",
    fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "0.01em",
    width: "100%", transition: "background 0.15s",
  });

  async function finish() {
    if (saving) return;
    setSaving(true);
    await onComplete(name, handle, strategy);
    setSaving(false);
  }

  return (
    <div style={{
      minHeight: "100vh", minHeight: "100dvh",
      background: C.bg, color: C.text,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Wordmark */}
        <div style={{
          fontFamily: "'Syne', 'Inter', system-ui, sans-serif",
          fontSize: "17px", fontWeight: 700, letterSpacing: "-0.01em",
          color: C.text, marginBottom: "56px",
        }}>
          TRADR<span style={{ color: C.blue }}>.</span>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "48px" }}>
          {ONBOARDING_STEPS.map((s, i) => (
            <div key={s} style={{
              height: "2px", flex: 1, borderRadius: "1px",
              background: ONBOARDING_STEPS.indexOf(step) >= i ? C.text : C.border,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        {/* ── STEP 1: Welcome + name ── */}
        {step === "welcome" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: "10px", color: C.muted, letterSpacing: "0.16em",
              textTransform: "uppercase", marginBottom: "16px",
            }}>
              — Step 1 of 3
            </div>
            <h1 style={{
              fontFamily: "'Syne', 'Inter', system-ui, sans-serif",
              fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.05,
              color: C.text, marginBottom: "12px",
            }}>
              Let's set up<br />
              <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>your profile.</span>
            </h1>
            <p style={{
              fontSize: "14px", color: C.muted, lineHeight: 1.7,
              marginBottom: "40px",
            }}>
              This is how other traders will see you on leaderboards and in circles.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginBottom: "40px" }}>
              <div>
                <label style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: "10px", color: C.muted, letterSpacing: "0.14em",
                  textTransform: "uppercase", display: "block", marginBottom: "8px",
                }}>Your name</label>
                <input
                  value={name} onChange={e => { setName(e.target.value); setNameErr(""); }}
                  placeholder="e.g. Dylon" style={inp} autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) setStep("strategy"); }}
                />
                {nameErr && <div style={{ fontSize: "12px", color: C.red, marginTop: "6px" }}>{nameErr}</div>}
              </div>
              <div>
                <label style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: "10px", color: C.muted, letterSpacing: "0.14em",
                  textTransform: "uppercase", display: "block", marginBottom: "8px",
                }}>Handle <span style={{ color: C.dim, fontSize: "9px" }}>optional</span></label>
                <input
                  value={handle} onChange={e => setHandle(e.target.value)}
                  placeholder="@yourhandle" style={inp}
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) setStep("strategy"); }}
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!name.trim()) { setNameErr("Name is required."); return; }
                setStep("strategy");
              }}
              style={pillPrimary(!!name.trim())}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Primary strategy ── */}
        {step === "strategy" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: "10px", color: C.muted, letterSpacing: "0.16em",
              textTransform: "uppercase", marginBottom: "16px",
            }}>
              — Step 2 of 3
            </div>
            <h1 style={{
              fontFamily: "'Syne', 'Inter', system-ui, sans-serif",
              fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.05,
              color: C.text, marginBottom: "12px",
            }}>
              What's your<br />
              <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>main strategy?</span>
            </h1>
            <p style={{
              fontSize: "14px", color: C.muted, lineHeight: 1.7,
              marginBottom: "32px",
            }}>
              We'll pre-load your checklist and rules. You can add more strategies later.
            </p>

            <div style={{
              display: "flex", flexDirection: "column", gap: "1px",
              borderTop: `1px solid ${C.border}`,
              marginBottom: "36px",
            }}>
              {allStrategyNames.map((s: string) => (
                <div
                  key={s}
                  onClick={() => setStrategy(strategy === s ? "" : s)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 0", borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer",
                    transition: "opacity 0.12s",
                  }}
                >
                  <span style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: "14px", color: strategy === s ? C.text : C.text2,
                    fontWeight: strategy === s ? 500 : 400,
                  }}>{s}</span>
                  <div style={{
                    width: "18px", height: "18px", borderRadius: "50%",
                    border: `1px solid ${strategy === s ? C.text : C.border2}`,
                    background: strategy === s ? C.text : "transparent",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }} />
                </div>
              ))}
              {/* Skip option */}
              <div
                onClick={() => setStrategy("")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 0", borderBottom: `1px solid ${C.border}`,
                  cursor: "pointer",
                }}
              >
                <span style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: "11px", color: C.muted, letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>I'll decide later</span>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  border: `1px solid ${strategy === "" ? C.text : C.border2}`,
                  background: strategy === "" ? C.text : "transparent",
                  flexShrink: 0, transition: "all 0.15s",
                }} />
              </div>
            </div>

            <button onClick={() => setStep("ready")} style={pillPrimary(true)}>
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 3: Ready to log ── */}
        {step === "ready" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: "10px", color: C.muted, letterSpacing: "0.16em",
              textTransform: "uppercase", marginBottom: "16px",
            }}>
              — Step 3 of 3
            </div>
            <h1 style={{
              fontFamily: "'Syne', 'Inter', system-ui, sans-serif",
              fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.05,
              color: C.text, marginBottom: "16px",
            }}>
              You're in,<br />
              <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>{name || "trader"}.</span>
            </h1>
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "40px" }}>
              Your edge is built one trade at a time. Log your first trade — the stats and insights follow automatically.
            </p>

            {/* Quick summary of what they set */}
            <div style={{
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              padding: "20px 0", marginBottom: "36px",
              display: "flex", flexDirection: "column", gap: "12px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Name</span>
                <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "14px", color: C.text }}>{name}</span>
              </div>
              {handle && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Handle</span>
                  <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "14px", color: C.text }}>{handle}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Strategy</span>
                <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "14px", color: C.text }}>{strategy || "Not set"}</span>
              </div>
            </div>

            <button onClick={finish} disabled={saving} style={pillPrimary(!saving)}>
              {saving ? "Setting up…" : "Log my first trade →"}
            </button>
          </div>
        )}

        {/* Back link */}
        {step !== "welcome" && (
          <button
            onClick={() => setStep(step === "ready" ? "strategy" : "welcome")}
            style={{
              background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: "12px",
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              letterSpacing: "0.1em", textTransform: "uppercase",
              marginTop: "20px", padding: "8px 0",
            }}
          >
            ← Back
          </button>
        )}

      </div>

      {/* CSS for the rise animation used above */}
      <style>{`@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ─── TRADING CIRCLES (editorial) ─────────────────────────────────────────────
function TradingCircles({ myCircles, circlesView, setCirclesView, activeCircle, setActiveCircle, circleForm, setCircleForm, circleJoinCode, setCircleJoinCode, circleMsg, setCircleMsg, createCircle, joinCircle, publishToCircle, fetchCircleLeaderboard, profile, getMyCode, showToast, wins, losses, total, winRate, totalPnL, pnlPos, weekPnL, weekPnLPos, weekPnLStr, avgRR, streak, STRATEGY_NAMES, C, inp, sel, lbl, pillPrimary, pillGhost, following, followUser, unfollowUser, kickMember, leaveCircle }: any) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lbSort, setLbSort] = useState<"all" | "week">("all");
  const [loadingLB, setLoadingLB] = useState(false);
  const [circleTab, setCircleTab] = useState<"leaderboard" | "chat">("leaderboard");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  // Tap a row to expand a tiny member card with COPY + Follow CTA. Toggle by
  // setting to memberCode, clear on a second tap. Resets on circle switch.
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

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

  // Auto-refresh leaderboard every 2 min while sitting on the detail view.
  // The parent's sync effect keeps activeCircle.members fresh, so this picks
  // up new stats entries from other members without a manual tap. Realtime
  // (subscribeToCircle, wired in TRADR.syncCircles) will trigger fresher
  // refreshes by updating activeCircle.members; this interval is the floor.
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
    // Realtime: re-fetch the leaderboard the moment any row in this circle
    // changes (member join, entry publish, meta update).
    let unsub = () => {};
    try {
      unsub = subscribeToCircle(activeCircle.code, () => { refresh(); });
    } catch {}

    // Realtime chat — new messages pop in without a refresh.
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

  return (
    <div style={{ marginTop: "clamp(16px, 4vw, 28px)" }}>

      {/* ── BROWSE ── */}
      {circlesView === "browse" && (
        <>
          <section>
            <SectionKicker label="A FEW PEOPLE WHO ACTUALLY TAKE IT SERIOUSLY" C={C} />
            <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(44px, 11vw, 68px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.95, color: C.text, marginTop: "20px", marginBottom: "28px" }}>
              Your <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>circles</span>.
            </h1>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={() => setCirclesView("create")} style={{ ...pillPrimary(true), width: "auto", padding: "12px 20px" }}>+ Create circle</button>
              <button onClick={() => setCirclesView("join")} style={{ ...pillGhost, padding: "12px 20px" }}>⤵ JOIN CIRCLE</button>
            </div>
          </section>

          {/* My circles */}
          {myCircles.length > 0 ? (
            <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
              <SectionKicker label={`MY CIRCLES · ${myCircles.length}`} C={C} />
              <div style={{ marginTop: "20px", borderTop: `1px solid ${C.border}` }}>
                {myCircles.map((circle: any) => (
                  <div key={circle.id} className="row-hvr" onClick={() => openCircle(circle)}
                    style={{ padding: "20px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "16px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{circle.name}</span>
                          {circle.isOwner && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>· OWNER</span>}
                        </div>
                        {circle.description && <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.55, marginTop: "4px" }}>{circle.description}</div>}
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: "14px", color: C.muted, flexShrink: 0 }}>›</span>
                    </div>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "10px" }}>
                      <span>{circle.members?.length || 1} members</span>
                      {circle.strategy && <span>{stratCode(circle.strategy)} · {stratShort(circle.strategy)}</span>}
                      <span style={{ color: circle.privacy === "public" ? C.green : C.muted }}>{circle.privacy === "public" ? "Public" : "Private"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section style={{ marginTop: "clamp(40px, 6vw, 56px)", padding: "48px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontStyle: "italic", fontWeight: 500, color: C.text2, letterSpacing: "-0.01em", marginBottom: "8px" }}>No circles yet.</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>Create one or join with a code.</div>
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
              {[["public", "Public"], ["private", "Private"]].map(([val, label]) => (
                <button key={val} onClick={() => setCircleForm((f: any) => ({ ...f, privacy: val }))}
                  style={{ background: circleForm.privacy === val ? C.text : "transparent", border: `1px solid ${circleForm.privacy === val ? C.text : C.border2}`, borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", color: circleForm.privacy === val ? C.bg : C.text, textTransform: "uppercase" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: 1.55 }}>
              {circleForm.privacy === "public" ? "Anyone with the code can join." : "Invite only."}
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
            Ask the circle owner for their invite code, then paste it above.
          </div>
        </div>
      )}

      {/* ── CIRCLE DETAIL / LEADERBOARD ── */}
      {circlesView === "detail" && activeCircle && (
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(28px, 4vw, 44px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
            <button onClick={() => { setCirclesView("browse"); setActiveCircle(null); setLeaderboard([]); }} style={{ ...pillGhost, padding: "8px 14px" }}>‹ BACK</button>
            {/* Non-owners can leave; owners cannot leave their own circle */}
            {!activeCircle.isOwner && (
              <button
                onClick={() => {
                  if (window.confirm(`Leave "${activeCircle.name}"? You can rejoin with the code.`)) {
                    leaveCircle(activeCircle.code);
                  }
                }}
                style={{ background: "transparent", color: C.muted, border: `0.5px solid ${C.border2}`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                Leave
              </button>
            )}
          </div>
          {/* Circle title */}
          <section>
            <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(40px, 10vw, 60px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.95, color: C.text, marginBottom: "8px" }}>
              {activeCircle.name}
            </h1>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {activeCircle.members?.length || 1} members · {activeCircle.code}
            </div>
            {activeCircle.description && (
              <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.6, marginTop: "14px", maxWidth: "48ch" }}>{activeCircle.description}</div>
            )}
          </section>

          {/* Publish */}
          <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "22px 0" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "18px" }}>YOUR STATS TO PUBLISH</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0", marginBottom: "18px" }}>
              {[["W/L", `${wins}/${losses}`], ["WR", `${winRate}%`], ["P&L", `${pnlPos ? "+" : ""}${totalPnL}R`], ["R:R", avgRR === "—" ? "—" : `${avgRR}R`]].map(([k, v], i) => (
                <div key={k} style={{ padding: "4px 10px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "6px" }}>{k}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>{v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => publishToCircle(activeCircle.code)} style={{ ...pillGhost, width: "100%", padding: "14px 20px" }}>PUBLISH MY STATS →</button>
          </section>

          {/* Leaderboard / Chat */}
          <section>
            {/* Tab switcher */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["leaderboard", "chat"] as const).map(tab => (
                  <button key={tab}
                    onClick={() => { setCircleTab(tab); if (tab === "chat" && chatMessages.length === 0) loadChatMessages(activeCircle.code); }}
                    style={{ background: circleTab === tab ? C.text : "transparent", color: circleTab === tab ? C.bg : C.muted, border: `1px solid ${circleTab === tab ? C.text : C.border2}`, borderRadius: "999px", padding: "5px 16px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {tab === "leaderboard" ? "Leaderboard" : "Chat"}
                  </button>
                ))}
              </div>
              {circleTab === "leaderboard" && (
                <button onClick={async () => { setLoadingLB(true); const e = await fetchCircleLeaderboard(activeCircle); setLeaderboard(e); setLoadingLB(false); }}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>↻ Refresh</button>
              )}
            </div>

            {/* ── CHAT ── */}
            {circleTab === "chat" && (() => {
              const myId = profile?.uid;
              return (
                <div>
                  <div style={{ borderTop: `1px solid ${C.border}`, minHeight: "260px", maxHeight: "400px", overflowY: "auto", paddingTop: "8px" }}>
                    {chatLoading
                      ? <div style={{ padding: "40px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading…</div>
                      : chatMessages.length === 0
                        ? <div style={{ padding: "48px 0", textAlign: "center" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontStyle: "italic", color: C.text2, marginBottom: "6px" }}>No messages yet.</div>
                            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted }}>Be the first to say something.</div>
                          </div>
                        : chatMessages.map((msg: any) => {
                            const isMe = msg.sender_id === myId;
                            return (
                              <div key={msg.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                                <div style={{ maxWidth: "80%" }}>
                                  {!isMe && <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.08em", marginBottom: "4px" }}>{msg.sender_name}{msg.sender_handle ? ` · @${msg.sender_handle}` : ""}</div>}
                                  <div style={{ background: isMe ? C.text : C.surface, color: isMe ? C.bg : C.text, borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "9px 13px", fontFamily: BODY, fontSize: "14px", lineHeight: 1.5, wordBreak: "break-word" }}>{msg.text}</div>
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
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", paddingTop: "14px", borderTop: `1px solid ${C.border}`, marginTop: "2px" }}>
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

            {/* ── LEADERBOARD ── */}
            {circleTab === "leaderboard" && (<div>
            {loadingLB ? (
              <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading…</div>
            ) : leaderboard.length === 0 ? (
              <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>No stats published yet. Be the first.</div>
            ) : (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {leaderboard.map((entry: any, i: number) => {
                  const isMe = entry.memberCode === getMyCode();
                  const pPos = entry.totalPnL >= 0;
                  const pnlCol = i === 0 && pPos ? C.green : pPos ? C.text : C.red;
                  const isExpanded = expandedMember === entry.memberCode;
                  const isFollowing = (following || []).includes(entry.memberCode);
                  return (
                    <div key={entry.memberCode}
                      style={{ borderBottom: `1px solid ${C.border}` }}>
                      <div
                        onClick={() => setExpandedMember(isExpanded ? null : entry.memberCode)}
                        style={{ padding: "16px 0", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "14px", cursor: "pointer", background: isExpanded ? C.surface : "transparent", paddingLeft: isExpanded ? "10px" : 0, paddingRight: isExpanded ? "10px" : 0, transition: "background 120ms ease" }}>
                        <span style={{ fontFamily: MONO, fontSize: "12px", color: C.muted, letterSpacing: "0.08em", minWidth: "28px" }}>{String(i + 1).padStart(2, "0")}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                            {isMe && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>· You</span>}
                          </div>
                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "3px", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            <span>{entry.total} trades</span>
                            <span style={{ color: entry.winRate >= 50 ? C.green : entry.winRate > 0 ? C.red : C.muted }}>{entry.winRate.toFixed(0)}% WR</span>
                            {entry.topStrategy && <span>{stratCode(entry.topStrategy)}</span>}
                            {entry.streak && entry.streak.count >= 2 && <span style={{ color: entry.streak.type === "Win" ? C.green : C.red }}>{entry.streak.count}{entry.streak.type === "Win" ? "W" : "L"}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                          <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: pnlCol, letterSpacing: "-0.01em", lineHeight: 1 }}>{pPos ? "+" : ""}{entry.totalPnL.toFixed(1)}R</div>
                          {entry.avgRR ? <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.06em" }}>{entry.avgRR.toFixed(1)}R AVG</div> : null}
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: "0 10px 16px", display: "flex", flexDirection: "column", gap: "12px", background: C.surface }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "4px" }}>
                              {entry.alias && entry.alias !== entry.memberCode ? "ALIAS · USER CODE" : "USER CODE"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.10em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                {entry.alias && entry.alias !== entry.memberCode ? `${entry.alias} · ${entry.memberCode}` : entry.memberCode}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(entry.memberCode); showToast("Code copied"); }}
                                style={{ ...pillGhost, padding: "6px 12px", fontSize: "9px" }}>COPY</button>
                            </div>
                          </div>
                          {!isMe && (
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); isFollowing ? unfollowUser(entry.memberCode) : followUser(entry.memberCode); }}
                                style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "8px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>
                                {isFollowing ? "✓ Following" : "+ Follow"}
                              </button>
                              {/* Only circle owner sees kick button */}
                              {activeCircle?.isOwner && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await kickMember(activeCircle.code, entry.memberCode);
                                    // Remove the kicked member from the local leaderboard immediately.
                                    setLeaderboard(prev => prev.filter(r => r.memberCode !== entry.memberCode));
                                    setExpandedMember(null);
                                  }}
                                  style={{ background: "transparent", color: C.red, border: `1px solid ${C.red}44`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                                  KICK
                                </button>
                              )}
                            </div>
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
            </div>)}
          </section>

          {/* Invite */}
          <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "10px" }}>INVITE CODE</div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ flex: 1, borderBottom: `1px solid ${C.border2}`, padding: "14px 0", fontFamily: MONO, fontSize: "18px", color: C.text, letterSpacing: "0.14em" }}>{activeCircle.code}</div>
              <button onClick={() => { navigator.clipboard?.writeText(activeCircle.code); showToast("Code copied"); }}
                style={{ ...pillGhost, padding: "10px 18px" }}>COPY</button>
              <button
                onClick={() => {
                  const msg = `Join my TRADR circle "${activeCircle.name}" — use code ${activeCircle.code} on the Circles tab.`;
                  if (navigator.share) {
                    navigator.share({ title: "Join my TRADR circle", text: msg }).catch(() => {});
                  } else {
                    navigator.clipboard?.writeText(msg);
                    showToast("Invite message copied");
                  }
                }}
                style={{ ...pillGhost, padding: "10px 18px" }}>
                SHARE
              </button>
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: 1.5 }}>
              COPY copies just the code. SHARE sends a ready-made invite message — or copies it on desktop.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── FRIENDS FEED (editorial) ────────────────────────────────────────────────
function FriendsFeed({ friends, friendFeed, showAddFriend, setShowAddFriend, followHandleInput, setFollowHandleInput, followHandleMsg, followHandleLoading, followByHandle, followUser, removeFriend, unfollowUser, following, followers, followerProfiles, publishFeed, refreshFeed, reactToFeed, myFeedReactions, getMyCode, profile, C, inp, lbl, pillGhost, pillPrimary }: any) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px" }}>
        <SectionKicker label={`FRIENDS · ${following?.length || 0} following · ${followerProfiles?.length || 0} followers`} C={C} />
        <div style={{ display: "flex", gap: "10px" }}>
          {friends.length > 0 && <button onClick={async () => { await publishFeed(); await refreshFeed(); }}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>↻ Refresh</button>}
          <button onClick={() => setShowAddFriend(!showAddFriend)}
            style={{ background: "none", border: "none", color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${C.text}`, paddingBottom: "2px" }}>
            {showAddFriend ? "Close" : "+ Follow"}
          </button>
        </div>
      </div>

      {showAddFriend && (
        <div style={{ padding: "18px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginBottom: "18px" }}>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>YOUR HANDLE</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <span style={{ fontFamily: MONO, fontSize: "15px", color: C.text, letterSpacing: "0.06em" }}>@{profile?.handle || "—"}</span>
              <button onClick={async () => { await publishFeed(); }} style={{ ...pillGhost, padding: "8px 14px" }}>PUBLISH</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Follow by username</label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input value={followHandleInput} onChange={e => setFollowHandleInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !followHandleLoading && followByHandle()}
                placeholder="@username" style={{ ...inp, flex: 1 }} disabled={followHandleLoading} />
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
          {(following?.length > 0 || followerProfiles?.length > 0) && (
            <div style={{ marginTop: "22px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
              {/* FOLLOWING */}
              {following?.length > 0 && (
                <div style={{ marginBottom: followerProfiles?.length > 0 ? "20px" : 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "10px" }}>FOLLOWING · {following.length}</div>
                  {following.map((code: string) => {
                    const f = friends.find((x: any) => x.code === code) || { code, name: code, handle: "" };
                    const followsBack = followers?.includes(code);
                    return (
                      <div key={code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{f.name}</span>
                            {followsBack && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.08em", border: `1px solid ${C.green}`, borderRadius: "4px", padding: "1px 5px" }}>FOLLOWS YOU</span>}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em" }}>{f.handle ? `@${f.handle}` : code}</div>
                        </div>
                        <button onClick={() => unfollowUser(code)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Unfollow</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* FOLLOWERS */}
              {followerProfiles?.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "10px" }}>FOLLOWERS · {followerProfiles.length}</div>
                  {followerProfiles.map((f: any) => {
                    const iFollow = following?.includes(f.code);
                    return (
                      <div key={f.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{f.name || f.code}</div>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em" }}>{f.handle ? `@${f.handle}` : f.code}</div>
                        </div>
                        {!iFollow && (
                          <button onClick={() => { setFollowHandleInput(f.handle || f.code); followByHandle(); }}
                            style={{ background: "none", border: `1px solid ${C.text}`, color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", padding: "5px 10px", borderRadius: "4px" }}>
                            Follow back
                          </button>
                        )}
                        {iFollow && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.08em" }}>MUTUAL</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {friends.length === 0 && !showAddFriend && (
        <div style={{ padding: "36px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontStyle: "italic", color: C.text2, fontWeight: 500, marginBottom: "6px" }}>No one followed yet.</div>
          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.55 }}>Follow a trader by @username to see their trades here.</div>
        </div>
      )}

      {friendFeed.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {friendFeed.map((item: any, i: number) => {
            return (
              <div key={item.authorCode + "-" + item.tradeId + "-" + i} style={{ padding: "18px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{item.authorName}</div>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{item.authorHandle || "@trader"} · {item.date}</div>
                  </div>
                  {item.strategy && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em" }}>{stratCode(item.strategy)}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "baseline", marginBottom: item.notes ? "12px" : "14px" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{item.pair || "—"}</span>
                  {item.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2, letterSpacing: "0.04em" }}>{item.rr}R</span>}
                  {item.pnl && <span style={{ fontFamily: MONO, fontSize: "12px", color: parseFloat(item.pnl) >= 0 ? C.green : C.red, letterSpacing: "0.04em" }}>{parseFloat(item.pnl) >= 0 ? "+" : ""}{item.pnl}R</span>}
                </div>
                {item.notes && <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.6, marginBottom: "14px", borderLeft: `1px solid ${C.border2}`, paddingLeft: "14px" }}>{item.notes.slice(0, 140)}{item.notes.length > 140 ? "…" : ""}</div>}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {REACTIONS.map(rx => {
                    const raw = (item.reactions || {})[rx];
                    const count = typeof raw === "number" ? raw : (Array.isArray(raw) ? raw.length : 0);
                    const iMine = myFeedReactions?.has(`${item.authorCode}_${item.tradeId}_${rx}`);
                    const active = iMine || count > 0;
                    return (
                      <button key={rx} onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                        style={{ background: iMine ? C.text : "transparent", color: iMine ? C.bg : C.text, border: `1px solid ${active ? C.text : C.border2}`, borderRadius: "999px", padding: "5px 11px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{rx}</span>
                        {count > 0 && <span>{count}</span>}
                      </button>
                    );
                  })}
                  {item.comments > 0 && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", alignSelf: "center" }}>{item.comments} NOTES</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {friends.length > 0 && friendFeed.length === 0 && !showAddFriend && (
        <div style={{ padding: "24px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Ask friends to publish, then hit refresh.</div>
        </div>
      )}
    </div>
  );
}
