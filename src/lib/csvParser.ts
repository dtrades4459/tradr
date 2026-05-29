// ═══════════════════════════════════════════════════════════════════════════════
// csvParser.ts — pure CSV parsing helpers, extracted for testability.
// No React, no side-effects. Imported by CsvImportPanel.tsx.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Trade } from "../types";

// ── Field-name → Kōda field mapping (must be declared before parseCSV for header scoring) ──

export const CSV_FIELD_HINTS: { field: string; patterns: RegExp[] }[] = [
  { field: "pair",       patterns: [/^(symbol|ticker|pair|instrument|market|contract|asset|stock|coin)s?$/i, /symbol|ticker|pair|instrument/i] },
  { field: "date",       patterns: [/^(open[_\s]*time|close[_\s]*time|execution[_\s]*time|entry[_\s]*date|trade[_\s]*date|date[_\s]*time|timestamp|date|time)$/i, /entry.*date|date.*time|timestamp/i, /date|time/i] },
  { field: "bias",       patterns: [/^(direction|side|action|type|b\/?s|buy[_\s]*sell|long[_\s]*\/?[_\s]*short)$/i, /^(direction|side)$/i, /direction|side/i] },
  { field: "outcome",    patterns: [/^(outcome|result|status|win[_\s]*\/?[_\s]*loss|w\/?l)$/i, /outcome|result|status/i] },
  { field: "pnl",        patterns: [/^(p[\s/]?[&/]?l|pnl|profit|profit[_\s]*loss|net[_\s]*p[\s&/]?[&/]?l|realized[_\s]*p[&/]?l|net|realized|gain)$/i, /net.*p.?l|realized.*p.?l/i, /pnl|profit/i, /p.?l/i] },
  { field: "entryPrice", patterns: [/^(entry[_\s]*price|entry|open[_\s]*price|buy[_\s]*price|avg[_\s]*entry|price[_\s]*in|fill[_\s]*price|buy[_\s]*fill[_\s]*price)$/i, /entry.*price|fill.*price/i, /entry|open.*price/i] },
  { field: "exitPrice",  patterns: [/^(exit[_\s]*price|close[_\s]*price|sell[_\s]*price|sell[_\s]*fill[_\s]*price|exit)$/i, /exit.*price|sell.*fill.*price/i] },
  { field: "slPrice",    patterns: [/^(stop[_\s]*loss|stop|sl|s[_\s]*\/[_\s]*l)$/i, /stop.*loss|stop/i] },
  { field: "tpPrice",    patterns: [/^(take[_\s]*profit|target|tp|t[_\s]*\/[_\s]*p|limit)$/i, /target|take.*profit|tp/i] },
  { field: "qty",        patterns: [/^(qty|quantity|size|volume|contracts?|lots?|shares?)$/i, /^(qty|quantity|size)$/i] },
  { field: "rr",         patterns: [/^(r[_\s/:-]*r|risk[_\s]*reward|r[_\s]*multiple|r[_\s]*value)$/i, /risk.*reward|r:?r/i] },
  { field: "notes",      patterns: [/^(note|notes|comment|comments|description|memo)$/i, /note|comment|memo/i] },
  { field: "session",    patterns: [/^(session|market[_\s]*session)$/i, /session/i] },
];

// ── CSV tokeniser ─────────────────────────────────────────────────────────────

/**
 * Auto-detect the delimiter for a CSV/TSV file.
 * Checks the first non-empty line and picks whichever of comma, tab, or
 * semicolon appears most often. Semicolon support matters for European
 * broker exports (FTMO, MT5, locale-formatted Excel) where the comma is
 * a decimal separator and the column delimiter is `;`.
 */
export function detectDelimiter(text: string): "," | "\t" | ";" {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) ?? "";
  const tabs   = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g)  ?? []).length;
  const semis  = (firstLine.match(/;/g)  ?? []).length;
  if (semis >= Math.max(tabs, commas) && semis > 0) return ";";
  if (tabs > commas) return "\t";
  return ",";
}

/**
 * Score a candidate header row by counting how many cells match known field hint patterns.
 * A higher score means the row looks more like real column headers.
 */
export function scoreHeaderRow(cells: string[]): number {
  const patterns = CSV_FIELD_HINTS.flatMap(h => h.patterns);
  return cells.filter(c => {
    const v = c.trim();
    return v.length > 0 && patterns.some(p => p.test(v));
  }).length;
}

/**
 * Find the index of the real header row within the first 10 non-blank lines.
 * Handles broker exports that begin with report-title preamble rows (NT8, MT4, FTMO).
 * Strategy: prefer the row with the most field-hint matches; break ties by most non-empty cells.
 */
