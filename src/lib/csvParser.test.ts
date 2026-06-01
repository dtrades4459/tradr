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
  tradeKey,
  computePnlDollar,
  decimalSeparatorForDelimiter,
  inferBiasFromTimes,
  normaliseSymbol,
  isTradingViewStrategyTester,
  mergeTradingViewStrategyRows,
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

  it("returns null for empty string", () => {
    expect(parseNum("")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseNum("abc")).toBeNull();
    expect(parseNum("---")).toBeNull();
  });

  // ── EU decimal handling (CSV_IMPORT_AUDIT critical risk) ─────────────────
  // Without this, "27,50" silently became 2750 — a 100× error.
  describe("EU decimal handling", () => {
    it("auto: treats single comma + 1-2 digits after as decimal", () => {
      expect(parseNum("27,50")).toBe(27.5);
      expect(parseNum("27,5")).toBe(27.5);
      expect(parseNum("-27,50")).toBe(-27.5);
    });

    it("auto: treats single comma + exactly 3 digits as thousands", () => {
      expect(parseNum("1,234")).toBe(1234);
      expect(parseNum("27,500")).toBe(27500);
    });

    it("auto: treats multiple commas as thousands separators", () => {
      expect(parseNum("1,234,567")).toBe(1234567);
      expect(parseNum("1,234,567.89")).toBe(1234567.89);
    });

    it("auto: picks rightmost separator as decimal when both present", () => {
      expect(parseNum("1,234.56")).toBe(1234.56);     // US
      expect(parseNum("1.234,56")).toBe(1234.56);     // EU
      expect(parseNum("$1.234,56")).toBe(1234.56);    // EU with currency
    });

    it("auto: handles whitespace as a thousands separator", () => {
      expect(parseNum("1 234,56")).toBe(1234.56);     // EU with space
      expect(parseNum("1 234.56")).toBe(1234.56);     // US with space
    });

    it("explicit decimalSeparator ',' forces EU interpretation", () => {
      expect(parseNum("1,234", { decimalSeparator: "," })).toBe(1.234);
      expect(parseNum("27,500", { decimalSeparator: "," })).toBe(27.5);
    });

    it("explicit decimalSeparator '.' forces US interpretation", () => {
      expect(parseNum("27,50", { decimalSeparator: "." })).toBe(2750);
      expect(parseNum("1,234", { decimalSeparator: "." })).toBe(1234);
    });
  });
});

// ── decimalSeparatorForDelimiter ─────────────────────────────────────────────

describe("decimalSeparatorForDelimiter", () => {
  it("maps ';' to ',' (EU exports)", () => {
    expect(decimalSeparatorForDelimiter(";")).toBe(",");
  });

  it("leaves comma and tab files on 'auto'", () => {
    expect(decimalSeparatorForDelimiter(",")).toBe("auto");
    expect(decimalSeparatorForDelimiter("\t")).toBe("auto");
  });
});

// ── inferBiasFromTimes (Rithmic/Apex side inference) ─────────────────────────

