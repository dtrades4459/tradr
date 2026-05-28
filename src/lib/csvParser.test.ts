// ═══════════════════════════════════════════════════════════════════════════════
// csvParser.test.ts — unit tests for CSV parsing + broker detection helpers
// Run with: npm test
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  parseCSV,
  detectDelimiter,
  autoDetectMapping,
  detectBroker,
  normalizeBias,
  normalizeOutcome,
  normalizeDate,
  parseNum,
  detectSessionFromDateStr,
} from "./csvParser";

// ── detectDelimiter ───────────────────────────────────────────────────────────

describe("detectDelimiter", () => {
  it("returns comma for standard CSV", () => {
    expect(detectDelimiter("Symbol,P&L,Date\nNQ,2.5,2024-01-01")).toBe(",");
  });

  it("returns tab for TSV (more tabs than commas)", () => {
    expect(detectDelimiter("Symbol\tP&L\tDate\nNQ\t2.5\t2024-01-01")).toBe("\t");
  });

  it("returns semicolon for European CSV", () => {
    // Decimal commas → semicolons used as column separator (FTMO, MT5, locale-Excel).
    expect(detectDelimiter("Symbol;P&L;Date\nNQ;2,5;2024-01-01")).toBe(";");
  });

  it("defaults to comma when no clear winner", () => {
    expect(detectDelimiter("abc")).toBe(",");
  });
});

// ── parseCSV ──────────────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses a basic 2-column CSV", () => {
    const { headers, rows } = parseCSV("Symbol,P&L\nNQ,2.5\nES,-1.0");
    expect(headers).toEqual(["Symbol", "P&L"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Symbol: "NQ", "P&L": "2.5" });
  });

  it("handles quoted fields containing commas", () => {
    const { rows } = parseCSV('Symbol,Notes\nNQ,"Good trade, held well"');
    expect(rows[0].Notes).toBe("Good trade, held well");
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    const { rows } = parseCSV('Symbol,Notes\nNQ,"She said ""hold"""');
    expect(rows[0].Notes).toBe('She said "hold"');
  });

  it("handles Windows CRLF line endings", () => {
    const { headers, rows } = parseCSV("Symbol,P&L\r\nNQ,2.5\r\nES,-1.0");
    expect(headers).toEqual(["Symbol", "P&L"]);
    expect(rows).toHaveLength(2);
  });

  it("skips blank lines", () => {
    const { rows } = parseCSV("Symbol,P&L\nNQ,2.5\n\nES,-1.0");
    expect(rows).toHaveLength(2);
  });

  it("returns empty result for empty input", () => {
    const result = parseCSV("");
    expect(result.headers).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
  });

  it("trims whitespace from header names", () => {
    const { headers } = parseCSV(" Symbol , P&L \nNQ,2.5");
    expect(headers).toEqual(["Symbol", "P&L"]);
  });

  it("strips UTF-8 BOM — Excel adds \\uFEFF to every CSV it exports", () => {
    // Without BOM stripping, the first header becomes "\uFEFFSymbol" and
    // auto-detection fails completely.
    const bom = "\uFEFF";
    const { headers, rows } = parseCSV(`${bom}Symbol,P&L\nNQ,2.5`);
    expect(headers[0]).toBe("Symbol"); // NOT "\uFEFFSymbol"
    expect(rows[0]["Symbol"]).toBe("NQ");
  });

  it("parses tab-separated files (TSV)", () => {
    const { headers, rows } = parseCSV("Symbol\tP&L\tDate\nNQ\t2.5\t2024-01-01");
    expect(headers).toEqual(["Symbol", "P&L", "Date"]);
    expect(rows[0]).toEqual({ Symbol: "NQ", "P&L": "2.5", Date: "2024-01-01" });
  });

  it("handles BOM + TSV together (some MT5 exports)", () => {
    const bom = "\uFEFF";
    const { headers } = parseCSV(`${bom}Symbol\tOpen Time\tClose Price\tVolume\nEURUSD\t2024-01-01 09:00\t1.0900\t0.1`);
    expect(headers[0]).toBe("Symbol");
  });
});

// ── detectBroker ──────────────────────────────────────────────────────────────

describe("detectBroker", () => {
  it("detects Tradovate from B/S + P&L headers", () => {
    expect(detectBroker(["Symbol", "B/S", "Buy Time", "P&L", "Buy Price"])).toBe("tradovate");
  });

  it("detects Rithmic from Buy Fill Price header", () => {
    expect(detectBroker(["Symbol", "Buy Fill Price", "Sell Fill Price", "Net P&L"])).toBe("rithmic");
  });

  it("detects NinjaTrader 8 from Instrument + Entry Time + Direction", () => {
    expect(detectBroker(["Instrument", "Entry Time", "Direction", "Profit"])).toBe("ninjatrader8");
  });

  it("detects TopstepX from Instrument + Entry Date + Net P&L", () => {
    expect(detectBroker(["Instrument", "Entry Date", "Net P&L", "Side"])).toBe("topstepx");
  });

  it("detects TradingView from Profit + Date/Time + Type", () => {
    expect(detectBroker(["Type", "Date/Time", "Price", "Profit"])).toBe("tradingview");
  });

  it("detects FTMO/MT5 from Open Time + Close Price + Volume", () => {
    expect(detectBroker(["Symbol", "Open Time", "Close Price", "Volume", "Profit"])).toBe("ftmo_mt5");
  });

  it("detects MT4 from Open Time + Stop Loss (no Close Price)", () => {
    expect(detectBroker(["Symbol", "Open Time", "S / L", "T / P"])).toBe("mt4");
  });

  it("returns null for unknown headers", () => {
    expect(detectBroker(["Date", "Asset", "Return"])).toBeNull();
  });
});

