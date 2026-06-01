// ═══════════════════════════════════════════════════════════════════════════════
// csvParser integration tests — parse real CSV fixtures end-to-end and verify
// that broker detection, field mapping, and normalization produce correct trade
// fields ready for import into the journal.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseCSV,
  detectBroker,
  autoDetectMapping,
  normalizeBias,
  normalizeOutcome,
  normalizeDate,
  normaliseSymbol,
  parseNum,
  detectSessionFromDateStr,
  findHeaderRowIndex,
  scoreHeaderRow,
  getPointValue,
  isSummarySymbol,
  mergeTradingViewStrategyRows,
} from "./csvParser";

/** Helper: load a fixture file from the __fixtures__ directory. */
function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "__fixtures__", name), "utf-8");
}

/** Apply the full mapping pipeline to a parsed row, just like CsvImportPanel does. */
function mapRow(
  row: Record<string, string>,
  mapping: Record<string, string>
): {
  pair: string;
  date: string | null;
  bias: string;
  outcome: string;
  pnl: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  qty: number | null;
  session: string;
} {
  const pnlRaw = mapping.pnl ? row[mapping.pnl] ?? "" : "";
  const pnl = parseNum(pnlRaw);
  return {
    pair: mapping.pair ? (row[mapping.pair] ?? "") : "",
    date: normalizeDate(mapping.date ? (row[mapping.date] ?? "") : ""),
    bias: normalizeBias(mapping.bias ? (row[mapping.bias] ?? "") : ""),
    outcome: normalizeOutcome(mapping.outcome ? (row[mapping.outcome] ?? "") : "", pnl ?? 0),
    pnl,
    entryPrice: parseNum(mapping.entryPrice ? (row[mapping.entryPrice] ?? "") : ""),
    exitPrice: parseNum(mapping.exitPrice ? (row[mapping.exitPrice] ?? "") : ""),
    qty: parseNum(mapping.qty ? (row[mapping.qty] ?? "") : ""),
    session: detectSessionFromDateStr(mapping.date ? (row[mapping.date] ?? "") : ""),
  };
}

// ── Tradovate fixture ────────────────────────────────────────────────────────

describe("Tradovate CSV integration", () => {
  const csv = loadFixture("tradovate-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("parses all 5 data rows", () => {
    expect(rows).toHaveLength(5);
  });

  it("detects broker as tradovate", () => {
    expect(detectBroker(headers)).toBe("tradovate");
  });

  it("auto-maps all expected fields", () => {
    const m = autoDetectMapping(headers);
    expect(m.pair).toBe("Symbol");
    expect(m.date).toBe("Buy Time");
    expect(m.pnl).toBe("P&L");
    expect(m.entryPrice).toBe("Buy Price");
    expect(m.qty).toBe("Qty");
  });

  it("maps first row (MES win) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[0], m);

    expect(trade.pair).toBe("MESZ4");
    expect(trade.date).toBe("2024-11-18");
    expect(trade.pnl).toBeCloseTo(41.25);
    expect(trade.entryPrice).toBeCloseTo(5920.25);
    expect(trade.outcome).toBe("Win");
    expect(trade.qty).toBe(1);
    expect(trade.session).toBe("NY");
  });

  it("maps third row (MES loss) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[2], m);

    expect(trade.pair).toBe("MESZ4");
    expect(trade.pnl).toBeCloseTo(-21.25);
    expect(trade.outcome).toBe("Loss");
  });

  it("maps fifth row (MNQ breakeven) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[4], m);

    expect(trade.pair).toBe("MNQZ4");
    expect(trade.pnl).toBeCloseTo(0);
    expect(trade.outcome).toBe("Breakeven");
  });
});

// ── Rithmic fixture ──────────────────────────────────────────────────────────

describe("Rithmic CSV integration", () => {
  const csv = loadFixture("rithmic-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("parses all 3 data rows", () => {
    expect(rows).toHaveLength(3);
  });

  it("detects broker as rithmic", () => {
    expect(detectBroker(headers)).toBe("rithmic");
  });

  it("auto-maps pair and pnl fields", () => {
    const m = autoDetectMapping(headers);
    expect(m.pair).toBe("Symbol");
    expect(m.pnl).toBe("Net P&L");
    expect(m.entryPrice).toBe("Buy Fill Price");
  });

  it("parses currency-formatted P&L correctly", () => {
    const m = autoDetectMapping(headers);
    const trade1 = mapRow(rows[0], m);
    const trade2 = mapRow(rows[1], m);

    // "$412.50" → 412.5
    expect(trade1.pnl).toBeCloseTo(412.5);
    expect(trade1.outcome).toBe("Win");

    // "($500.00)" → -500
    expect(trade2.pnl).toBeCloseTo(-500);
    expect(trade2.outcome).toBe("Loss");
  });

  it("detects session from timestamps", () => {
    const m = autoDetectMapping(headers);
    const trade1 = mapRow(rows[0], m);
    const trade3 = mapRow(rows[2], m);

    expect(trade1.session).toBe("NY"); // 09:35
    expect(trade3.session).toBe("NY"); // 13:05
  });
});