export function findHeaderRowIndex(lines: string[][]): number {
  let bestIdx = 0, bestScore = -1, bestCount = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const score = scoreHeaderRow(lines[i]);
    const count = lines[i].filter(v => v.trim()).length;
    if (score > bestScore || (score === bestScore && count > bestCount)) {
      bestScore = score; bestCount = count; bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Parse a CSV (or TSV) string into headers + rows.
 * Handles:
 *   - UTF-8 BOM (U+FEFF) at the start — Excel adds this
 *   - Windows CRLF and Unix LF line endings
 *   - RFC 4180 quoted fields (embedded commas, escaped quotes)
 *   - Tab-separated files auto-detected by delimiter sniffing
 *   - Preamble rows before the real header (broker report titles, account info)
 */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[]; delimiter: "," | "\t" | ";" } {
  // Strip UTF-8 BOM (U+FEFF) — Excel prepends it to every CSV it exports
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
  if (!lines.length) return { headers: [], rows: [], delimiter };

  // CRIT-6: skip preamble rows (report titles, account info) before the real header
  const headerIdx = findHeaderRowIndex(lines);
  const headers = lines[headerIdx].map(h => h.trim());
  const rows = lines.slice(headerIdx + 1).map(l => Object.fromEntries(headers.map((h, i) => [h, (l[i] ?? "").trim()])));
  return { headers, rows, delimiter };
}

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
  // Rithmic (both R|Trader Pro and Apex/TopstepX web export formats)
  if (has([/net.*p.?l/i, /buy.*fill.*price/i, /sell.*fill.*price/i])) return "rithmic";
  if (h.has("net p&l") || h.has("buy fill price") || h.has("buy fill time")) return "rithmic";
  if (h.has("net p&l") && (h.has("entry date/time") || h.has("entry time")) && h.has("buy/sell")) return "rithmic";
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

/**
 * Parse a CSV number cell into a number, or null for empty/unparseable input.
 *
 * Strips currency symbols, whitespace thousands separators, and converts
 * parenthetical negatives like "(125.00)" → -125. Returns null (not NaN) so
 * callers can use simple null-checks instead of isNaN guards.
 *
 * Decimal separator handling:
 *   - "." (US/UK default): dot = decimal, comma = thousands.
 *   - "," (EU): comma = decimal, dot = thousands. Pass when the file delimiter
 *     was detected as ";" (most European broker exports use ";" precisely so
 *     "," can remain the decimal separator).
 *   - "auto" (default): per-value heuristic. Rightmost separator is the
 *     decimal. Single comma followed by exactly 3 digits is a thousands
 *     separator ("1,234"); single comma followed by 1, 2, or 4+ digits is a
 *     decimal ("27,5", "27,50"). Multiple commas → thousands ("1,234,567").
 *
 * Without the "auto" heuristic, EU exports like "27,50" silently became 2750
 * (100× error). See FUNNEL_AUDIT and CSV_IMPORT_AUDIT.
 */
export function parseNum(
  s: string,
  opts?: { decimalSeparator?: "," | "." | "auto" },
): number | null {
  if (!s) return null;
  const sep = opts?.decimalSeparator ?? "auto";

  // Strip currency symbols + leading/trailing whitespace.
  let v = s.trim().replace(/[$£€¥₹₩]/g, "").trim();
  if (!v) return null;

  // Parenthesised negatives: "(125.00)" → "-125.00".
  v = v.replace(/^\((.*)\)$/, "-$1");

  // Internal whitespace is a thousands separator (e.g. "1 234,56"). Remove it.
  v = v.replace(/\s/g, "");

  let normalised: string;

  if (sep === ",") {
    // EU mode: comma is decimal, dot is thousands.
    normalised = v.replace(/\./g, "").replace(",", ".");
  } else if (sep === ".") {
    // US mode: dot is decimal, comma is thousands.
    normalised = v.replace(/,/g, "");
  } else {
    // Auto-detect per value.
    const lastDot = v.lastIndexOf(".");
    const lastComma = v.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      // Both present — the rightmost is the decimal.
      if (lastDot > lastComma) {
        normalised = v.replace(/,/g, ""); // US: "1,234.56"
      } else {
        normalised = v.replace(/\./g, "").replace(",", "."); // EU: "1.234,56"
      }
    } else if (lastComma >= 0) {
      const commaCount = (v.match(/,/g) ?? []).length;
      const digitsAfter = v.length - lastComma - 1;
      if (commaCount > 1) {
        normalised = v.replace(/,/g, ""); // "1,234,567" thousands
      } else if (digitsAfter === 3) {
        normalised = v.replace(",", ""); // "1,234" or "27,500" — assume thousands
      } else {
        normalised = v.replace(",", "."); // "27,5" or "27,50" — decimal
      }
    } else {
      normalised = v; // Only dot or no separator.
    }
  }

  const parsed = parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Decide the decimal separator to use given the detected CSV delimiter.
 * Semicolon-delimited files almost always come from EU/locale-Excel where
 * comma is the decimal. Comma/tab files use the auto heuristic.
 */
export function decimalSeparatorForDelimiter(
  delimiter: "," | "\t" | ";",
): "," | "auto" {
  return delimiter === ";" ? "," : "auto";
}

/**
 * Infer trade direction from a pair of buy/sell timestamps. Used for broker
 * exports (Rithmic, Apex web export) that have separate "Buy Fill Time" and
 * "Sell Fill Time" columns but no explicit Buy/Sell flag.
 *
 *   buy fills first   → long  (entered with Buy, exited with Sell)
 *   sell fills first  → short (entered with Sell, exited with Buy)
 *   equal / empty     → empty string (caller treats as "unknown")
 */
export function inferBiasFromTimes(buyRaw: string, sellRaw: string): string {
  if (!buyRaw || !sellRaw) return "";
  const buyMs = Date.parse(buyRaw);
  const sellMs = Date.parse(sellRaw);
  if (!Number.isFinite(buyMs) || !Number.isFinite(sellMs)) return "";
  if (buyMs < sellMs) return "Bullish";
  if (sellMs < buyMs) return "Bearish";
  return "";
}

/**
 * Parse a date string into YYYY-MM-DD.
 * Returns null for empty input or strings that can't be parsed as a valid date.
 * locale controls MM/DD vs DD/MM for ambiguous slash-delimited dates.
 */
export function normalizeDate(s: string, locale: "us" | "eu" = "us"): string | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (slash) {
    const [, a, b] = slash;
    let y = slash[3];
    if (y.length === 2) y = "20" + y;
    const aN = parseInt(a, 10), bN = parseInt(b, 10);
    let mm: number, dd: number;
    if (aN > 12)      { mm = bN; dd = aN; }       // unambiguous: a must be day
    else if (bN > 12) { mm = aN; dd = bN; }       // unambiguous: b must be day
    else if (locale === "eu") { dd = aN; mm = bN; } // EU: DD/MM
    else              { mm = aN; dd = bN; }        // US default: MM/DD
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

/**
 * Derive the trading session (NY / London / Asia) from a datetime string.
 * Handles UTC timestamps correctly by converting to Eastern Time using the
 * Intl API so DST transitions (EDT -4 / EST -5) are applied accurately.
 */
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
  if (tz === "Z" || tz === "UTC" || tz === "+00:00") {
    // Convert UTC → Eastern Time via Intl so DST is respected
    const dateMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const utcMs = Date.UTC(
        parseInt(dateMatch[1], 10),
        parseInt(dateMatch[2], 10) - 1,
        parseInt(dateMatch[3], 10),
        hour, min
      );
      const etHourStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "numeric", hour12: false,
      }).format(utcMs);
      const etHour = parseInt(etHourStr, 10);
      hour = etHour === 24 ? 0 : etHour;
    } else {
      // No date in string — fall back to fixed -4 (EDT)
      hour = (hour - 4 + 24) % 24;
    }
  }
  const t = hour * 60 + min;
  if (t >= 570 && t < 960)  return "NY";
  if (t >= 180 && t < 510)  return "London";
  if (t >= 1200 || t < 120) return "Asia";
  return "";
}