// ── autoDetectMapping ─────────────────────────────────────────────────────────

describe("autoDetectMapping", () => {
  it("maps standard Tradovate-style headers", () => {
    const m = autoDetectMapping(["Symbol", "Buy Time", "B/S", "P&L", "Buy Price"]);
    expect(m.pair).toBe("Symbol");
    expect(m.date).toBe("Buy Time");
    expect(m.pnl).toBe("P&L");
    expect(m.entryPrice).toBe("Buy Price");
  });

  it("maps generic headers", () => {
    const m = autoDetectMapping(["Date", "Instrument", "Direction", "Profit", "Entry Price"]);
    expect(m.pair).toBe("Instrument");
    expect(m.date).toBe("Date");
    expect(m.pnl).toBe("Profit");
    expect(m.entryPrice).toBe("Entry Price");
  });

  it("does not map the same column twice", () => {
    // "Symbol" should go to pair only, not also to something else
    const m = autoDetectMapping(["Symbol", "P&L"]);
    const values = Object.values(m);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });

  it("returns empty mapping for unrecognised headers", () => {
    const m = autoDetectMapping(["Foo", "Bar", "Baz"]);
    expect(Object.keys(m)).toHaveLength(0);
  });
});

// ── normalizeBias ─────────────────────────────────────────────────────────────

describe("normalizeBias", () => {
  it.each([
    ["Long", "Bullish"],
    ["long", "Bullish"],
    ["Buy", "Bullish"],
    ["bull", "Bullish"],
    ["Short", "Bearish"],
    ["sell", "Bearish"],
    ["bear", "Bearish"],
  ])("maps %s \u2192 %s", (input, expected) => {
    expect(normalizeBias(input)).toBe(expected);
  });

  it("returns empty string for unrecognised values", () => {
    expect(normalizeBias("hold")).toBe("");
    expect(normalizeBias("")).toBe("");
  });
});

// ── normalizeOutcome ──────────────────────────────────────────────────────────

describe("normalizeOutcome", () => {
  it("derives Win from positive P&L when outcome field is blank", () => {
    expect(normalizeOutcome("", 2.5)).toBe("Win");
  });

  it("derives Loss from negative P&L when outcome field is blank", () => {
    expect(normalizeOutcome("", -1.0)).toBe("Loss");
  });

  it("derives Breakeven when P&L is 0", () => {
    expect(normalizeOutcome("", 0)).toBe("Breakeven");
  });

  it("prefers explicit outcome text over P&L sign", () => {
    expect(normalizeOutcome("win", -1)).toBe("Win");
    expect(normalizeOutcome("loss", 1)).toBe("Loss");
    expect(normalizeOutcome("breakeven", 1)).toBe("Breakeven");
  });

  it("recognises TP Hit and SL Hit variants", () => {
    expect(normalizeOutcome("TP Hit", 0)).toBe("Win");
    expect(normalizeOutcome("SL Hit", 0)).toBe("Loss");
  });
});

// ── parseNum ──────────────────────────────────────────────────────────────────

describe("parseNum", () => {
  it("parses plain numbers", () => {
    expect(parseNum("2.5")).toBe(2.5);
    expect(parseNum("-100")).toBe(-100);
  });

  it("strips currency symbols and commas", () => {
    expect(parseNum("$1,250.50")).toBeCloseTo(1250.5);
  });

  it("converts parenthetical negatives", () => {
    expect(parseNum("(125.00)")).toBe(-125);
  });

  it("returns NaN for empty string", () => {
    expect(parseNum("")).toBeNaN();
  });
});

// ── normalizeDate ─────────────────────────────────────────────────────────────

describe("normalizeDate", () => {
  it("passes through ISO dates unchanged", () => {
    expect(normalizeDate("2024-03-15")).toBe("2024-03-15");
    expect(normalizeDate("2024-03-15T09:30:00")).toBe("2024-03-15");
  });

  it("converts MM/DD/YYYY to ISO", () => {
    expect(normalizeDate("03/15/2024")).toBe("2024-03-15");
  });

  it("converts 2-digit year", () => {
    expect(normalizeDate("03/15/24")).toBe("2024-03-15");
  });

  it("handles DD/MM/YYYY when day > 12 (unambiguous)", () => {
    expect(normalizeDate("25/03/2024")).toBe("2024-03-25");
  });

  it("returns null for empty input", () => {
    expect(normalizeDate("")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
  });
});

// ── detectSessionFromDateStr ──────────────────────────────────────────────────

describe("detectSessionFromDateStr", () => {
  it("detects NY session (09:45 ET)", () => {
    expect(detectSessionFromDateStr("2024-03-15 09:45:00")).toBe("NY");
  });

  it("detects London session (05:00 ET)", () => {
    expect(detectSessionFromDateStr("2024-03-15 05:00:00")).toBe("London");
  });

  it("detects Asia session (21:00 ET)", () => {
    expect(detectSessionFromDateStr("2024-03-15 21:00:00")).toBe("Asia");
  });

  it("adjusts UTC timestamps to ET (UTC 13:30 = 09:30 ET \u2192 NY)", () => {
    expect(detectSessionFromDateStr("2024-03-15T13:30:00Z")).toBe("NY");
  });

  it("returns empty string for unrecognised format", () => {
    expect(detectSessionFromDateStr("March 15")).toBe("");
    expect(detectSessionFromDateStr("")).toBe("");
  });
});