// ── NinjaTrader 8 fixture (with preamble) ────────────────────────────────────

describe("NinjaTrader 8 CSV integration (preamble detection)", () => {
  const csv = loadFixture("ninjatrader8-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("skips preamble rows and detects the real header", () => {
    // The header must contain 'Instrument', not the report title
    expect(headers).toContain("Instrument");
    expect(headers).toContain("Direction");
    expect(headers).toContain("Entry time");
    expect(headers).toContain("Net profit");
  });

  it("parses all 3 data rows (preamble rows excluded)", () => {
    expect(rows).toHaveLength(3);
  });

  it("detects broker as ninjatrader8", () => {
    expect(detectBroker(headers)).toBe("ninjatrader8");
  });

  it("maps first row (NQ long win) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[0], m);

    expect(normaliseSymbol(trade.pair)).toBe("NQ");
    expect(trade.date).toBe("2024-03-15");
    expect(trade.pnl).toBeCloseTo(1012.50);
    expect(trade.bias).toBe("Bullish");
    expect(trade.outcome).toBe("Win");
    expect(trade.session).toBe("NY"); // 9:31 AM
  });

  it("maps second row (ES short win) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[1], m);

    expect(normaliseSymbol(trade.pair)).toBe("ES");
    expect(trade.bias).toBe("Bearish");
    expect(trade.pnl).toBeCloseTo(312.50);
    expect(trade.outcome).toBe("Win");
  });

  it("maps third row (NQ loss) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[2], m);

    expect(trade.pnl).toBeCloseTo(-600.00);
    expect(trade.outcome).toBe("Loss");
  });
});

// ── MT4 fixture ──────────────────────────────────────────────────────────────

describe("MT4 CSV integration", () => {
  const csv = loadFixture("mt4-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("parses all 3 data rows", () => {
    expect(rows).toHaveLength(3);
  });

  it("detects broker as mt4", () => {
    expect(detectBroker(headers)).toBe("mt4");
  });

  it("auto-maps key fields", () => {
    const m = autoDetectMapping(headers);
    expect(m.pair).toBe("Symbol");
    expect(m.date).toBe("Open Time");
    expect(m.pnl).toBe("Profit");
    expect(m.entryPrice).toBe("Open Price");
    expect(m.slPrice).toBe("S / L");
    expect(m.tpPrice).toBe("T / P");
  });

  it("maps first row (EURUSD buy win) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[0], m);

    expect(trade.pair).toBe("EURUSD");
    expect(trade.date).toBe("2024-03-15");
    expect(trade.pnl).toBeCloseTo(27.0);
    expect(trade.bias).toBe("Bullish");
    expect(trade.outcome).toBe("Win");
  });

  it("maps third row (USDJPY loss) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[2], m);

    expect(trade.pnl).toBeCloseTo(-43.0);
    expect(trade.outcome).toBe("Loss");
  });

  it("parses MT4 dot-delimited dates correctly (EU locale)", () => {
    // MT4 exports "2024.03.15" format — should parse as 2024-03-15
    expect(normalizeDate("2024.03.15 09:31:00", "eu")).toBe("2024-03-15");
  });
});

// ── FTMO / MT5 fixture ───────────────────────────────────────────────────────

describe("FTMO / MT5 CSV integration", () => {
  const csv = loadFixture("ftmo-mt5-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("parses all 3 data rows", () => {
    expect(rows).toHaveLength(3);
  });

  it("detects broker as ftmo_mt5", () => {
    expect(detectBroker(headers)).toBe("ftmo_mt5");
  });

  it("auto-maps key fields", () => {
    const m = autoDetectMapping(headers);
    expect(m.pair).toBe("Symbol");
    expect(m.date).toBe("Open Time");
    expect(m.pnl).toBe("Profit");
  });

  it("maps first row (EURUSD win) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[0], m);

    expect(trade.pair).toBe("EURUSD");
    expect(trade.pnl).toBeCloseTo(27.0);
    expect(trade.outcome).toBe("Win");
    expect(trade.bias).toBe("Bullish");
  });
});