/**
 * Strip futures contract month+year suffix so NQZ4 → NQ, ESH25 → ES, etc.
 * Month codes: F G H J K M N Q U V X Z
 * Leaves forex pairs, stock tickers, and crypto symbols unchanged.
 */
export function normaliseSymbol(pair: string): string {
  if (!pair) return pair;
  const upper = pair.toUpperCase().trim();
  // Standard CME/NYMEX format: NQZ4, ESH25, MESZ4, CLM4
  const m1 = upper.match(/^([A-Z]{1,5})[FGHJKMNQUVXZ]\d{1,2}$/);
  if (m1) return m1[1];
  // NinjaTrader 8 format: "NQ 03-25", "ES 12-24" (ROOT MM-YY)
  const m2 = upper.match(/^([A-Z]{1,5})\s+\d{2}-\d{2}$/);
  if (m2) return m2[1];
  return upper;
}

/** Returns true when a symbol value is a CSV summary/total row, not a real trade. */
export function isSummarySymbol(sym: string): boolean {
  const SUMMARY = new Set(["total", "total:", "subtotal", "subtotals", "sum", "grand total", "summary", "net"]);
  return SUMMARY.has(sym.trim().toLowerCase());
}

// ── Futures point value table ─────────────────────────────────────────────────

/**
 * Dollar value per 1.0 price-point move for common US futures contracts.
 * Keyed by normalised root symbol (after stripping contract month/year).
 */
