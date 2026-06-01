import { useState } from "react";
import type React from "react";
import readXlsxFile from "read-excel-file/browser";
import { MONO, BODY } from "./shared";
import type { Trade } from "./types";
import type { Theme } from "./theme";
import {
  parseCSV,
  autoDetectMapping,
  detectBroker,
  detectSessionFromDateStr,
  normalizeBias,
  normalizeOutcome,
  parseNum,
  normalizeDate,
  normaliseSymbol,
  isSummarySymbol,
  tradeKey,
  computePnlDollar,
  decimalSeparatorForDelimiter,
  inferBiasFromTimes,
  mergeTradingViewStrategyRows,
} from "./lib/csvParser";
import { calcRR } from "./lib/stats";
import { persistImport } from "./lib/imports";

interface RowContext {
  /** Decimal separator hint derived from the file's column delimiter. */
  decimalSeparator: "," | "." | "auto";
  /** Columns used to infer Bullish/Bearish from buy/sell timestamps when no Side column exists. */
  biasInferenceColumns?: { buyTime: string; sellTime: string };
  /** Column holding a broker-supplied unique trade/order ID (used as the preferred dedup key). */
  brokerIdColumn?: string;
}

function rowToTrade(
  row: Record<string, string>,
  mapping: Record<string, string>,
  defaultStrategy: string,
  dateLocale: "us" | "eu",
  defaultAccountType: Trade["accountType"],
  ctx: RowContext,
): Trade | null {
  const sepOpts = { decimalSeparator: ctx.decimalSeparator } as const;
  const get = (f: string) => mapping[f] ? row[mapping[f]] : "";
  const rawDate = get("date");
  const date = normalizeDate(rawDate, dateLocale);
  const pair = normaliseSymbol((get("pair") || "").toUpperCase());

  // Reject rows with no parseable date or no symbol — they're summary/header rows
  if (!date || !pair) return null;

  const pnl = parseNum(get("pnl"), sepOpts);
  const qty = parseNum(get("qty"), sepOpts);
  const session = get("session") || detectSessionFromDateStr(rawDate);
  const entryPrice = get("entryPrice");
  const exitPrice = get("exitPrice");
  const slPrice = get("slPrice");
  const tpPrice = get("tpPrice");

  // Direction: prefer explicit Side/B-S column when mapped. For broker formats
  // that omit it (Rithmic / Apex web export) fall back to comparing buy/sell
  // timestamps so shorts aren't silently logged as longs.
  let bias = normalizeBias(get("bias"));
  if (!bias && ctx.biasInferenceColumns) {
    const buyRaw = row[ctx.biasInferenceColumns.buyTime] ?? "";
    const sellRaw = row[ctx.biasInferenceColumns.sellTime] ?? "";
    bias = inferBiasFromTimes(buyRaw, sellRaw);
  }

  // Trust the broker's net P&L when it provided one — it bakes in commissions,
  // partial fills, and tick rounding. Only recompute from entry × exit × tick
  // value when the broker omitted P&L entirely.
  const pnlDollarStr = (() => {
    if (pnl !== null) return pnl.toFixed(2);
    const dollars = computePnlDollar({
      symbol: pair,
      entryPrice: parseNum(entryPrice, sepOpts),
      exitPrice: parseNum(exitPrice, sepOpts),
      qty,
      bias,
    });
    return dollars === null ? "" : dollars.toFixed(2);
  })();

  const brokerId = ctx.brokerIdColumn ? (row[ctx.brokerIdColumn] ?? "").trim() : "";

  const trade: Trade = {
    id: Date.now() * 1000 + Math.floor(Math.random() * 999),
    date,
    pair,
    session,
    bias,
    // direction mirrors bias so imported trades render the LONG/SHORT pill
    // alongside manually-logged ones (Koda.tsx renders the pill from t.direction).
    direction: bias === "Bullish" ? "Long" : bias === "Bearish" ? "Short" : "",
    strategy: defaultStrategy || "",
    setup: "",
    entryPrice,
    slPrice,
    tpPrice,
    rr: get("rr") || (entryPrice && slPrice && tpPrice ? calcRR(entryPrice, slPrice, tpPrice) : ""),
    outcome: normalizeOutcome(get("outcome"), pnl ?? 0),
    pnl: pnl === null ? "" : pnl.toFixed(2),
    notes: get("notes"),
    emotions: "",
    screenshot: "",
    pnlDollar: pnlDollarStr,
    comments: [],
    reactions: {},
    source: "csv_import",
    accountType: defaultAccountType,
    ...(brokerId ? { brokerId } : {}),
  };
  return trade;
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
interface ImportStats {
  tradeCount: number;
  withPnl: number;
  totalPnl: number | null;
  winRate: number | null;
  profitFactor: number | null;
  avgRR: number | null;
  best: number | null;
  worst: number | null;
  sessionBreakdown: Record<string, number>;
}

function computeImportStats(trades: Trade[]): ImportStats {
  const withPnl = trades.filter(t => t.pnl !== "" && !isNaN(parseFloat(t.pnl)));
  const totalPnl = withPnl.length ? withPnl.reduce((s, t) => s + parseFloat(t.pnl), 0) : null;
  const wins = withPnl.filter(t => parseFloat(t.pnl) > 0);
  const losses = withPnl.filter(t => parseFloat(t.pnl) < 0);
  const winRate = withPnl.length ? (wins.length / withPnl.length) * 100 : null;
  const grossWin = wins.reduce((s, t) => s + parseFloat(t.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const withRR = trades.filter(t => t.rr && !isNaN(parseFloat(t.rr)));
  const avgRR = withRR.length ? withRR.reduce((s, t) => s + parseFloat(t.rr), 0) / withRR.length : null;
  const pnls = withPnl.map(t => parseFloat(t.pnl));
  const best = pnls.length ? Math.max(...pnls) : null;
  const worst = pnls.length ? Math.min(...pnls) : null;
  const sessionBreakdown: Record<string, number> = {};
  for (const t of trades) {
    if (t.session) sessionBreakdown[t.session] = (sessionBreakdown[t.session] || 0) + 1;
  }
  return { tradeCount: trades.length, withPnl: withPnl.length, totalPnl, winRate, profitFactor, avgRR, best, worst, sessionBreakdown };
}

// ─── IMPORT TEMPLATES (localStorage) ─────────────────────────────────────────
const TPL_KEY = "koda_csv_templates";
interface ImportTemplate {
  label: string;
  broker: string | null;
  mapping: Record<string, string>;
  strategy: string;
}

function loadTemplates(): Record<string, ImportTemplate> {
  try { return JSON.parse(localStorage.getItem(TPL_KEY) || "{}"); } catch { return {}; }
}
function persistTemplate(name: string, tpl: ImportTemplate) {
  const all = loadTemplates();
  all[name] = tpl;
  localStorage.setItem(TPL_KEY, JSON.stringify(all));
}
function removeTemplate(name: string) {
  const all = loadTemplates();
  delete all[name];
  localStorage.setItem(TPL_KEY, JSON.stringify(all));
}

// ─── CSV PRESETS ──────────────────────────────────────────────────────────────
const CSV_PRESETS: Record<string, {
  label: string;
  hint: string;
  /** Step-by-step path inside the platform to reach the export. Shown in the platform picker. */
  exportPath: string;
  mapping: Record<string, string>;
  fallbacks?: Record<string, string[]>;
  dateLocale?: "us" | "eu";
  /** When no explicit Side column maps, infer direction from these timestamp columns. */
  biasInferenceColumns?: { buyTime: string; sellTime: string };
  /** Header(s) holding the broker's unique trade/order ID — preferred dedup key. */
  brokerIdColumn?: string;
  brokerIdFallbacks?: string[];
}> = {
  tradovate: {
    label: "Tradovate",
    hint: "Tradovate account statement CSV (Account -> Statements -> Trade History)",
    exportPath: "Account → Statements → Trade History → Download CSV",
    mapping: { pair: "Symbol", date: "Buy Time", bias: "B/S", pnl: "P&L", entryPrice: "Buy Price", notes: "Account" },
    dateLocale: "us",
  },
  rithmic: {
    label: "Rithmic",
    hint: "Apex / TopstepX / Earn2Trade prop firm CSV (Rithmic Trade Route statement)",
    exportPath: "Apex Fusion → Performance → Trade History → Export CSV",
    mapping: { pair: "Symbol", date: "Entry Date/Time", bias: "Buy/Sell", pnl: "Net P&L", entryPrice: "Buy Fill Price", exitPrice: "Sell Fill Price", qty: "Qty", notes: "Account" },
    fallbacks: {
      date:       ["Date", "Entry Time", "Trade Date"],
      bias:       ["Side", "B/S", "Direction"],
      entryPrice: ["Fill Price", "Entry Price", "Price"],
      exitPrice:  ["Exit Price", "Close Price"],
      qty:        ["Quantity", "Size", "Contracts"],
    },
    dateLocale: "us",
    // Rithmic Trade Route exports omit an explicit Side column — fall back to
    // timestamp ordering so shorts aren't silently logged as longs.
    biasInferenceColumns: { buyTime: "Buy Fill Time", sellTime: "Sell Fill Time" },
    brokerIdColumn: "Order Number",
    brokerIdFallbacks: ["Order ID", "Order #", "Account Order #", "Trade ID"],
  },
  tradingview: {
    label: "TradingView",
    hint: "TradingView Paper Trading / Broker → Trade History → Export (closed positions with Symbol column)",
    exportPath: "Paper Trading → Trade History → Export (or Broker → Closed Positions → Export)",
    mapping: { pair: "Symbol", date: "Date/Time", bias: "Type", pnl: "Profit", entryPrice: "Price" },
    fallbacks: {
      bias:       ["Side", "Direction", "B/S", "Long/Short"],
      pnl:        ["Net Profit", "Net P&L", "Realized P/L", "P&L", "Gain/Loss"],
      entryPrice: ["Open Price", "Entry Price", "Fill Price", "Avg. Price"],
      exitPrice:  ["Close Price", "Exit Price"],
      qty:        ["Qty", "Contracts", "Quantity", "Size"],
    },
    dateLocale: "us",
  },
  tradingview_st: {
    label: "TradingView Strategy",
    hint: "TradingView Strategy Tester → List of Trades → Export to CSV (enter the chart instrument symbol below)",
    exportPath: "Chart → Strategy Tester (bottom panel) → List of Trades tab → Export icon (↓)",
    mapping: {
      pair:       "Symbol",
      date:       "Date/Time",
      bias:       "Type",
      pnl:        "Profit",
      entryPrice: "Entry Price",
      exitPrice:  "Exit Price",
      qty:        "Contracts",
    },
    dateLocale: "us",
  },
  mt4: {
    label: "MT4 / MT5",
    hint: "MetaTrader account history export",
    exportPath: "Terminal → Account History tab → right-click → Save as Report → open in browser → save as CSV",
    mapping: { pair: "Symbol", date: "Open Time", bias: "Type", pnl: "Profit", entryPrice: "Open Price", slPrice: "S / L", tpPrice: "T / P", notes: "Comment" },
    dateLocale: "eu",
    brokerIdColumn: "Ticket",
    brokerIdFallbacks: ["Order", "Position", "Deal", "Ticket #"],
  },
  ninjatrader8: {
    label: "NinjaTrader 8",
    hint: "NinjaTrader 8 Trade Performance export (Account Performance Report → Export → CSV)",
    exportPath: "Control Center → Account Performance → Trade Performance tab → Export → CSV",
    mapping: {
      pair:       "Instrument",
      date:       "Entry time",
      bias:       "Direction",
      pnl:        "Profit",
      entryPrice: "Entry price",
      exitPrice:  "Exit price",
      qty:        "Qty",
      notes:      "Entry name",
    },
    fallbacks: {
      pair:       ["Market", "Symbol"],
      date:       ["Entry Time", "Entry Date", "Time"],
      bias:       ["Action", "Side", "Type"],
      pnl:        ["Net profit", "Net Profit", "P&L"],
      entryPrice: ["Entry Price", "Open Price"],
      exitPrice:  ["Exit Price", "Close Price"],
      qty:        ["Quantity", "Size", "Contracts"],
      notes:      ["Exit name", "Comment", "Setup"],
    },
    dateLocale: "us",
  },
  topstepx: {
    label: "TopstepX",
    hint: "TopstepX Combine or Funded account trade history CSV export",
    exportPath: "Dashboard → Performance → Trade History → Export CSV",
    mapping: {
      pair:       "Instrument",
      date:       "Entry Date",
      bias:       "Side",
      pnl:        "Net P&L",
      entryPrice: "Entry Price",
      exitPrice:  "Exit Price",
      qty:        "Size",
    },
    fallbacks: {
      pair:       ["Symbol", "Market", "Contract"],
      date:       ["Entry DateTime", "Entry Time", "Open Time", "Date"],
      bias:       ["Direction", "Type", "Buy/Sell"],
      pnl:        ["P&L", "Profit", "Net Profit", "Gain/Loss"],
      entryPrice: ["Open Price", "Fill Price", "Buy Fill Price"],
      exitPrice:  ["Close Price", "Sell Fill Price"],
      qty:        ["Quantity", "Contracts", "Volume", "Lots"],
    },
    dateLocale: "us",
  },
  ftmo_mt5: {
    label: "FTMO / MT5",
    hint: "FTMO or any MT5 broker — Account History → Save as Report → open in Excel → save as CSV",
    exportPath: "MT5 Terminal → Account History → right-click → Save as Report → Save as CSV",
    mapping: {
      pair:       "Symbol",
      date:       "Open Time",
      bias:       "Type",
      pnl:        "Profit",
      entryPrice: "Open Price",
      exitPrice:  "Close Price",
      slPrice:    "Stop Loss",
      tpPrice:    "Take Profit",
      qty:        "Volume",
      notes:      "Comment",
    },
    fallbacks: {
      date:       ["Time", "Open time", "Entry Time", "Open_Time"],
      bias:       ["Direction", "Side", "Action"],
      pnl:        ["Net Profit", "P&L", "Gain"],
      entryPrice: ["Price", "Entry Price"],
      exitPrice:  ["Close Price", "Exit Price"],
      slPrice:    ["S / L", "SL", "S/L"],
      tpPrice:    ["T / P", "TP", "T/P"],
      qty:        ["Lots", "Size", "Contracts", "Lot"],
      notes:      ["comment", "Memo"],
    },
    dateLocale: "eu",
    brokerIdColumn: "Ticket",
    brokerIdFallbacks: ["Order", "Position", "Deal", "Ticket #"],
  },
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
interface CsvImportPanelProps {
  existingTrades: Trade[];
  onImport: (trades: Trade[]) => void;
  onClose: () => void;
  allStrategyNames: string[];
  C: Theme;
  inp: React.CSSProperties;
  sel: React.CSSProperties;
  lbl: React.CSSProperties;
  defaultAccountType?: Trade["accountType"];
}
export function CsvImportPanel({ existingTrades, onImport, onClose, allStrategyNames, C, inp, sel, lbl, defaultAccountType }: CsvImportPanelProps) {
  const [fileName, setFileName] = useState("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [csvDelimiter, setCsvDelimiter] = useState<"," | "\t" | ";">(",");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultStrategy, setDefaultStrategy] = useState("");
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [dateLocale, setDateLocale] = useState<"us" | "eu">("us");
  const [grossNet, setGrossNet] = useState<"net" | "gross">("net");
  const [accountType, setAccountType] = useState<Trade["accountType"]>(defaultAccountType ?? "personal");
  // Analytics reveal
  const [revealStats, setRevealStats] = useState<ImportStats | null>(null);
  const [revealTrades, setRevealTrades] = useState<Trade[]>([]);
  // Templates
  const [templates, setTemplates] = useState<Record<string, ImportTemplate>>(() => loadTemplates());
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [tvSymbol, setTvSymbol] = useState("");
  const [parsing, setParsing] = useState(false);

  function refreshTemplates() { setTemplates(loadTemplates()); }

  function applyPreset(presetKey: string) {
    const preset = CSV_PRESETS[presetKey];
    if (!preset) return;
    // TV Strategy Tester uses synthetic column names (produced by merge), not raw headers
    if (presetKey === "tradingview_st") {
      setMapping(preset.mapping);
      setActivePreset(presetKey);
      if (preset.dateLocale) setDateLocale(preset.dateLocale);
      return;
    }
    const resolved: Record<string, string> = {};
    for (const [field, col] of Object.entries(preset.mapping)) {
      let hit = headers.find(h => h.toLowerCase() === col.toLowerCase());
      const fbs = preset.fallbacks?.[field];
      if (!hit && fbs) {
        for (const fb of fbs) { hit = headers.find(h => h.toLowerCase() === fb.toLowerCase()); if (hit) break; }
      }
      if (hit) resolved[field] = hit;
    }
    setMapping(prev => ({ ...prev, ...resolved }));
    setActivePreset(presetKey);
    if (preset.dateLocale) setDateLocale(preset.dateLocale);
  }

  function applyTemplate(name: string) {
    const tpl = templates[name];
    if (!tpl) return;
    setMapping(tpl.mapping);
    setDefaultStrategy(tpl.strategy);
    if (tpl.broker) setActivePreset(tpl.broker);
  }

  function handleSaveTemplate() {
    const name = saveTemplateName.trim();
    if (!name) return;
    const tpl: ImportTemplate = { label: name, broker: activePreset, mapping, strategy: defaultStrategy };
    persistTemplate(name, tpl);
    refreshTemplates();
    setSaveTemplateName("");
    setShowSaveTemplate(false);
  }

  function handleDeleteTemplate(name: string) {
    removeTemplate(name);
    refreshTemplates();
  }

  function processText(text: string) {
    try {
      const { headers: h, rows: r, delimiter: d } = parseCSV(text);
      if (!h.length) {
        setError("No column headers found. Make sure you're exporting a trade history CSV, not an account statement PDF.");
        return;
      }
      // Single-header smell test: if there's exactly one header and it contains
      // a likely-delimiter character inside, the file probably uses an unusual
      // delimiter our detector missed (rare since we cover , \t and ;).
      if (h.length === 1 && /[,\t;|]/.test(h[0])) {
        setError("Couldn't split columns — the file uses an unrecognised delimiter. Save as standard CSV (comma-separated) or TSV (tab-separated) from your platform.");
        return;
      }
      if (!r.length) {
        setError("Headers found but no trade rows. The file may be empty, contain only a header, or use a format we don't recognise yet.");
        return;
      }
      setHeaders(h);
      setRows(r);
      setCsvDelimiter(d);
      const autoMap = autoDetectMapping(h);
      const broker = detectBroker(h);
      if (broker === "tradingview_st") {
        // Synthetic columns (produced by mergeTradingViewStrategyRows) — force mapping directly
        const preset = CSV_PRESETS.tradingview_st;
        setMapping(preset.mapping);
        setActivePreset("tradingview_st");
        setDateLocale(preset.dateLocale ?? "us");
      } else if (broker) {
        const preset = CSV_PRESETS[broker];
        const presetMap: Record<string, string> = {};
        for (const [field, col] of Object.entries(preset.mapping)) {
          let hit = h.find(hh => hh.toLowerCase() === col.toLowerCase());
          const fbs = preset.fallbacks?.[field];
          if (!hit && fbs) {
            for (const fb of fbs) { hit = h.find(hh => hh.toLowerCase() === fb.toLowerCase()); if (hit) break; }
          }
          if (hit) presetMap[field] = hit;
        }
        setMapping({ ...autoMap, ...presetMap });
        setActivePreset(broker);
        if (preset.dateLocale) setDateLocale(preset.dateLocale);
      } else {
        setMapping(autoMap);
      }
    } catch (err: unknown) { setError("Couldn't parse this file: " + (err instanceof Error ? err.message : "unknown error")); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject obviously-wrong file types up front so users don't see the
    // confusing "no column headers found" error from feeding a PDF/PNG to
    // the CSV parser.
    if (!/\.(csv|tsv|txt|xlsx|xls)$/i.test(file.name)) {
      setError("That file type isn't supported. Pick a CSV, TSV, or Excel file from your platform.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large (max 10 MB). Export a smaller date range from your platform.");
      return;
    }

    setFileName(file.name);
    setOriginalFile(file);
    setError("");
    setActivePreset(null);
    setTvSymbol("");
    setParsing(true);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      readXlsxFile(file).then(rows => {
        const csv = rows.map(row =>
          row.map(cell => {
            if (cell === null || cell === undefined) return "";
            // Excel stores dates as local midnight. toISOString() converts to UTC
            // and silently shifts the date back a day in any timezone west of UTC
            // — read the wall-clock date components instead.
            const s = cell instanceof Date
              ? `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(cell.getDate()).padStart(2, "0")}`
              : String(cell);
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(",")
        ).join("\n");
        processText(csv);
        setParsing(false);
      }).catch((err: unknown) => {
        setError("Couldn't parse Excel file: " + (err instanceof Error ? err.message : "unknown error"));
        setParsing(false);
      });
    } else {
      // Read as ArrayBuffer so we can sniff the byte-order mark and pick the
      // right encoding. Excel sometimes exports CSVs as UTF-16 LE; readAsText
      // with "utf-8" produces garbage from those files.
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const buf = reader.result as ArrayBuffer;
          const text = decodeCsvBuffer(buf);
          processText(text);
        } catch {
          setError("Couldn't decode the file. Try saving it as CSV (UTF-8) from your platform.");
        } finally {
          setParsing(false);
        }
      };
      reader.onerror = () => {
        setError("Couldn't read the file. Try saving it as CSV (UTF-8) from your platform.");
        setParsing(false);
      };
      reader.readAsArrayBuffer(file);
    }
  }

  /**
   * Decode a CSV file's bytes using the right encoding. Sniffs BOM:
   *   FE FF       → UTF-16 BE
   *   FF FE       → UTF-16 LE
   *   EF BB BF    → UTF-8 with BOM (parseCSV strips the U+FEFF after decode)
   *   otherwise   → UTF-8
   */
  function decodeCsvBuffer(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder("utf-16be").decode(buf.slice(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder("utf-16le").decode(buf.slice(2));
    }
    return new TextDecoder("utf-8").decode(buf);
  }

  const fields = [
    { key: "date",       label: "Date",           required: true },
    { key: "pair",       label: "Pair / Symbol",   required: true },
    { key: "outcome",    label: "Outcome",          required: false },
    { key: "pnl",        label: "P&L",              required: false },
    { key: "entryPrice", label: "Entry price",      required: false },
    { key: "exitPrice",  label: "Exit price",       required: false },
    { key: "qty",        label: "Qty / Contracts",  required: false },
    { key: "slPrice",    label: "Stop loss",        required: false },
    { key: "tpPrice",    label: "Take profit",      required: false },
    { key: "rr",         label: "R:R",              required: false },
    { key: "bias",       label: "Direction / side", required: false },
    { key: "session",    label: "Session",          required: false },
    { key: "notes",      label: "Notes",            required: false },
  ];

  const existingKeys = new Set(existingTrades.map(tradeKey));

  const MAX_IMPORT_ROWS = 5_000;
  const cappedRows = rows.length > MAX_IMPORT_ROWS ? rows.slice(0, MAX_IMPORT_ROWS) : rows;
  const rowsCapped = rows.length > MAX_IMPORT_ROWS;

  // For TV Strategy Tester: merge Entry/Exit row pairs into synthetic single rows.
  // The tvSymbol drives the "Symbol" column in merged rows — empty symbol → empty
  // pair → rowToTrade rejects the row → preview shows 0 until user enters a symbol.
  const mergedRows = activePreset === "tradingview_st"
    ? mergeTradingViewStrategyRows(cappedRows, tvSymbol.trim())
    : cappedRows;

  // TV Strategy Tester: entry-only rows are open positions (no exit yet). Skip
  // them so we never import a half-trade with no exit/P&L, and surface the
  // count so the user knows we didn't silently drop their data.
  const openPositionCount = activePreset === "tradingview_st"
    ? mergedRows.filter(r => r["__openPosition"] === "1").length
    : 0;
  const effectiveRows = activePreset === "tradingview_st"
    ? mergedRows.filter(r => r["__openPosition"] !== "1")
    : mergedRows;

  // Column dropdowns use synthetic headers for TV_ST (produced rows have different keys)
  const effectiveHeaders = activePreset === "tradingview_st" && effectiveRows.length > 0
    ? Object.keys(effectiveRows[0])
    : headers;

  // CRIT-1: Strip trailing summary/total rows before parsing
  const pairCol = mapping["pair"] || "";
  const filteredRows = pairCol
    ? effectiveRows.filter(row => {
        const sym = (row[pairCol] || "").trim();
        return sym !== "" && !isSummarySymbol(sym);
      })
    : effectiveRows;

  // Resolve broker-specific hints (Side inference + broker trade ID column)
  // against the actual headers present in the uploaded file.
  const preset = activePreset ? CSV_PRESETS[activePreset] : null;
  const rowCtx: RowContext = (() => {
    const ctx: RowContext = { decimalSeparator: decimalSeparatorForDelimiter(csvDelimiter) };
    if (preset?.biasInferenceColumns) {
      const buyTime  = headers.find(h => h.toLowerCase() === preset.biasInferenceColumns!.buyTime.toLowerCase());
      const sellTime = headers.find(h => h.toLowerCase() === preset.biasInferenceColumns!.sellTime.toLowerCase());
      if (buyTime && sellTime) ctx.biasInferenceColumns = { buyTime, sellTime };
    }
    if (preset?.brokerIdColumn) {
      const candidates = [preset.brokerIdColumn, ...(preset.brokerIdFallbacks ?? [])];
      for (const cand of candidates) {
        const hit = headers.find(h => h.toLowerCase() === cand.toLowerCase());
        if (hit) { ctx.brokerIdColumn = hit; break; }
      }
    }
    return ctx;
  })();

  const allParsed = filteredRows.map(r => rowToTrade(r, mapping, defaultStrategy, dateLocale, accountType, rowCtx));
  const previewTrades = allParsed.filter((t): t is Trade => t !== null);
  const invalidCount = allParsed.length - previewTrades.length;
  const uniquePreview = previewTrades.filter(t => !existingKeys.has(tradeKey(t)));
  const dupCount = previewTrades.length - uniquePreview.length;
  const canImport = !!mapping.date && !!mapping.pair && uniquePreview.length > 0;

  function doImport() {
    if (!canImport) return;
    setRevealStats(computeImportStats(uniquePreview));
    setRevealTrades(uniquePreview);
  }

  function confirmImport() {
    const tradesToImport = revealTrades;
    const importedCount = tradesToImport.length;
    onImport(tradesToImport);
    setRevealStats(null);
    setRevealTrades([]);

    // Audit trail: best-effort persist of the original file + a counts row.
    // We do NOT await — trades have already saved locally and the user
    // shouldn't wait on the network. See src/lib/imports.ts.
    if (originalFile) {
      persistImport({
        file:            originalFile,
        broker:          activePreset,
        accountType:     accountType ?? null,
        rowCount:        rows.length,
        importedCount,
        duplicateCount:  dupCount,
      }).catch(err => {
        console.warn("[koda imports] persist crashed:", err);
      });
    }
  }

  function cancelReveal() {
    setRevealStats(null);
    setRevealTrades([]);
  }

  const pnlColor = (v: number | null) => v === null ? C.muted : v >= 0 ? C.green : C.red;
  const fmt$ = (v: number | null) => v === null ? "--" : `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v: number | null) => v === null ? "--" : `${v.toFixed(1)}%`;
  const fmtR = (v: number | null) => v === null ? "--" : `${v.toFixed(2)}R`;

  // ── Analytics Reveal Modal ──────────────────────────────────────────────────
  if (revealStats) {
    const s = revealStats;
    const sessionEntries = Object.entries(s.sessionBreakdown).sort((a, b) => b[1] - a[1]);
    const sessionAutoTagged = revealTrades.filter(t => t.session).length;
    return (
      <div style={{ border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "24px", background: C.panel, display: "flex", flexDirection: "column", gap: "20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Import preview</div>
          <button onClick={cancelReveal} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "14px" }}>x</button>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: "28px", fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>{s.tradeCount}</div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>trades ready to import</div>
        </div>

        {grossNet === "gross" && (
          <div style={{ background: C.warn + "22", border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 14px", fontFamily: BODY, fontSize: "12px", color: C.warn }}>
            P&L is marked as <strong>gross</strong> — figures shown here are pre-commission. Review pnlDollar after import.
          </div>
        )}

        {s.withPnl > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
            {[
              { label: "Total P&L",      value: fmt$(s.totalPnl),      color: pnlColor(s.totalPnl) },
              { label: "Win Rate",       value: fmtPct(s.winRate),     color: s.winRate !== null && s.winRate >= 50 ? C.green : C.red },
              { label: "Profit Factor",  value: s.profitFactor !== null ? s.profitFactor.toFixed(2) : "--", color: s.profitFactor !== null && s.profitFactor >= 1 ? C.green : C.red },
              { label: "Avg R:R",        value: fmtR(s.avgRR),         color: C.text },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: "20px", fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {s.best !== null && (
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Best trade</div>
              <div style={{ fontFamily: MONO, fontSize: "16px", fontWeight: 700, color: C.green }}>{fmt$(s.best)}</div>
            </div>
            <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Worst trade</div>
              <div style={{ fontFamily: MONO, fontSize: "16px", fontWeight: 700, color: C.red }}>{fmt$(s.worst)}</div>
            </div>
          </div>
        )}

        {sessionEntries.length > 0 && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
              Session breakdown
              {sessionAutoTagged > 0 && <span style={{ color: C.muted, fontWeight: 400 }}> — {sessionAutoTagged} auto-tagged from timestamp</span>}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {sessionEntries.map(([sess, count]) => (
                <div key={sess} style={{ padding: "6px 12px", border: `1px solid ${C.border2}`, borderRadius: "999px", fontFamily: MONO, fontSize: "10px", color: C.text, display: "flex", gap: "6px", alignItems: "center" }}>
                  <span>{sess}</span>
                  <span style={{ color: C.muted }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={cancelReveal} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Go back</button>
          <button onClick={confirmImport} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
            Confirm import
          </button>
        </div>
      </div>
    );
  }

  // ── Main panel ──────────────────────────────────────────────────────────────
  return (
    <div style={{ border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "20px", background: C.panel, display: "flex", flexDirection: "column", gap: "18px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Import CSV / Excel</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "14px" }}>x</button>
      </div>

      {/* ── Step 1: Platform picker (always shown) ─────────────────────────── */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px" }}>
          Step 1 — Select your platform
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
          {Object.entries(CSV_PRESETS).map(([key, preset]) => {
            const active = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActivePreset(key);
                  if (preset.dateLocale) setDateLocale(preset.dateLocale);
                  if (headers.length) applyPreset(key);
                }}
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${active ? C.text : C.border2}`,
                  borderRadius: "10px",
                  background: active ? C.text : "transparent",
                  color: active ? C.bg : C.text2,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: "11px",
                  letterSpacing: "0.04em",
                  textAlign: "left",
                  transition: "all 0.12s",
                }}
              >
                <div style={{ fontWeight: active ? 700 : 500 }}>{preset.label}</div>
              </button>
            );
          })}
        </div>
        {activePreset && (
          <div style={{
            marginTop: "10px", padding: "10px 14px",
            background: C.panel2, borderRadius: "8px",
            fontFamily: BODY, fontSize: "11px", color: C.muted, lineHeight: 1.5,
          }}>
            <span style={{ color: C.text2, fontWeight: 500 }}>Where to export: </span>
            {CSV_PRESETS[activePreset].exportPath}
          </div>
        )}
      </div>

      {/* ── Step 2: File upload ─────────────────────────────────────────────── */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px" }}>
          Step 2 — Upload the file
        </div>
        <label htmlFor="csv-file" style={{
          display: "block", border: `1px dashed ${parsing ? C.warn : headers.length ? C.green : C.border2}`,
          padding: "20px 16px", borderRadius: "10px", cursor: parsing ? "wait" : "pointer",
          textAlign: "center", color: parsing ? C.warn : headers.length ? C.green : C.muted,
          fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase",
          opacity: parsing ? 0.8 : 1,
        }}>
          {parsing
            ? `Parsing ${fileName}…`
            : fileName
              ? `✓ ${fileName} — ${rows.length} rows`
              : "Click to select a CSV or Excel file"}
          <input id="csv-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/plain,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleFile} disabled={parsing} style={{ display: "none" }} />
        </label>
        {!activePreset && !headers.length && (
          <div style={{ fontFamily: BODY, fontSize: "11px", color: C.muted, marginTop: "8px", lineHeight: 1.5 }}>
            Select your platform above first so columns map automatically.
          </div>
        )}
      </div>

      {/* Saved templates */}
      {Object.keys(templates).length > 0 && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Saved templates</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {Object.entries(templates).map(([name]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border2}`, borderRadius: "999px", overflow: "hidden" }}>
                <button onClick={() => applyTemplate(name)}
                  style={{ padding: "6px 12px 6px 14px", background: "transparent", border: "none", color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em" }}>
                  {name}
                </button>
                <button onClick={() => handleDeleteTemplate(name)}
                  style={{ padding: "6px 10px 6px 4px", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "11px", lineHeight: 1 }}>
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div style={{ fontFamily: BODY, fontSize: "12px", color: C.red }}>{error}</div>}

      {headers.length > 0 && (
        <>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted }}>
            <span style={{ color: C.text }}>{fileName}</span> — {rows.length} rows detected.
            {activePreset && <span style={{ marginLeft: "8px" }}>Preset: <span style={{ color: C.text }}>{CSV_PRESETS[activePreset]?.label}</span></span>}
          </div>

          {/* TV Strategy Tester: instrument symbol input */}
          {activePreset === "tradingview_st" && (
            <div style={{
              padding: !tvSymbol.trim() && rows.length > 0 ? "14px 16px" : "0",
              border: !tvSymbol.trim() && rows.length > 0 ? `1px solid ${C.warn}` : "none",
              borderRadius: "10px",
              background: !tvSymbol.trim() && rows.length > 0 ? `color-mix(in oklch, ${C.warn} 8%, transparent)` : "transparent",
            }}>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: !tvSymbol.trim() && rows.length > 0 ? C.warn : C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                Instrument <span style={{ color: C.red }}>*</span> {!tvSymbol.trim() && rows.length > 0 && "— required"}
              </div>
              <input
                value={tvSymbol}
                onChange={e => setTvSymbol(e.target.value.toUpperCase())}
                placeholder="NQ, ES, AAPL, EURUSD..."
                autoFocus
                style={{ ...inp, width: "220px", fontSize: "13px" }}
              />
              <div style={{ fontFamily: BODY, fontSize: "11px", color: C.muted, marginTop: "6px", lineHeight: 1.4 }}>
                Strategy Tester exports don't include the chart symbol — enter the instrument you ran the strategy on (e.g. NQ, ES, AAPL).
              </div>
            </div>
          )}

          {/* Import options: account type + date locale + gross/net */}
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Account type</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["personal", "funded", "demo"] as const).map(at => (
                  <button key={at} onClick={() => setAccountType(at)}
                    style={{ padding: "6px 12px", border: `1px solid ${accountType === at ? C.text : C.border2}`, borderRadius: "999px", background: accountType === at ? C.text : "transparent", color: accountType === at ? C.bg : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {at}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Date format</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["us", "eu"] as const).map(loc => (
                  <button key={loc} onClick={() => setDateLocale(loc)}
                    style={{ padding: "6px 12px", border: `1px solid ${dateLocale === loc ? C.text : C.border2}`, borderRadius: "999px", background: dateLocale === loc ? C.text : "transparent", color: dateLocale === loc ? C.bg : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {loc === "us" ? "MM/DD" : "DD/MM"}
                  </button>
                ))}
              </div>
            </div>
            {mapping.pnl && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>P&amp;L column is</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["net", "gross"] as const).map(gn => (
                    <button key={gn} onClick={() => setGrossNet(gn)}
                      style={{ padding: "6px 12px", border: `1px solid ${grossNet === gn ? C.text : C.border2}`, borderRadius: "999px", background: grossNet === gn ? C.text : "transparent", color: grossNet === gn ? C.bg : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {gn === "net" ? "Net (after fees)" : "Gross (before fees)"}
                    </button>
                  ))}
                </div>
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
                  <select value={mapping[f.key] || ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))} style={sel}>
                    <option value="">-- skip --</option>
                    {effectiveHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={lbl}>Default strategy (applied to every row)</label>
            <select value={defaultStrategy} onChange={e => setDefaultStrategy(e.target.value)} style={sel}>
              <option value="">-- none --</option>
              {allStrategyNames.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Preview table */}
          <div>
            <label style={lbl}>Preview (first 5 rows)</label>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "auto", marginTop: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: C.panel2 }}>
                    {["Date", "Pair", "Bias", "Session", "Outcome", "P&L", "R:R"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.muted, letterSpacing: "0.08em", fontWeight: 500, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewTrades.slice(0, 5).map((t, i) => {
                    const dup = existingKeys.has(tradeKey(t));
                    return (
                      <tr key={i} style={{ opacity: dup ? 0.5 : 1 }}>
                        <td style={{ padding: "8px 10px", color: C.text,  borderBottom: `1px solid ${C.border}` }}>{t.date}</td>
                        <td style={{ padding: "8px 10px", color: C.text,  borderBottom: `1px solid ${C.border}` }}>{t.pair || "--"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.bias || "--"}</td>
                        <td style={{ padding: "8px 10px", color: t.session ? C.text2 : C.muted, borderBottom: `1px solid ${C.border}`, fontSize: "10px" }}>{t.session || "--"}</td>
                        <td style={{ padding: "8px 10px", color: t.outcome === "Win" ? C.green : t.outcome === "Loss" ? C.red : C.text2, borderBottom: `1px solid ${C.border}` }}>{t.outcome || "--"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.pnl || "--"}</td>
                        <td style={{ padding: "8px 10px", color: C.text2, borderBottom: `1px solid ${C.border}` }}>{t.rr || "--"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(() => {
              // Only warn when MULTIPLE trades all share today's date — a same-day
              // import (one or two trades from this session) is legitimate and
              // shouldn't trigger a scary banner.
              const today = new Date().toISOString().split("T")[0];
              const todayCount = previewTrades.filter(t => t.date === today).length;
              return previewTrades.length >= 5 && todayCount === previewTrades.length ? (
                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.warn, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                  ⚠ All {todayCount} trades show today's date — check that the correct Date column is mapped above.
                </div>
              ) : null;
            })()}
            {dupCount > 0 && uniquePreview.length > 0 && (
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                {dupCount} duplicate{dupCount === 1 ? "" : "s"} will be skipped.
              </div>
            )}
            {dupCount > 0 && uniquePreview.length === 0 && (
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                ✓ All {dupCount} trade{dupCount === 1 ? " is" : "s are"} already in your journal — nothing to import.
              </div>
            )}
            {invalidCount > 0 && (
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.warn, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "6px" }}>
                {invalidCount} row{invalidCount === 1 ? "" : "s"} skipped — missing symbol or unparseable date.
              </div>
            )}
            {openPositionCount > 0 && (
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "6px" }}>
                {openPositionCount} open position{openPositionCount === 1 ? "" : "s"} skipped — no exit recorded yet.
              </div>
            )}
            {rowsCapped && (
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px" }}>
                ⚠ File has {rows.length.toLocaleString()} rows — only first {MAX_IMPORT_ROWS.toLocaleString()} will be imported. Export a smaller date range to get all trades.
              </div>
            )}
          </div>

          {/* Save template */}
          <div>
            {showSaveTemplate ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)}
                  placeholder="Template name..."
                  onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setShowSaveTemplate(false); }}
                  style={{ ...inp, flex: 1, fontSize: "12px" }} />
                <button onClick={handleSaveTemplate} disabled={!saveTemplateName.trim()}
                  style={{ padding: "8px 14px", border: "none", borderRadius: "999px", background: saveTemplateName.trim() ? C.text : C.border2, color: saveTemplateName.trim() ? C.bg : C.muted, cursor: saveTemplateName.trim() ? "pointer" : "not-allowed", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Save
                </button>
                <button onClick={() => setShowSaveTemplate(false)}
                  style={{ padding: "8px 14px", border: `1px solid ${C.border2}`, borderRadius: "999px", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSaveTemplate(true)}
                style={{ padding: "7px 14px", border: `1px solid ${C.border2}`, borderRadius: "999px", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                + Save as template
              </button>
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
