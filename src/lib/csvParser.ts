// ═══════════════════════════════════════════════════════════════════════════════
// csvParser.ts — pure CSV parsing helpers, extracted for testability.
// No React, no side-effects. Imported by CsvImportPanel.tsx.
// ═══════════════════════════════════════════════════════════════════════════════

// ── CSV tokeniser ─────────────────────────────────────────────────────────────

/**
 * Auto-detect the delimiter for a CSV/TSV file.
 * Checks the first non-empty line for tab vs comma frequency.
 * Returns "\t" for TSV, "," for everything else.
 */
export function detectDelimiter(text: string): "," | "\t" {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) ?? "";
  const tabs   = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

/**
 * Parse a CSV (or TSV) string into headers + rows.
 * Handles:
 *   - UTF-8 BOM (\uFEFF) at the start — Excel adds this
 *   - Windows CRLF and Unix LF line endings
 *   - RFC 4180 quoted fields (embedded commas, escaped quotes)
 *   - Tab-separated files auto-detected by delimiter sniffing
 */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip UTF-8 BOM — Excel prepends \uFEFF to every CSV it exports
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  const delimiter = detectDelimiter(clean);
  const lines: string[][] = [];
  let row: string[] = [], cell = "", inQuote = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuote) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === delimiter) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && clean[i + 1] === "\n") i++;
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

// ── Field-name → Kōda field mapping ──────────────────────────────────────────

export const CSV_FIELD_HINTS: { field: string; patterns: RegExp[] }[] = [
  { field: "pair",       patterns: [/^(symbol|ticker|pair|instrument|market|contract|asset|stock|coin)s?$/i, /symbol|ticker|pair|instrument/i] },
  { field: "date",       patterns: [/^(open[_\s]*time|close[_\s]*time|execution[_\s]*time|entry[_\s]*date|trade[_\s]*date|date[_\s]*time|timestamp|date|time)$/i, /entry.*date|date.*time|timestamp/i, /date|time/i] },
  { field: "bias",       patterns: [/^(direction|side|action|type|b\/?s|buy[_\s]*sell|position|long[_\s]*\/?[_\s]*short)$/i, /^(direction|side)$/i, /direction|side/i] },
  { field: "outcome",    patterns: [/^(outcome|result|status|win[_\s]*\/?[_\s]*loss|w\/?l)$/i, /outcome|result|status/i] },
  { field: "pnl",        patterns: [/^(p[\s/]?[&/]?l|pnl|profit|profit[_\s]*loss|net[_\s]*p[\s&/]?[&/]?l|realized[_\s]*p[&/]?l|net|realized|gain)$/i, /net.*p.?l|realized.*p.?l/i, /pnl|profit/i, /p.?l/i] },
  { field: "entryPrice", patterns: [/^(entry[_\s]*price|entry|open[_\s]*price|buy[_\s]*price|avg[_\s]*entry|price[_\s]*in|fill[_\s]*price|buy[_\s]*fill[_\s]*price)$/i, /entry.*price|fill.*price/i, /entry|open.*price/i] },
  { field: "exitPrice",  patterns: [/^(exit[_\s]*price|close[_\s]*price|sell[_\s]*price|sell[_\s]*fill[_\s]*price|exit)$/i, /exit.*price|sell.*fill.*price/i] },
  { field: "slPrice",    patterns: [/^(stop[_\s]*loss|stop|sl|s\/l)$/i, /stop.*loss|stop/i] },
  { field: "tpPrice",    patterns: [/^(take[_\s]*profit|target|tp|t\/p|limit)$/i, /target|take.*profit|tp/i] },
  { field: "qty",        patterns: [/^(qty|quantity|size|volume|contracts?|lots?|shares?)$/i, /^(qty|quantity|size)$/i] },
  { field: "rr",         patterns: [/^(r[_\s/:-]*r|risk[_\s]*reward|r[_\s]*multiple|r[_\s]*value)$/i, /risk.*reward|r:?r/i] },
  { field: "notes",      patterns: [/^(note|notes|comment|comments|description|memo)$/i, /note|comment|memo/i] },
  { field: "session",    patterns: [/^(session|market[_\s]*session)$/i, /session/i] },
];