export const FUTURES_POINT_VALUE: Record<string, number> = {
  // Equity index futures (CME)
  ES: 50,   MES: 5,    // E-mini / Micro E-mini S&P 500
  NQ: 20,   MNQ: 2,    // E-mini / Micro Nasdaq-100
  YM: 5,    MYM: 0.5,  // E-mini / Micro Dow Jones
  RTY: 50,  M2K: 5,    // E-mini / Micro Russell 2000
  // Treasury futures (CBOT)
  ZB: 1000, ZN: 1000, ZF: 1000, ZT: 2000,
  // Energy futures (NYMEX)
  CL: 1000, QM: 500,   // Crude Oil / Mini Crude
  NG: 10000, QG: 2500, // Natural Gas / Mini Natural Gas
  RB: 420,             // RBOB Gasoline (42,000 gal × $0.01)
  HO: 420,             // Heating Oil
  // Metals (COMEX)
  GC: 100,  MGC: 10,   // Gold / Micro Gold
  SI: 5000, SIL: 1000, // Silver / Micro Silver
  HG: 25000,           // Copper
  PL: 50, PA: 100,     // Platinum, Palladium
  // Agriculture (CBOT)
  ZC: 50, ZS: 50, ZW: 50, // Corn, Soybeans, Wheat ($0.01/bushel × 5000 bu)
  ZM: 100, ZL: 600,        // Soybean Meal, Soybean Oil
  // Soft commodities (ICE)
  CC: 10, KC: 375, CT: 500, SB: 1120, OJ: 150,
};

/**
 * Returns the dollar value of a 1.0 price-point move for the given symbol,
 * or null if the symbol is not in the table (forex, equities, crypto, etc.).
 */
export function getPointValue(symbol: string): number | null {
  const root = normaliseSymbol(symbol.toUpperCase().trim());
  return FUTURES_POINT_VALUE[root] ?? null;
}

/**
 * Compute dollar P&L for a futures trade from entry, exit, quantity, and bias.
 * Returns null when the symbol isn't a known futures contract, any numeric
 * input is null/zero/non-finite, or the inputs don't make arithmetic sense.
 *
 * The point-value table (FUTURES_POINT_VALUE) is the source of truth: a 1.0
 * price-point move on NQ is $20 per contract, on ES is $50, etc.
 *
 * bias: "Bullish" → long (+sign), "Bearish" → short (-sign), anything else →
 * assumed long. Most futures journals default to long; if the user's actual
 * trade was short and bias was missing, they'll see the wrong sign and can
 * correct it. The trade can also be edited manually after import.
 */
export function computePnlDollar(args: {
  symbol: string;
  entryPrice: number | null;
  exitPrice: number | null;
  qty: number | null;
  bias: string;
}): number | null {
  const { symbol, entryPrice, exitPrice, qty, bias } = args;
  const pointValue = getPointValue(symbol);
  if (pointValue === null) return null;
  if (entryPrice === null || exitPrice === null || qty === null) return null;
  if (qty <= 0) return null;
  const sign = bias === "Bearish" ? -1 : 1;
  const pnl = qty * (exitPrice - entryPrice) * pointValue * sign;
  return Number.isFinite(pnl) ? pnl : null;
}

// ── Dedup key for trade rows ──────────────────────────────────────────────────

function _djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Stable hash for deduping imported trades against the existing journal.
 *
 * When a broker emits a unique trade identifier (MT4/MT5 Ticket, Tradovate
 * Order ID, Rithmic Account+OrderRef) we use that alone — it is the only
 * collision-free option and is robust to commission/half-tick rounding.
 *
 * Otherwise we fall back to the four fields reliably present across every
 * broker export: date, pair (uppercased), entryPrice, pnl. Adding fields that
 * some brokers omit (slPrice, tpPrice, session) caused false positives.
 */
export function tradeKey(t: Partial<Trade>): string {
  const brokerId = (t.brokerId ?? "").trim();
  if (brokerId) return _djb2(`bid:${brokerId}`);
  const content = [
    t.date ?? "",
    (t.pair ?? "").toUpperCase(),
    t.entryPrice ?? "",
    t.pnl ?? "",
  ].join("|");
  return _djb2(content);
}