// ── TradingView fixture ──────────────────────────────────────────────────────

// The tradingview-export.csv fixture is a Strategy Tester file (has "Trade #",
// no "Symbol" column) — detectBroker correctly returns "tradingview_st".
describe("TradingView Strategy Tester CSV integration", () => {
  const csv = loadFixture("tradingview-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("detects broker as tradingview_st (Strategy Tester — no Symbol column)", () => {
    expect(detectBroker(headers)).toBe("tradingview_st");
  });

  it("auto-maps key fields from raw Strategy Tester headers", () => {
    const m = autoDetectMapping(headers);
    expect(m.date).toBe("Date/Time");
    expect(m.pnl).toBe("Profit");
    expect(m.bias).toBe("Type");
  });

  it("mergeTradingViewStrategyRows produces 3 merged trades", () => {
    const merged = mergeTradingViewStrategyRows(rows, "NQ");
    expect(merged).toHaveLength(3);
  });

  it("merged trade 1: entry price, exit price, P&L, Long bias", () => {
    const [t1] = mergeTradingViewStrategyRows(rows, "NQ");
    expect(t1["Symbol"]).toBe("NQ");
    expect(t1["Entry Price"]).toBe("18250.50");
    expect(t1["Exit Price"]).toBe("18283.00");
    expect(parseNum(t1["Profit"])).toBeCloseTo(650.0);
    expect(t1["Type"]).toBe("Long");
  });

  it("merged trade 3 (loss): P&L is negative", () => {
    const merged = mergeTradingViewStrategyRows(rows, "NQ");
    const t3 = merged[2];
    expect(parseNum(t3["Profit"])).toBeCloseTo(-300.0);
  });

  it("maps exit rows with pnl via raw row (pre-merge, validates Profit column)", () => {
    const m = autoDetectMapping(headers);
    const exitRow = rows.find(r => (r["Profit"] || "") !== "" && parseNum(r["Profit"] || "") !== 0);
    if (exitRow) {
      const trade = mapRow(exitRow, m);
      expect(trade.pnl).toBeCloseTo(650.0);
      expect(trade.outcome).toBe("Win");
    }
  });
});

// ── TopstepX fixture ─────────────────────────────────────────────────────────

describe("TopstepX CSV integration", () => {
  const csv = loadFixture("topstepx-export.csv");
  const { headers, rows } = parseCSV(csv);

  it("parses all 3 data rows", () => {
    expect(rows).toHaveLength(3);
  });

  it("detects broker as topstepx", () => {
    expect(detectBroker(headers)).toBe("topstepx");
  });

  it("auto-maps key fields", () => {
    const m = autoDetectMapping(headers);
    expect(m.pair).toBe("Instrument");
    expect(m.date).toBe("Entry Date");
    expect(m.pnl).toBe("Net P&L");
    expect(m.bias).toBe("Side");
  });

  it("maps first row (NQ long win) correctly", () => {
    const m = autoDetectMapping(headers);
    const trade = mapRow(rows[0], m);

    expect(trade.pair).toBe("NQ");
    expect(trade.date).toBe("2024-03-15");
    expect(trade.pnl).toBeCloseTo(962.50);
    expect(trade.bias).toBe("Bullish");
    expect(trade.session).toBe("NY");
  });
});

// ── Preamble detection unit tests ────────────────────────────────────────────

describe("findHeaderRowIndex / preamble detection", () => {
  it("returns 0 for a normal CSV with no preamble", () => {
    const lines = [
      ["Symbol", "Date", "P&L", "Direction"],
      ["NQ", "2024-03-15", "500", "Long"],
    ];
    expect(findHeaderRowIndex(lines)).toBe(0);
  });

  it("skips a single-cell title row", () => {
    const lines = [
      ["NinjaTrader Account Performance Report"],
      ["Instrument", "Direction", "Entry time", "Net profit"],
      ["NQ 03-25", "Long", "3/15/2024 9:31 AM", "1012.50"],
    ];
    expect(findHeaderRowIndex(lines)).toBe(1);
  });

  it("skips multiple preamble rows", () => {
    const lines = [
      ["Account Statement Export"],
      ["Account: SIM101"],
      ["Symbol", "Open Time", "Profit", "Direction", "Volume"],
      ["EURUSD", "2024.03.15 09:31:00", "27.00", "buy", "0.10"],
    ];
    expect(findHeaderRowIndex(lines)).toBe(2);
  });

  it("scoreHeaderRow gives a higher score to header-like rows", () => {
    const titleScore = scoreHeaderRow(["NinjaTrader Account Performance Report for SIM101"]);
    const headerScore = scoreHeaderRow(["Instrument", "Direction", "Entry time", "Net profit"]);
    expect(headerScore).toBeGreaterThan(titleScore);
  });
});