export function autoDetectMapping(headers: string[]): Record<string, string> {
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

// ── Broker auto-detection ─────────────────────────────────────────────────────

export function detectBroker(headers: string[]): string | null {
  const h = new Set(headers.map(s => s.toLowerCase().trim()));
  const has = (patterns: RegExp[]) => headers.some(col => patterns.some(p => p.test(col)));
  // NinjaTrader 8
  if (h.has("instrument") && (h.has("entry time") || h.has("entry price")) && h.has("direction")) return "ninjatrader8";
  if (h.has("instrument") && h.has("entry time") && (h.has("profit") || h.has("net profit"))) return "ninjatrader8";
  // TopstepX
  if (h.has("instrument") && h.has("entry date") && (h.has("side") || h.has("net p&l"))) return "topstepx";
  // FTMO / MT5
  if ((h.has("open time") || h.has("open_time")) && (h.has("close price") || h.has("stop loss")) && h.has("volume")) return "ftmo_mt5";
  // Rithmic
  if (has([/net.*p.?l/i, /buy.*fill.*price/i, /sell.*fill.*price/i])) return "rithmic";
  if (h.has("net p&l") || h.has("buy fill price") || h.has("buy fill time")) return "rithmic";
  // Tradovate
  if ((h.has("b/s") || h.has("buy time")) && (h.has("p&l") || h.has("p / l"))) return "tradovate";
  // TradingView
  if (h.has("profit") && (h.has("date/time") || h.has("datetime")) && h.has("type")) return "tradingview";
  // MT4
  if ((h.has("open time") || h.has("open_time")) && (h.has("s / l") || h.has("stop loss"))) return "mt4";
  return null;
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

export function normalizeBias(raw: string): string {
  const v = raw.toLowerCase();
  if (/long|buy|bull/.test(v)) return "Bullish";
  if (/short|sell|bear/.test(v)) return "Bearish";
  return "";
}

export function normalizeOutcome(raw: string, pnl: number): string {
  const v = (raw || "").toLowerCase();
  if (/win|profit|tp[_\s]*hit|target/.test(v)) return "Win";
  if (/loss|lose|sl[_\s]*hit|stop/.test(v)) return "Loss";
  if (/break[_\s]*even|be|flat/.test(v)) return "Breakeven";
  if (pnl > 0) return "Win";
  if (pnl < 0) return "Loss";
  if (raw || !isNaN(pnl)) return "Breakeven";
  return "";
}

export function parseNum(s: string): number {
  if (!s) return NaN;
  const n = s.replace(/[^0-9.\-()/]/g, "").replace(/\((.*)\)/, "-$1");
  return parseFloat(n);
}

export function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString().split("T")[0];
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (slash) {
    const [, a, b] = slash;
    let y = slash[3];
    if (y.length === 2) y = "20" + y;
    const aN = parseInt(a), bN = parseInt(b);
    const mm = aN > 12 ? bN : aN;
    const dd = aN > 12 ? aN : bN;
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}

export function detectSessionFromDateStr(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/[T\s](\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?(?:\s*([+-]\d{2}:?\d{2}|UTC|Z))?/i);
  if (!m) return "";
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = (m[3] || "").toUpperCase();
  const tz = (m[4] || "").toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (tz === "Z" || tz === "UTC" || tz === "+00:00") hour = (hour - 4 + 24) % 24;
  const t = hour * 60 + min;
  if (t >= 570 && t < 960)  return "NY";
  if (t >= 180 && t < 510)  return "London";
  if (t >= 1200 || t < 120) return "Asia";
  return "";
}
