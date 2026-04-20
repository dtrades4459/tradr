import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// Strategy icons are now 2-3 letter mono codes (no emoji).
const STRATEGIES: any = {
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

function calcRR(e: any, s: any, t: any) {
  const ev = parseFloat(e), sv = parseFloat(s), tv = parseFloat(t);
  if (!ev || !sv || !tv || ev === sv) return "";
  return (Math.abs(tv - ev) / Math.abs(ev - sv)).toFixed(2);
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
// Dedupe key — match on date + pair + entry price.
function tradeKey(t: any): string {
  return `${t.date}|${(t.pair || "").toUpperCase()}|${t.entryPrice || ""}`;
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
function generateInsights(trades: any[]) {
  const insights: any[] = [];
  if (!trades.length) return [{ kicker: "START", text: "Log your first trade to get personalised feedback.", type: "info" }];
  const wins = trades.filter(t => t.outcome === "Win").length;
  const losses = trades.filter(t => t.outcome === "Loss").length;
  const wr = trades.length ? wins / trades.length : 0;
  // Session analysis
  const sesStats: any = {};
  trades.forEach(t => { if (!t.session) return; if (!sesStats[t.session]) sesStats[t.session] = { w: 0, total: 0 }; if (t.outcome === "Win") sesStats[t.session].w++; sesStats[t.session].total++; });
  Object.entries(sesStats).forEach(([ses, v]: any) => {
    const swr = v.w / v.total;
    if (v.total >= 3 && swr < wr - 0.15) insights.push({ kicker: "WARN", text: `Your ${ses} session win rate (${(swr * 100).toFixed(0)}%) is below your average. Consider trading fewer setups here.`, type: "warning" });
    if (v.total >= 3 && swr > wr + 0.15) insights.push({ kicker: "NOTE", text: `${ses} is your best session with a ${(swr * 100).toFixed(0)}% win rate. Prioritise it.`, type: "positive" });
  });
  // Strategy analysis
  const stratS: any = {};
  trades.forEach(t => { if (!t.strategy) return; if (!stratS[t.strategy]) stratS[t.strategy] = { w: 0, total: 0, pnl: 0 }; if (t.outcome === "Win") stratS[t.strategy].w++; stratS[t.strategy].total++; stratS[t.strategy].pnl += parseFloat(t.pnl) || 0; });
  let bestStrat: string | null = null, bestWR = 0;
  Object.entries(stratS).forEach(([s, v]: any) => { const swr = v.total ? v.w / v.total : 0; if (v.total >= 3 && swr > bestWR) { bestWR = swr; bestStrat = s; } });
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
  if (rrTrades.length >= 5) {
    const avgRR = rrTrades.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTrades.length;
    if (avgRR < 1.5) insights.push({ kicker: "R:R", text: `Your average R:R is ${avgRR.toFixed(2)}. Aim for 2R+ to maintain positive expectancy even at 40% win rate.`, type: "warning" });
  }
  // Positive reinforcement
  if (wr >= 0.6 && trades.length >= 10) insights.push({ kicker: "HOLD", text: `Solid consistency — ${(wr * 100).toFixed(0)}% win rate over ${trades.length} trades. Stay disciplined.`, type: "positive" });
  if (!insights.length) insights.push({ kicker: "OKAY", text: "No major issues detected. Keep journaling consistently for deeper insights.", type: "info" });
  return insights;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({ message, onDone, C }: any) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: "94px", left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "rise 0.25s ease", background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "10px 20px", fontSize: "11px", color: C.text, whiteSpace: "nowrap", letterSpacing: "0.08em", fontFamily: MONO, textTransform: "uppercase" }}>
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
const EMPTY_TRADE: any = { id: null, date: new Date().toISOString().split("T")[0], pair: "", session: "", bias: "", strategy: "", setup: "", entryPrice: "", slPrice: "", tpPrice: "", rr: "", outcome: "", pnl: "", notes: "", emotions: "", screenshot: "", comments: [], reactions: {} };
const DEF_PROFILE: any = { name: "Trader", handle: "@trader", bio: "Multi-strategy trader | Consistency over everything", avatar: "", broker: "", timezone: "London (GMT)", startDate: new Date().toISOString().split("T")[0], targetRR: "2", maxTradesPerDay: "2" };

export default function Tradr({ user }: { user?: any } = {}) {
  const [trades, setTrades] = useState<any[]>([]);
  const [view, setView] = useState("home");
  // ── Circles state ──────────────────────────────────────────────
  const [myCircles, setMyCircles] = useState<any[]>([]);
  const [circlesView, setCirclesView] = useState<string>("browse");
  const [activeCircle, setActiveCircle] = useState<any>(null);
  const [circleForm, setCircleForm] = useState<any>({ name: "", description: "", strategy: "", privacy: "public" });
  const [circleJoinCode, setCircleJoinCode] = useState<string>("");
  const [circleMsg, setCircleMsg] = useState<string>("");
  const [darkMode, setDarkMode] = useState(true);
  const isDesktop = useIsDesktop(900);
  const C: any = darkMode ? DARK : LIGHT;
  const [form, setForm] = useState<any>(EMPTY_TRADE);
  const [editId, setEditId] = useState<any>(null);
  const [filter, setFilter] = useState<any>({ outcome: "", setup: "", pair: "", strategy: "" });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [profile, setProfile] = useState<any>(DEF_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<any>(DEF_PROFILE);
  const [commentInputs, setCommentInputs] = useState<any>({});
  const [friends, setFriends] = useState<any[]>([]);
  const [friendFeed, setFriendFeed] = useState<any[]>([]);
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

  // Swipe
  const swipeRef = useRef<any>(null);
  const touchStartX = useRef<any>(null);
  const touchStartY = useRef<any>(null);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

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

  async function saveTrades(u: any) { setTrades(u); await (window as any).storage.set("tradr_trades", JSON.stringify(u)); }
  async function handleCsvImport(newTrades: any[]) {
    if (!newTrades.length) { setShowCsvImport(false); return; }
    const merged = [...newTrades, ...trades];
    await saveTrades(merged);
    setShowCsvImport(false);
    showToast(`Imported ${newTrades.length} trade${newTrades.length === 1 ? "" : "s"}`);
  }
  async function saveProfile(u: any) { setProfile(u); await (window as any).storage.set("tradr_profile", JSON.stringify(u)); }
  async function saveFriends(u: any) { setFriends(u); await (window as any).storage.set("tradr_friends", JSON.stringify(u)); }
  async function saveStratChecklists(u: any) { setStratChecklists(u); await (window as any).storage.set("tradr_checklists", JSON.stringify(u)); }
  async function saveMyCircles(u: any) { setMyCircles(u); await (window as any).storage.set("tradr_circles", JSON.stringify(u)); }

  async function createCircle() {
    if (!circleForm.name.trim()) return;
    const code = circleForm.name.replace(/\s+/g, "").toUpperCase().slice(0, 6) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const circle = {
      id: Date.now(), code, name: circleForm.name.trim(),
      description: circleForm.description.trim(),
      strategy: circleForm.strategy, privacy: circleForm.privacy,
      createdBy: profile.name || "Trader", createdAt: new Date().toISOString(),
      members: [{ name: profile.name || "Trader", handle: profile.handle || "@trader", avatar: profile.avatar || "", code: getMyCode(), joinedAt: new Date().toISOString() }],
    };
    await (window as any).storage.set("tradr_circle_" + code, JSON.stringify(circle), true);
    const updated = [...myCircles, { ...circle, isOwner: true }];
    await saveMyCircles(updated);
    setCircleForm({ name: "", description: "", strategy: "", privacy: "public" });
    setCirclesView("browse");
    showToast("Circle created");
  }

  async function joinCircle() {
    const code = circleJoinCode.trim().toUpperCase();
    if (!code) { setCircleMsg("Enter a circle code."); return; }
    if (myCircles.find(c => c.code === code)) { setCircleMsg("Already a member."); setTimeout(() => setCircleMsg(""), 2000); return; }
    try {
      const res = await (window as any).storage.get("tradr_circle_" + code, true);
      if (!res) { setCircleMsg("Circle not found. Check the code."); setTimeout(() => setCircleMsg(""), 2500); return; }
      const circle = JSON.parse(res.value);
      const me = { name: profile.name || "Trader", handle: profile.handle || "@trader", avatar: profile.avatar || "", code: getMyCode(), joinedAt: new Date().toISOString() };
      const updatedCircle = { ...circle, members: [...circle.members.filter((m: any) => m.code !== me.code), me] };
      await (window as any).storage.set("tradr_circle_" + code, JSON.stringify(updatedCircle), true);
      const updated = [...myCircles, { ...updatedCircle, isOwner: false }];
      await saveMyCircles(updated);
      setCircleJoinCode("");
      setCircleMsg("Joined.");
      setTimeout(() => setCircleMsg(""), 2000);
    } catch { setCircleMsg("Error joining. Try again."); setTimeout(() => setCircleMsg(""), 2500); }
  }

  async function publishToCircle(circleCode: string, silent = false) {
    const myCode = getMyCode();
    const entry = {
      memberCode: myCode, name: profile.name || "Trader",
      handle: profile.handle || "@trader", avatar: profile.avatar || "",
      wins, losses, total,
      winRate: parseFloat(winRate as any),
      totalPnL: parseFloat(totalPnL),
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
    const entries: any[] = [];
    for (const m of circle.members) {
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
    const base = { comments: [], reactions: {}, ...form };
    let u;
    if (editId) { u = trades.map(t => t.id === editId ? { ...base, id: editId } : t); setEditId(null); }
    else { u = [{ ...base, id: Date.now() }, ...trades]; }
    await saveTrades(u); setForm(EMPTY_TRADE);
    showToast("Trade saved");
    setTimeout(() => setSavingTrade(false), 1500);
    setView("history");
  }

  function editTrade(t: any) { setForm(t); setEditId(t.id); setView("log"); }
  async function deleteTrade(id: any) { await saveTrades(trades.filter(t => t.id !== id)); setConfirmDelete(null); showToast("Trade deleted"); }
  async function toggleReaction(tid: any, reaction: any) {
    const u = trades.map(t => { if (t.id !== tid) return t; const r: any = { ...(t.reactions || {}) }; r[reaction] = (r[reaction] || 0) + 1; return { ...t, reactions: r }; });
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
  async function deleteComment(tid: any, cid: any) { const u = trades.map(t => t.id === tid ? { ...t, comments: (t.comments || []).filter((c: any) => c.id !== cid) } : t); await saveTrades(u); }

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
  function getMyCode() {
    const uid = profile.uid || Math.random().toString(36).slice(2, 8).toUpperCase();
    if (!profile.uid) saveProfile({ ...profile, uid });
    return `${(profile.name || "TRADER").toUpperCase().replace(/\s+/g, "").slice(0, 6)}-${uid}`;
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
  async function publishFeed() {
    const mc = getMyCode();
    const items = trades.slice(0, 10).map(t => ({ authorCode: mc, authorName: profile.name || "Trader", authorHandle: profile.handle || "@trader", authorAvatar: profile.avatar || "", tradeId: t.id, pair: t.pair, date: t.date, outcome: t.outcome, pnl: t.pnl, rr: t.rr, strategy: t.strategy, setup: t.setup, notes: t.notes, session: t.session, reactions: t.reactions || {}, comments: (t.comments || []).length, publishedAt: new Date().toISOString() }));
    await (window as any).storage.set(`tradr_feed_${mc}`, JSON.stringify(items), true);
  }
  async function refreshFeed() {
    const items: any[] = [];
    for (const f of friends) { try { const r = await (window as any).storage.get(`tradr_feed_${f.code}`, true); if (r) { const d = JSON.parse(r.value); items.push(...d); } } catch { } }
    items.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
    setFriendFeed(items);
    await (window as any).storage.set("tradr_feed", JSON.stringify(items));
  }
  async function reactToFeed(ac: string, tid: any, reaction: string) {
    setFriendFeed((p: any) => p.map((item: any) => { if (item.authorCode !== ac || item.tradeId !== tid) return item; const r = { ...item.reactions }; r[reaction] = (r[reaction] || 0) + 1; return { ...item, reactions: r }; }));
  }

  // Stats
  const wins = trades.filter(t => t.outcome === "Win").length;
  const losses = trades.filter(t => t.outcome === "Loss").length;
  const bes = trades.filter(t => t.outcome === "Breakeven").length;
  const total = trades.length;
  const winRate: any = total ? ((wins / total) * 100).toFixed(1) : 0;
  const totalPnL = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0).toFixed(2);
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
    { id: "circles", label: "CIRCLES" },
  ];

  // Sub-section config per main view — fed to the desktop SubNavDropdown so
  // main-nav + sub-nav fit on one row instead of stacking into two.
  const HOME_SECTIONS = [
    { id: "feed", label: "Overview" },
    { id: "analytics", label: "Analytics" },
    { id: "ai", label: "Insights" },
    { id: "rules", label: "Rules" },
    { id: "settings", label: "Settings" },
  ];
  const STATS_SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "strategies", label: "Strategies" },
    { id: "calendar", label: "Calendar" },
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
        <header style={{ padding: isDesktop ? "22px 40px 0" : "18px 22px 14px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", paddingBottom: isDesktop ? "18px" : 0 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: isDesktop ? "26px" : "22px", fontWeight: 700, letterSpacing: "-0.02em", color: C.text, lineHeight: 1 }}>
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
            <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", borderTop: `1px solid ${C.border}`, paddingTop: "14px", paddingBottom: "14px" }}>
              <div style={{ display: "flex", gap: "28px", overflowX: "auto", minWidth: 0 }}>
                {NAV_TABS.map(tab => (
                  <button key={tab.id} onClick={() => setView(tab.id)}
                    style={{ background: "none", border: "none", padding: 0, color: view === tab.id ? C.text : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", borderBottom: view === tab.id ? `1px solid ${C.text}` : "1px solid transparent", paddingBottom: "4px", whiteSpace: "nowrap" }}>
                    {tab.label}
                  </button>
                ))}
              </div>
              {(() => { const s = subNavFor(view); return s ? <SubNavDropdown sections={s.sections} value={s.value} onChange={s.onChange} C={C} /> : null; })()}
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
                <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "10px", borderBottom: `1px solid ${C.border}` }}>
                  <SubNavDropdown sections={HOME_SECTIONS} value={homeSection} onChange={setHomeSection} C={C} />
                </div>
              )}

              {/* FEED */}
              {homeSection === "feed" && (
                <div>
                  {/* Hero stat — this week P&L */}
                  <section style={{ marginTop: "clamp(24px, 5vw, 40px)" }}>
                    <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                      THIS WEEK
                    </div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "clamp(56px, 14vw, 84px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95, color: C.text, marginBottom: "8px" }}>
                      {pnlPos ? "+" : ""}{totalPnL}<span style={{ color: C.muted, fontStyle: "italic", fontWeight: 500 }}>R</span>
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2 }}>
                      <span style={{ color: pnlPos ? C.green : C.red }}>{pnlPos ? "Up" : "Down"}</span> over {total} trade{total !== 1 ? "s" : ""}.
                    </div>
                  </section>

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

                  {/* Friends */}
                  <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                    <FriendsFeed
                      friends={friends} friendFeed={friendFeed} showAddFriend={showAddFriend} setShowAddFriend={setShowAddFriend}
                      friendCodeInput={friendCodeInput} setFriendCodeInput={setFriendCodeInput}
                      friendMsg={friendMsg} addFriend={addFriend} removeFriend={removeFriend}
                      publishFeed={publishFeed} refreshFeed={refreshFeed} reactToFeed={reactToFeed}
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
                <div style={{ marginTop: "clamp(24px, 5vw, 40px)", display: "flex", flexDirection: "column", gap: "32px" }}>
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                          <div><label style={lbl}>Target R:R</label><input type="number" value={profileDraft.targetRR} onChange={e => setProfileDraft({ ...profileDraft, targetRR: e.target.value })} style={inp} /></div>
                          <div><label style={lbl}>Max Trades/Day</label><input type="number" value={profileDraft.maxTradesPerDay} onChange={e => setProfileDraft({ ...profileDraft, maxTradesPerDay: e.target.value })} style={inp} /></div>
                        </div>
                        <button onClick={async () => { await saveProfile(profileDraft); setEditingProfile(false); showToast("Profile saved"); }} style={{ ...pillPrimary(true), marginTop: "8px" }}>Save profile →</button>
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
                <div><label style={lbl}>P&L (R multiples)</label><input type="number" name="pnl" value={form.pnl} onChange={handleChange} placeholder="+2.5 or -1" style={inp} /></div>
              </div>
              <div><label style={lbl}>Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} placeholder="What did price do? Why did you enter?" rows={3} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
              <div><label style={lbl}>Emotional State</label><input name="emotions" value={form.emotions} onChange={handleChange} placeholder="Calm, FOMO, disciplined..." style={inp} /></div>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px", marginBottom: "20px" }}>
                <select value={filter.strategy} onChange={e => setFilter({ ...filter, strategy: e.target.value, setup: "" })} style={sel}><option value="">All strategies</option>{allStrategyNames.map((s: string) => <option key={s}>{s}</option>)}</select>
                <select value={filter.setup} onChange={e => setFilter({ ...filter, setup: e.target.value })} style={sel}><option value="">All setups</option>{(filter.strategy ? STRATEGIES[filter.strategy]?.setups || [] : allSetups).map((s: string) => <option key={s} value={s}>{s.split("(")[0].trim()}</option>)}</select>
              </div>
              {filteredTrades.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontFamily: BODY, fontStyle: "italic" }}>
                  No trades match.
                </div>
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
                            {t.emotions && <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginBottom: "16px", letterSpacing: "0.06em", textTransform: "uppercase" }}>MIND — {t.emotions}</div>}

                            {/* Reactions */}
                            <div style={{ marginBottom: "16px" }}>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "10px" }}>REACTIONS</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {REACTIONS.map(rx => {
                                  const count = (t.reactions || {})[rx] || 0;
                                  return (
                                    <button key={rx} onClick={() => toggleReaction(t.id, rx)}
                                      style={{ background: count > 0 ? C.text : "transparent", color: count > 0 ? C.bg : C.text, border: `1px solid ${count > 0 ? C.text : C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "6px" }}>
                                      <span>{rx}</span>
                                      {count > 0 && <span>{count}</span>}
                                    </button>
                                  );
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
                                        <button onClick={() => deleteComment(t.id, c.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: "10px", cursor: "pointer", fontFamily: MONO }}>x</button>
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
                <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "10px", borderBottom: `1px solid ${C.border}` }}>
                  <SubNavDropdown sections={STATS_SECTIONS} value={statsTab} onChange={setStatsTab} C={C} />
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
                        ["Total P&L", `${pnlPos ? "+" : ""}${totalPnL}R`],
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
                <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "10px", borderBottom: `1px solid ${C.border}`, marginTop: "4px" }}>
                  <SubNavDropdown sections={CHECKLIST_SECTIONS} value={checklistTab} onChange={setChecklistTab} C={C} />
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
              totalPnL={totalPnL} pnlPos={pnlPos} avgRR={avgRR} streak={streak}
              STRATEGY_NAMES={allStrategyNames} C={C} inp={inp} sel={sel} lbl={lbl}
              pillPrimary={pillPrimary} pillGhost={pillGhost}
            />
          )}
        </div>

        {/* ── BOTTOM NAV (mobile only — desktop uses the top-nav strip inside the masthead) ── */}
        {!isDesktop && (
          <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", background: C.bg, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 10, paddingBottom: "env(safe-area-inset-bottom)" }}>
            {NAV_TABS.map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)}
                style={{ flex: 1, padding: "14px 4px 14px", background: "none", border: "none", borderTop: view === tab.id ? `1px solid ${C.text}` : "1px solid transparent", marginTop: "-1px", color: view === tab.id ? C.text : C.muted, fontSize: "10px", letterSpacing: "0.08em", cursor: "pointer", fontFamily: MONO, textTransform: "uppercase" }}>
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
    <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", display: "flex", alignItems: "center", gap: "12px", textTransform: "uppercase" }}>
      <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
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
    { id: "settings", label: "Settings" },
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

// ─── TRADING CIRCLES (editorial) ─────────────────────────────────────────────
function TradingCircles({ myCircles, circlesView, setCirclesView, activeCircle, setActiveCircle, circleForm, setCircleForm, circleJoinCode, setCircleJoinCode, circleMsg, setCircleMsg, createCircle, joinCircle, publishToCircle, fetchCircleLeaderboard, profile, getMyCode, showToast, wins, losses, total, winRate, totalPnL, pnlPos, avgRR, streak, STRATEGY_NAMES, C, inp, sel, lbl, pillPrimary, pillGhost }: any) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loadingLB, setLoadingLB] = useState(false);

  async function openCircle(circle: any) {
    setActiveCircle(circle);
    setCirclesView("detail");
    setLoadingLB(true);
    const entries = await fetchCircleLeaderboard(circle);
    setLeaderboard(entries);
    setLoadingLB(false);
  }

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
          <button onClick={createCircle} style={{ ...pillPrimary(!!circleForm.name.trim()), marginTop: "8px" }}>
            Create circle →
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
            <button onClick={joinCircle} style={{ ...pillPrimary(!!circleJoinCode.trim()), marginTop: "20px" }}>Join →</button>
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
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button onClick={() => { setCirclesView("browse"); setActiveCircle(null); setLeaderboard([]); }} style={{ ...pillGhost, padding: "8px 14px" }}>‹ BACK</button>
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

          {/* Leaderboard */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" }}>
              <SectionKicker label="LEADERBOARD" C={C} />
              <button onClick={async () => { setLoadingLB(true); const e = await fetchCircleLeaderboard(activeCircle); setLeaderboard(e); setLoadingLB(false); }}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>↻ Refresh</button>
            </div>
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
                  return (
                    <div key={entry.memberCode}
                      style={{ padding: "16px 0", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "14px" }}>
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
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: pnlCol, letterSpacing: "-0.01em", lineHeight: 1 }}>{pPos ? "+" : ""}{entry.totalPnL.toFixed(1)}R</div>
                        {entry.avgRR ? <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "3px", letterSpacing: "0.06em" }}>{entry.avgRR.toFixed(1)}R AVG</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Invite */}
          <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "10px" }}>INVITE CODE</div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ flex: 1, borderBottom: `1px solid ${C.border2}`, padding: "14px 0", fontFamily: MONO, fontSize: "18px", color: C.text, letterSpacing: "0.14em" }}>{activeCircle.code}</div>
              <button onClick={() => { navigator.clipboard?.writeText(activeCircle.code); showToast("Code copied"); }}
                style={{ ...pillGhost, padding: "10px 18px" }}>COPY</button>
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: 1.5 }}>Share this code so others can join your circle.</div>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── FRIENDS FEED (editorial) ────────────────────────────────────────────────
function FriendsFeed({ friends, friendFeed, showAddFriend, setShowAddFriend, friendCodeInput, setFriendCodeInput, friendMsg, addFriend, removeFriend, publishFeed, refreshFeed, reactToFeed, getMyCode, profile, C, inp, lbl, pillGhost, pillPrimary }: any) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px" }}>
        <SectionKicker label={`FRIENDS · ${friends.length}`} C={C} />
        <div style={{ display: "flex", gap: "10px" }}>
          {friends.length > 0 && <button onClick={async () => { await publishFeed(); await refreshFeed(); }}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>↻ Refresh</button>}
          <button onClick={() => setShowAddFriend(!showAddFriend)}
            style={{ background: "none", border: "none", color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${C.text}`, paddingBottom: "2px" }}>
            {showAddFriend ? "Close" : "+ Add friend"}
          </button>
        </div>
      </div>

      {showAddFriend && (
        <div style={{ padding: "18px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginBottom: "18px" }}>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>YOUR CODE</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <span style={{ fontFamily: MONO, fontSize: "15px", color: C.text, letterSpacing: "0.12em" }}>{getMyCode()}</span>
              <button onClick={async () => { await publishFeed(); }} style={{ ...pillGhost, padding: "8px 14px" }}>PUBLISH</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Friend's code</label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input value={friendCodeInput} onChange={e => setFriendCodeInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && addFriend()}
                placeholder="HANDLE-XXXXXX" style={{ ...inp, flex: 1, letterSpacing: "0.1em", fontFamily: MONO, fontSize: "15px" }} />
              <button onClick={addFriend} style={{ ...pillPrimary(!!friendCodeInput.trim()), width: "auto", padding: "10px 18px" }}>Add</button>
            </div>
            {friendMsg && <div style={{ fontFamily: BODY, fontSize: "12px", color: C.green, marginTop: "8px" }}>{friendMsg}</div>}
          </div>
          {friends.length > 0 && (
            <div style={{ marginTop: "22px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "10px" }}>FOLLOWING · {friends.length}</div>
              {friends.map((f: any) => (
                <div key={f.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{f.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em" }}>{f.code}</div>
                  </div>
                  <button onClick={() => removeFriend(f.code)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {friends.length === 0 && !showAddFriend && (
        <div style={{ padding: "36px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontStyle: "italic", color: C.text2, fontWeight: 500, marginBottom: "6px" }}>No friends yet.</div>
          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.55 }}>Add a friend to see their trades here.</div>
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
                    const count = (item.reactions || {})[rx] || 0;
                    return (
                      <button key={rx} onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                        style={{ background: count > 0 ? C.text : "transparent", color: count > 0 ? C.bg : C.text, border: `1px solid ${count > 0 ? C.text : C.border2}`, borderRadius: "999px", padding: "5px 11px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "6px" }}>
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