// ── normaliseSymbol unit tests ────────────────────────────────────────────────

describe("normaliseSymbol", () => {
  it("strips month+year from standard futures codes", () => {
    expect(normaliseSymbol("NQZ4")).toBe("NQ");
    expect(normaliseSymbol("ESH25")).toBe("ES");
    expect(normaliseSymbol("CLM4")).toBe("CL");
    expect(normaliseSymbol("GCQ24")).toBe("GC");
    expect(normaliseSymbol("MESZ4")).toBe("MES");
    expect(normaliseSymbol("MNQH25")).toBe("MNQ");
    // Single-digit year codes (CME current convention)
    expect(normaliseSymbol("NQH5")).toBe("NQ");
    expect(normaliseSymbol("ESM5")).toBe("ES");
    expect(normaliseSymbol("MNQU5")).toBe("MNQ");
    expect(normaliseSymbol("CLZ5")).toBe("CL");
  });

  it("leaves forex pairs unchanged", () => {
    expect(normaliseSymbol("EURUSD")).toBe("EURUSD");
    expect(normaliseSymbol("GBPJPY")).toBe("GBPJPY");
    expect(normaliseSymbol("USDJPY")).toBe("USDJPY");
  });

  it("leaves stock tickers unchanged", () => {
    expect(normaliseSymbol("AAPL")).toBe("AAPL");
    expect(normaliseSymbol("TSLA")).toBe("TSLA");
    expect(normaliseSymbol("SPY")).toBe("SPY");
  });

  it("leaves crypto unchanged", () => {
    expect(normaliseSymbol("BTCUSD")).toBe("BTCUSD");
  });

  it("handles lowercase input", () => {
    expect(normaliseSymbol("nqz4")).toBe("NQ");
    expect(normaliseSymbol("eurusd")).toBe("EURUSD");
  });
});

// ── getPointValue unit tests ──────────────────────────────────────────────────

describe("getPointValue", () => {
  it("returns correct values for common futures", () => {
    expect(getPointValue("ES")).toBe(50);
    expect(getPointValue("NQ")).toBe(20);
    expect(getPointValue("MES")).toBe(5);
    expect(getPointValue("MNQ")).toBe(2);
    expect(getPointValue("CL")).toBe(1000);
    expect(getPointValue("GC")).toBe(100);
  });

  it("normalises contract codes before lookup", () => {
    expect(getPointValue("NQZ4")).toBe(20);
    expect(getPointValue("ESH25")).toBe(50);
    expect(getPointValue("CLM4")).toBe(1000);
  });

  it("returns null for forex, stocks, and crypto", () => {
    expect(getPointValue("EURUSD")).toBeNull();
    expect(getPointValue("AAPL")).toBeNull();
    expect(getPointValue("BTCUSD")).toBeNull();
  });
});

// ── isSummarySymbol unit tests ────────────────────────────────────────────────

describe("isSummarySymbol", () => {
  it("identifies summary rows", () => {
    expect(isSummarySymbol("TOTAL")).toBe(true);
    expect(isSummarySymbol("total:")).toBe(true);
    expect(isSummarySymbol("Subtotal")).toBe(true);
    expect(isSummarySymbol("Grand Total")).toBe(true);
    expect(isSummarySymbol("Net")).toBe(true);
  });

  it("does not flag real symbols", () => {
    expect(isSummarySymbol("NQ")).toBe(false);
    expect(isSummarySymbol("EURUSD")).toBe(false);
    expect(isSummarySymbol("ES")).toBe(false);
  });

  it("handles whitespace and mixed case", () => {
    expect(isSummarySymbol("  TOTAL  ")).toBe(true);
    expect(isSummarySymbol("Total")).toBe(true);
    expect(isSummarySymbol("subTOTAL")).toBe(true);
  });

  it("does not flag symbols that contain summary substrings", () => {
    // 'TOTAL' is a summary row, but 'TOTALES' or 'NETFLIX' are not.
    expect(isSummarySymbol("TOTALES")).toBe(false);
    expect(isSummarySymbol("NETFLIX")).toBe(false);
  });
});
