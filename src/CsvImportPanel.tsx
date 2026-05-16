import { useState } from "react";
import { MONO, BODY } from "./shared";

// ─── CSV PARSING + BROKER AUTO-DETECTION ─────────────────────────────────────
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

function normalizeBias(raw: string): string {
  const v = raw.toLowerCase();
  if (/long|buy|bull/.test(v)) return "Bullish";
  if (/short|sell|bear/.test(v)) return "Bearish";
  return "";
}

function normalizeOutcome(raw: string, pnl: number): string {
  const v = (raw || "").toLowerCase();
  if (/win|profit|tp[_\s]*hit|target/.test(v)) return "Win";
  if (/loss|lose|sl[_\s]*hit|stop/.test(v)) return "Loss";
  if (/break[_\s]*even|be|flat/.test(v)) return "Breakeven";
  if (pnl > 0) return "Win";
  if (pnl < 0) return "Loss";
  if (raw || !isNaN(pnl)) return "Breakeven";
  return "";
}

function parseNum(s: string): number {
  if (!s) return NaN;
  const n = s.replace(/[^0-9.\-()]/g, "").replace(/\((.*)\)/, "-$1");
  return parseFloat(n);
}

function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString().split("T")[0];
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (slash) {
    let [_, a, b, y] = slash;
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

function calcRR(e: any, s: any, t: any): string {
  const ev = parseFloat(e), sv = parseFloat(s), tv = parseFloat(t);
  if (isNaN(ev) || isNaN(sv) || isNaN(tv)) return "";
  const risk = Math.abs(ev - sv);
  if (risk === 0) return "";
  const reward = Math.abs(tv - ev);
  const rr = reward / risk;
  if (!isFinite(rr) || rr > 100) return "";
  return rr.toFixed(2);
}

function _djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
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

// ─── CSV PRESETS ─────────────────────────────────────────────────────────────
const CSV_PRESETS: Record<string, { label: string; hint: string; mapping: Record<string, string> }> = {
  tradovate: {
    label: "Tradovate",
    hint: "Tradovate account statement CSV (Account → Statements → Trade History)",
    mapping: {
      pair:       "Symbol",
      date:       "Buy Time",
      bias:       "B/S",
      pnl:        "P&L",
      entryPrice: "Buy Price",
      notes:      "Account",
    },
  },
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
    hint: "TradingView Trade List export (Strategy Tester → List of Trades → Export)",
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

// ─── CSV IMPORT PANEL ─────────────────────────────────────────────────────────
export function CsvImportPanel({ existingTrades, onImport, onClose, allStrategyNames, C, inp, sel, lbl }: any) {
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
    const resolved: Record<string, string> = {};
    for (const [field, col] of Object.entries(preset.mapping)) {
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