describe("inferBiasFromTimes", () => {
  it("buy before sell → Bullish (long)", () => {
    expect(inferBiasFromTimes("2024-11-18 09:35:00", "2024-11-18 09:52:00")).toBe("Bullish");
  });

  it("sell before buy → Bearish (short)", () => {
    expect(inferBiasFromTimes("2024-11-18 10:30:00", "2024-11-18 10:10:00")).toBe("Bearish");
  });

  it("simultaneous → empty (cannot decide)", () => {
    expect(inferBiasFromTimes("2024-11-18 10:00:00", "2024-11-18 10:00:00")).toBe("");
  });

  it("missing or unparseable input → empty", () => {
    expect(inferBiasFromTimes("", "2024-11-18 10:30:00")).toBe("");
    expect(inferBiasFromTimes("2024-11-18 10:30:00", "")).toBe("");
    expect(inferBiasFromTimes("nope", "also nope")).toBe("");
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

// ── tradeKey ──────────────────────────────────────────────────────────────────

describe("tradeKey", () => {
  const base = { date: "2024-03-15", pair: "NQ", entryPrice: "18250.25", pnl: "412.50" };

  it("returns the same key for identical core fields", () => {
    expect(tradeKey(base)).toBe(tradeKey({ ...base }));
  });

  it("returns the same key when pair case differs", () => {
    expect(tradeKey({ ...base, pair: "nq" })).toBe(tradeKey({ ...base, pair: "NQ" }));
  });

  it("changes when date changes", () => {
    expect(tradeKey({ ...base, date: "2024-03-16" })).not.toBe(tradeKey(base));
  });

  it("changes when pair changes", () => {
    expect(tradeKey({ ...base, pair: "ES" })).not.toBe(tradeKey(base));
  });

  it("changes when entryPrice changes", () => {
    expect(tradeKey({ ...base, entryPrice: "18250.50" })).not.toBe(tradeKey(base));
  });

  it("changes when pnl changes", () => {
    expect(tradeKey({ ...base, pnl: "412.51" })).not.toBe(tradeKey(base));
  });

  it("ignores session, slPrice, tpPrice, notes (day-1 false-positive fix)", () => {
    const noisy = { ...base, session: "NY", slPrice: "18240", tpPrice: "18280", notes: "felt strong" };
    expect(tradeKey(noisy)).toBe(tradeKey(base));
  });

  it("handles missing fields without throwing", () => {
    expect(tradeKey({})).toBeTypeOf("string");
    expect(tradeKey({ date: "2024-03-15" })).toBeTypeOf("string");
  });

  it("is collision-resistant within reasonable input space (sanity)", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      keys.add(tradeKey({ date: "2024-03-15", pair: "NQ", entryPrice: String(18250 + i), pnl: "100" }));
    }
    expect(keys.size).toBe(1000);
  });

  // ── brokerId preference (Batch 4a) ───────────────────────────────────────
  describe("brokerId preference", () => {
    it("uses brokerId alone when present (other fields irrelevant)", () => {
      const a = tradeKey({ ...base, brokerId: "TIK-42" });
      const b = tradeKey({ ...base, pair: "ES", entryPrice: "99", pnl: "0", brokerId: "TIK-42" });
      expect(a).toBe(b);
    });

    it("different brokerId produces a different key", () => {
      const a = tradeKey({ ...base, brokerId: "TIK-42" });
      const b = tradeKey({ ...base, brokerId: "TIK-43" });
      expect(a).not.toBe(b);
    });

    it("brokerId-keyed differs from composite-keyed even on identical fields", () => {
      // Guards against accidental overlap between hash families.
      const withId = tradeKey({ ...base, brokerId: "TIK-42" });
      const withoutId = tradeKey(base);
      expect(withId).not.toBe(withoutId);
    });

    it("whitespace-only brokerId is treated as absent", () => {
      expect(tradeKey({ ...base, brokerId: "   " })).toBe(tradeKey(base));
    });
  });
});

// ── computePnlDollar ──────────────────────────────────────────────────────────

describe("computePnlDollar", () => {
  it("computes a long NQ win correctly", () => {
    // 1 contract NQ, 20pt move up, $20 per point = $400
    expect(computePnlDollar({
      symbol: "NQ", entryPrice: 18250, exitPrice: 18270, qty: 1, bias: "Bullish",
    })).toBe(400);
  });

  it("computes a short ES win correctly", () => {
    // 2 contracts ES, 5pt move down (short = profit), $50 per point × 2 = $500
    expect(computePnlDollar({
      symbol: "ES", entryPrice: 5800, exitPrice: 5795, qty: 2, bias: "Bearish",
    })).toBe(500);
  });

  it("computes a long MES loss correctly", () => {
    // 1 contract MES, 4pt move down, $5 per point = -$20
    expect(computePnlDollar({
      symbol: "MES", entryPrice: 5800, exitPrice: 5796, qty: 1, bias: "Bullish",
    })).toBe(-20);
  });

  it("normalises contract codes (NQH5 → NQ) before lookup", () => {
    expect(computePnlDollar({
      symbol: "NQH5", entryPrice: 18250, exitPrice: 18260, qty: 1, bias: "Bullish",
    })).toBe(200);
  });

  it("defaults to long when bias is empty", () => {
    expect(computePnlDollar({
      symbol: "NQ", entryPrice: 18250, exitPrice: 18260, qty: 1, bias: "",
    })).toBe(200);
  });

  it("returns null for unknown symbols (forex, stocks, crypto)", () => {
    expect(computePnlDollar({
      symbol: "EURUSD", entryPrice: 1.08, exitPrice: 1.09, qty: 1, bias: "Bullish",
    })).toBeNull();
    expect(computePnlDollar({
      symbol: "AAPL", entryPrice: 180, exitPrice: 185, qty: 100, bias: "Bullish",
    })).toBeNull();
  });

  it("returns null when any numeric input is null", () => {
    const base = { symbol: "NQ", entryPrice: 18250, exitPrice: 18270, qty: 1, bias: "Bullish" };
    expect(computePnlDollar({ ...base, entryPrice: null })).toBeNull();
    expect(computePnlDollar({ ...base, exitPrice: null })).toBeNull();
    expect(computePnlDollar({ ...base, qty: null })).toBeNull();
  });

  it("returns null when qty is zero or negative", () => {
    expect(computePnlDollar({
      symbol: "NQ", entryPrice: 18250, exitPrice: 18270, qty: 0, bias: "Bullish",
    })).toBeNull();
    expect(computePnlDollar({
      symbol: "NQ", entryPrice: 18250, exitPrice: 18270, qty: -1, bias: "Bullish",
    })).toBeNull();
  });
});

// ── normaliseSymbol ───────────────────────────────────────────────────────────

describe("normaliseSymbol", () => {
  it.each([
    ["NQZ4",          "NQ"],
    ["ESH25",         "ES"],
    ["MESZ4",         "MES"],
    ["MNQZ4",         "MNQ"],
    ["CLM4",          "CL"],
    ["GCQ24",         "GC"],
  ])("strips CME contract suffix: %s → %s", (input, expected) => {
    expect(normaliseSymbol(input)).toBe(expected);
  });

  it.each([
    ["NQ 03-25",  "NQ"],
    ["ES 12-24",  "ES"],
    ["MES 06-25", "MES"],
  ])("strips NinjaTrader 8 space format: %s → %s", (input, expected) => {
    expect(normaliseSymbol(input)).toBe(expected);
  });

  it.each([
    ["NASDAQ:NQ1!",    "NQ"],
    ["CME:ES1!",       "ES"],
    ["NQ1!",           "NQ"],
    ["FOREXCOM:EURUSD","EURUSD"],
  ])("strips TradingView exchange prefix and continuous marker: %s → %s", (input, expected) => {
    expect(normaliseSymbol(input)).toBe(expected);
  });

  it("leaves clean tickers unchanged", () => {
    expect(normaliseSymbol("EURUSD")).toBe("EURUSD");
    expect(normaliseSymbol("AAPL")).toBe("AAPL");
    expect(normaliseSymbol("BTCUSDT")).toBe("BTCUSDT");
  });

  it("is case-insensitive", () => {
    expect(normaliseSymbol("nqz4")).toBe("NQ");
    expect(normaliseSymbol("esH25")).toBe("ES");
  });

  it("returns empty string for empty input", () => {
    expect(normaliseSymbol("")).toBe("");
  });
});

// ── isTradingViewStrategyTester ───────────────────────────────────────────────

describe("isTradingViewStrategyTester", () => {
  const ST_HEADERS = ["Trade #", "Type", "Signal", "Date/Time", "Price", "Contracts", "Profit"];

  it("detects Strategy Tester headers", () => {
    expect(isTradingViewStrategyTester(ST_HEADERS)).toBe(true);
  });

  it("rejects when Symbol column is present", () => {
    expect(isTradingViewStrategyTester(["Symbol", ...ST_HEADERS])).toBe(false);
  });

  it("rejects when Trade # is missing", () => {
    expect(isTradingViewStrategyTester(["Type", "Signal", "Date/Time", "Price"])).toBe(false);
  });

  it("accepts DateTime column variant", () => {
    const variant = ST_HEADERS.map(h => h === "Date/Time" ? "DateTime" : h);
    expect(isTradingViewStrategyTester(variant)).toBe(true);
  });

  it("is case-insensitive for header matching", () => {
    const lower = ST_HEADERS.map(h => h.toLowerCase());
    expect(isTradingViewStrategyTester(lower)).toBe(true);
  });
});

// ── mergeTradingViewStrategyRows ──────────────────────────────────────────────

describe("mergeTradingViewStrategyRows", () => {
  // Mirror of the tradingview-export.csv fixture (3 round-trips, 6 rows)
  const TV_ROWS: Record<string, string>[] = [
    { "Trade #": "1", "Type": "Entry Long",  "Date/Time": "2024-03-15T14:31:00+00:00", "Price": "18250.50", "Contracts": "1", "Profit": "",        "Run-up": "650.00",  "Drawdown": "125.00" },
    { "Trade #": "1", "Type": "Exit Long",   "Date/Time": "2024-03-15T14:45:00+00:00", "Price": "18283.00", "Contracts": "1", "Profit": "650.00",  "Run-up": "",        "Drawdown": "" },
    { "Trade #": "2", "Type": "Entry Short", "Date/Time": "2024-03-15T15:10:00+00:00", "Price": "18310.00", "Contracts": "1", "Profit": "",        "Run-up": "200.00",  "Drawdown": "450.00" },
    { "Trade #": "2", "Type": "Exit Short",  "Date/Time": "2024-03-15T15:35:00+00:00", "Price": "18287.50", "Contracts": "1", "Profit": "450.00",  "Run-up": "",        "Drawdown": "" },
    { "Trade #": "3", "Type": "Entry Long",  "Date/Time": "2024-03-18T14:45:00+00:00", "Price": "18180.00", "Contracts": "1", "Profit": "",        "Run-up": "-300.00", "Drawdown": "600.00" },
    { "Trade #": "3", "Type": "Exit Long",   "Date/Time": "2024-03-18T15:15:00+00:00", "Price": "18165.00", "Contracts": "1", "Profit": "-300.00", "Run-up": "",        "Drawdown": "" },
  ];

  it("merges 6 rows into 3 trades", () => {
    expect(mergeTradingViewStrategyRows(TV_ROWS, "NQ")).toHaveLength(3);
  });

  it("injects the supplied symbol", () => {
    const merged = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(merged.every(r => r["Symbol"] === "NQ")).toBe(true);
  });

  it("maps entry price from Entry row", () => {
    const [t1, t2, t3] = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(t1["Entry Price"]).toBe("18250.50");
    expect(t2["Entry Price"]).toBe("18310.00");
    expect(t3["Entry Price"]).toBe("18180.00");
  });

  it("maps exit price from Exit row", () => {
    const [t1, t2, t3] = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(t1["Exit Price"]).toBe("18283.00");
    expect(t2["Exit Price"]).toBe("18287.50");
    expect(t3["Exit Price"]).toBe("18165.00");
  });

  it("maps P&L from Exit row", () => {
    const [t1, t2, t3] = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(t1["Profit"]).toBe("650.00");
    expect(t2["Profit"]).toBe("450.00");
    expect(t3["Profit"]).toBe("-300.00");
  });

  it("sets Type to Long / Short from entry row", () => {
    const [t1, t2] = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(t1["Type"]).toBe("Long");
    expect(t2["Type"]).toBe("Short");
  });

  it("uses entry Date/Time as the trade timestamp", () => {
    const [t1] = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(t1["Date/Time"]).toBe("2024-03-15T14:31:00+00:00");
  });

  it("dates normalise to non-today values", () => {
    const today = new Date().toISOString().split("T")[0];
    const merged = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    for (const row of merged) {
      expect(normalizeDate(row["Date/Time"])).not.toBe(today);
    }
  });

  it("preserves insertion order (trade 1 first, 3 last)", () => {
    const merged = mergeTradingViewStrategyRows(TV_ROWS, "NQ");
    expect(merged[0]["Entry Price"]).toBe("18250.50");
    expect(merged[2]["Entry Price"]).toBe("18180.00");
  });

  it("handles empty input without throwing", () => {
    expect(mergeTradingViewStrategyRows([], "NQ")).toHaveLength(0);
  });

  it("flags open positions (entry without exit) with __openPosition marker", () => {
    const OPEN_ROWS: Record<string, string>[] = [
      ...TV_ROWS,
      { "Trade #": "4", "Type": "Entry Long", "Date/Time": "2024-03-18T16:00:00+00:00", "Price": "18170.00", "Contracts": "1", "Profit": "", "Run-up": "", "Drawdown": "" },
    ];
    const merged = mergeTradingViewStrategyRows(OPEN_ROWS, "NQ");
    expect(merged).toHaveLength(4);
    const open = merged.find(r => r["__openPosition"] === "1");
    expect(open).toBeDefined();
    expect(open!["Entry Price"]).toBe("18170.00");
    expect(open!["Exit Price"]).toBe("");
    // Closed trades shouldn't carry the marker
    expect(merged.filter(r => r["__openPosition"] === "1")).toHaveLength(1);
  });

  it("works end-to-end from parseCSV output", () => {
    const csv = `Trade #,Type,Signal,Date/Time,Price,Contracts,Profit,Run-up,Drawdown
1,Entry Long,Long Entry,2024-03-15T14:31:00+00:00,18250.50,1,,650.00,125.00
1,Exit Long,Long Exit,2024-03-15T14:45:00+00:00,18283.00,1,650.00,,
2,Entry Short,Short Entry,2024-03-15T15:10:00+00:00,18310.00,1,,200.00,450.00
2,Exit Short,Short Exit,2024-03-15T15:35:00+00:00,18287.50,1,450.00,,`;
    const { headers, rows } = parseCSV(csv);
    expect(isTradingViewStrategyTester(headers)).toBe(true);
    const merged = mergeTradingViewStrategyRows(rows, "ES");
    expect(merged).toHaveLength(2);
    expect(merged[0]["Symbol"]).toBe("ES");
    expect(parseNum(merged[0]["Profit"])).toBe(650);
    expect(parseNum(merged[1]["Profit"])).toBe(450);
  });
});

// ── normalizeDate extended formats ────────────────────────────────────────────

describe("normalizeDate extended formats", () => {
  it("parses compact YYYYMMDD: 20240315 → 2024-03-15", () => {
    expect(normalizeDate("20240315")).toBe("2024-03-15");
  });

  it("parses 'Mar 15, 2024'", () => {
    expect(normalizeDate("Mar 15, 2024")).toBe("2024-03-15");
  });

  it("parses 'March 15 2024'", () => {
    expect(normalizeDate("March 15 2024")).toBe("2024-03-15");
  });

  it("parses '15 Mar 2024'", () => {
    expect(normalizeDate("15 Mar 2024")).toBe("2024-03-15");
  });

  it("parses ISO with timezone offset", () => {
    expect(normalizeDate("2024-03-15T14:31:00+00:00")).toBe("2024-03-15");
  });

  it("parses dot-separated EU: 15.03.2024", () => {
    expect(normalizeDate("15.03.2024", "eu")).toBe("2024-03-15");
  });
});
