# Kōda CSV Import Audit
**Date:** 2026-05-27 · **Scope:** `src/lib/csvParser.ts`, `src/CsvImportPanel.tsx`, `src/lib/tradovate.ts`, fixtures, tests

---

## 0 · Dylon's Answers to Audit Questions

| # | Question | Answer | Implication |
|---|---|---|---|
| 1 | Rithmic export source | **Both** — R\|Trader Pro desktop and Apex web dashboard | Two different column layouts; need separate presets or detection |
| 2 | TopstepX format | **Not sure** — no real file tested | Treat as untested; get a real export before shipping |
| 3 | FTMO preset tested? | **No** — written from documentation only | Confirmed broken due to preamble rows (CRIT-6); fix before marketing to FTMO traders |
| 4 | Commission / gross vs net | **Always ask the user** — toggle in import UI | Add "Is this P&L gross or net?" step; if gross, show optional commission field |
| 5 | Dollar P&L source | **Both** — import if available, calculate if not | Needs tick-value table per instrument; build as Phase (b) prerequisite |
| 6 | Prop firm daily reset time | **Not sure** — needs checking with Apex rules | Block trailing-drawdown and consistency-rule features until confirmed; placeholder 6 pm ET |
| 7 | Account currency (FTMO EUR) | **Ignore for now** | Store raw values; label with account currency when added later |
| 8 | Excel `.xlsx` support | **Launch blocker — must have** | Moved from Phase (c) to Phase (a) |
| 9 | `source` field on imported trades | **Your call** → stamp `csv_import` | Enables "pre-Kōda vs in-Kōda" segmentation; zero downside; do it |
| 10 | 5,000-row cap | **Fine as-is** | No change needed; add truncation warning to UI |

---

## 1 · Critical Risks

These are silent or hard-to-detect failure modes that corrupt P&L data or duplicate trades without warning.

---

### CRIT-1 · Trailing summary rows imported as trades
**File:** `src/lib/csvParser.ts:56` — `lines.slice(1)` takes every row after the header with no filtering.  
**Risk:** Rithmic and NinjaTrader exports often end with a "TOTAL" or "Subtotal" row. That row is parsed as a trade. The `pnl` field for such a row could be `+$12,000.00`, creating a large phantom winning trade. `parseNum()` will happily parse it.  
**Impact:** Wrong P&L, win rate, and discipline score for every user who imports a Rithmic file.  
**Fix:** Strip rows where the symbol column is empty, `"TOTAL"`, `"Subtotal"`, or where two or more key numeric fields are missing.

---

### CRIT-2 · Missing dates silently default to today
**File:** `src/lib/csvParser.ts:156` — `return new Date().toISOString().split("T")[0]`  
**Risk:** If a CSV row has an empty or unparseable date, `normalizeDate("")` returns today. The trade is silently recorded on today's date instead of being rejected or flagged. In a 200-row file this produces 1–3 phantom trades on today's date, distorting daily stats and kill-switch logic.  
**Impact:** Daily P&L metrics, kill-switch, and prop firm daily-loss tracking can all fire incorrectly.  
**Fix:** Return `null` for empty/invalid dates. Reject the row during validation with a message, or flag it in the preview as "date missing".

---

### CRIT-3 · MM/DD vs DD/MM ambiguity is unresolved for dates 1–12
**File:** `src/lib/csvParser.ts:148` — heuristic: if first number > 12, treat as DD/MM; otherwise assume MM/DD.  
**Risk:** A UK or EU trader using `03/05/2024` (5 March) will have it imported as May 3rd. This is wrong for every day where both the day and month are ≤ 12 — i.e., the first 12 days of January through December. There is no per-user locale setting or per-preset override.  
**Impact:** Session classification, streak calculation, daily loss tracking, and the calendar view all break for EU users.  
**Fix:** Add a `dateLocale: "us" | "eu"` field to each CSV preset and expose it as a dropdown in the import UI. Default to US for US brokers (Tradovate, Rithmic, NinjaTrader) and EU for FTMO/MT5.

---

### CRIT-4 · Contract code normalisation is missing — stats fragment across expiry months
**File:** `src/CsvImportPanel.tsx:39` — `pair: (get("pair") || "").toUpperCase()` — no normalisation.  
**Risk:** Trades imported in December have pair `MESZ4`. Trades imported in March have pair `MESH5`. Every stats view (win rate by pair, session heatmap, strategy breakdown) treats them as different instruments. A trader's 200-trade NQ history is silently split across `NQZ4`, `NQH5`, `NQM5`, `NQU5`.  
**Impact:** All per-pair analytics are useless for futures traders. Prop firm mode P&L tracking becomes wrong if it sums by symbol.  
**Fix:** Add a `normaliseSymbol()` step that strips contract month/year suffixes using a regex: `/^(MNQ|MES|MYM|M2K|NQ|ES|YM|RTY|CL|GC|SI|NG|ZB|ZN|ZF|6E|6B|6J)([FGHJKMNQUVXZ]\d{1,2})?$/i`. Store the root symbol; optionally keep the original in a `contractCode` field.

---

### CRIT-5 · Duplicate key is weak when SL/TP are absent
**File:** `src/CsvImportPanel.tsx:24-27` — dedup hash includes `slPrice`, `tpPrice`, and `session`.  
**Risk:** The vast majority of broker CSV exports do not include SL or TP prices. When those fields are empty, every trade's hash is computed from `date|pair|||pnl|session`. Two trades on the same instrument on the same day with the same P&L (common for scalpers averaging 1R) will collide and one is silently dropped. Conversely, re-importing the same file with a different column mapping for `session` produces new hashes and all trades are imported again as duplicates.  
**Impact:** Legitimate trades silently dropped; or all trades duplicated if session mapping changes.  
**Fix:** Use `date + pair + entryPrice + pnl` as the minimum key (4 fields that are almost always present). Add `entryTime` when available. Remove `slPrice`, `tpPrice`, `session` from the hash.

---

### CRIT-6 · Preamble rows before header cause silent misparse
**File:** `src/lib/csvParser.ts:55` — `const headers = lines[0]` — first row is always treated as the header.  
**Risk:** Some broker exports (FTMO account statement, Interactive Brokers flex query) prepend 2–5 lines of metadata before the actual column header. `detectBroker()` will fail because it checks for column names that don't appear in the metadata row. `autoDetectMapping()` will also fail. The user sees an empty preview with confusing field mappings.  
**Impact:** FTMO and IB users face a blank screen with no actionable error.  
**Fix:** If `detectBroker()` returns `null` and fewer than 2 columns match known field hints, scan forward up to 10 rows looking for a line that scores higher. Flag as "Skipped N header rows" in the UI.

---

## 2 · Format Coverage Matrix

| Broker / Format | Preset | Auto-detect | Test fixture | Notes |
|---|---|---|---|---|
| Tradovate | ✅ | ✅ | ✅ `tradovate-export.csv` | Fills via live sync use proper FIFO aggregation; CSV treats rows as trades |
| Rithmic (Apex, Topstep legacy) | ✅ | ✅ | ✅ `rithmic-export.csv` | 5 header fallbacks; no tick-value normalisation |
| NinjaTrader 8 | ✅ | ✅ | ❌ | Untested — no fixture file |
| TopstepX | ✅ | ✅ | ❌ | Untested — no fixture file |
| FTMO / MT5 | ✅ | ✅ | ❌ | Untested — preamble rows likely (CRIT-6) |
| MT4 | ✅ | ✅ | ❌ | Untested — no fixture file |
| TradingView | ✅ | ✅ | ❌ | Untested — no fixture file |
| Interactive Brokers | ❌ | Partial | ❌ | No preset; IB flex query has metadata preamble (CRIT-6) |
| Tastytrade | ❌ | ❌ | ❌ | Not supported |
| Webull | ❌ | ❌ | ❌ | Not supported |
| FundedNext | ❌ | ❌ | ❌ | Not supported |
| MyFundedFutures | ❌ | ❌ | ❌ | Not supported |
| TraderSync generic CSV | ✅ (manual mapping) | Partial | ❌ | Manual column mapping covers generic formats |
| Excel (.xlsx) | ❌ | ❌ | ❌ | Not supported; user must save as CSV |
| TSV / tab-delimited | ✅ | ✅ | ❌ | Delimiter auto-detected; no dedicated test |

---

## 3 · Findings by Section

### Section 1 · Format Coverage

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| 7 presets (Tradovate, Rithmic, NT8, TopstepX, FTMO, MT4/5, TradingView) | Present | 5 of 7 have no test fixture — treated as untested | High | S | Collect real exports from NT8, TopstepX, FTMO, MT4, TradingView; add fixtures |
| Generic manual mapping | Present | No account-type assignment during mapping | Med | S | Add `accountType` selector to mapping step |
| Format auto-detection | Present | Preamble rows break detection (CRIT-6) | High | M | See CRIT-6 fix |
| Excel / `.xlsx` support | Missing | UK prop traders often receive P&L in Excel | Med | M | Add `xlsx` package; convert sheets to CSV before parsing |
| Tastytrade, Webull, IB, FundedNext, MFF | Missing | Growing user segments | Med | M per format | Prioritise IB (institutional crossover) and FundedNext (popular prop firm) |

---

### Section 2 · Upload UX

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| File picker | Present | Desktop-only UX; no drag-and-drop | Low | S | Add `ondrop` / `ondragover` to the upload zone |
| 10 MB file size limit | Present — `CsvImportPanel.tsx:295` | No server-side enforcement | Low | S | Mirror limit in any future server-side path |
| Progress indicator | Missing | File parse on 5,000-row file takes ~300 ms with no feedback | Med | S | Set `parsing: true` state in `reader.onload`; show "Parsing…" spinner |
| Multi-file upload | Missing | Traders with multiple accounts need to batch-import | Med | M | Add a file queue; process sequentially |
| PWA share target | Missing | Cannot receive CSV files from broker apps on mobile | Med | M | Add `share_target` to `manifest.webmanifest`; handle in service worker |
| Cancellation | Missing | No way to abort a 5,000-row parse in flight | Low | M | Deferred — client-side parse is fast enough |

---

### Section 3 · Parsing Robustness

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| UTF-8 BOM stripping | Present — `csvParser.ts:30` | — | — | — | Correct |
| CRLF / LF / CR | Present — hand-rolled parser | — | — | — | Correct |
| Comma, tab, semicolon delimiters | Present — `detectDelimiter()` | Pipe not in delimiter candidates | Low | S | Add `\|` to delimiter detection |
| Quoted fields with embedded commas | Present — RFC 4180 state machine | — | — | — | Correct |
| Empty cells | Present — returns `""` | — | — | — | Correct |
| Null literal strings ("null", "N/A", "-") | Partial — treated as text strings | `parseNum("N/A")` → `NaN` silently | Low | S | Strip known null literals in `parseNum` |
| Preamble rows | Missing | See CRIT-6 | High | M | See CRIT-6 |
| Trailing summary rows | Missing | See CRIT-1 | High | S | See CRIT-1 |
| Windows-1252 encoding | Missing | `readAsText(..., "utf-8")` mangles non-ASCII chars | Med | S | Attempt UTF-8; fall back to `"windows-1252"` if parse yields mojibake |

---

### Section 4 · Date and Time

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| ISO 8601 | Present | — | — | — | Correct |
| MM/DD/YYYY | Present | Ambiguous with DD/MM (CRIT-3) | High | S | Per-preset `dateLocale` field |
| DD/MM/YYYY | Partial — heuristic only | Silently wrong for days 1–12 | High | S | See CRIT-3 |
| 2-digit years | Present — pads to 20XX | 2099 or before 2000 will be wrong | Low | S | Acceptable for trading context |
| Missing date → today | Present `csvParser.ts:156` | Silent corruption (CRIT-2) | High | S | Return `null`; reject row |
| Timezone conversion | Missing | Only ET is handled, hardcoded as −4 h | High | M | Add per-preset `sourceTz` (e.g., `"America/Chicago"` for Rithmic/CME) |
| DST transitions | Missing | Hard-coded `−4` breaks during EST (UTC−5) in winter | High | S | Use `Intl.DateTimeFormat` offset or a lightweight tz lib for ET offset |
| Session classification | Present — `detectSessionFromDateStr()` | ET only; DST broken (same as above) | Med | S | Fix DST; sessions are otherwise correct |

---

### Section 5 · Number and Currency Parsing

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Currency symbols stripped | Present — `parseNum()` regex | — | — | — | Correct |
| Parentheses → negative | Present — `parseNum()` | — | — | — | Correct |
| Thousands separators | Present — commas stripped | European thousands separator (`.`) not handled | Med | S | If decimal separator is `,`, swap before parse |
| Comma as decimal separator | Missing | European brokers (FTMO) may use `1.250,50` | Med | S | Detect locale in `parseNum`; if value has both `.` and `,`, last separator is decimal |
| Multiple decimals in one value | Partial — `parseFloat("1.2.3")` returns `1.2` | Silent partial parse | Low | S | Validate no duplicate decimal separator |

---

### Section 6 · Symbol and Instrument Mapping

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Contract code normalisation (NQZ4 → NQ) | Missing | See CRIT-4 | High | S | See CRIT-4 |
| Micro vs full contract distinguished | Missing | MES and ES treated as different — correct only if stored as-is | Med | S | After normalisation: store `MES` and `ES` separately (correct); but add tick-value lookup per root |
| Tick value / point value table | Missing | R:R and dollar P&L calculations are wrong without it | High | M | Add instrument config: `{ NQ: { tickSize: 0.25, tickValue: 5 }, ES: { tickSize: 0.25, tickValue: 12.50 }, ... }` |
| Unknown symbol behaviour | Passes through | No warning | Low | S | Add yellow flag in preview for symbols not in a known-instruments list |
| Continuous contracts (NQ1!) | Missing | Would store `"NQ1!"` as the pair | Low | S | Strip `!` suffix and remove trailing digit in normalisation |

---

### Section 7 · Trade Aggregation

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Fill → round-turn (FIFO) | Present — Tradovate live sync only (`tradovate.ts:280`) | CSV import treats every row as a trade | Med | M | For CSV formats that export fills, add an aggregation pass before preview |
| Scale-in / scale-out | Present — Tradovate FIFO handles it | CSV: not handled | Med | M | Same as above |
| Reversals | Present — Tradovate FIFO handles it | CSV: not handled | Med | M | Same as above |
| Hedged positions | Not handled even in Tradovate path | Edge case for futures | Low | L | Defer |

---

### Section 8 · Financial Calculations

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Gross P&L | Imported as-is from CSV column | Assumes CSV P&L is net — may be gross | Med | S | Add optional `commission` column mapping; compute net = gross − commission |
| Commission / fees | Missing | No parsing or deduction | High | M | Add `commission` to `CSV_FIELD_HINTS`; add to Trade type; surface in stats |
| Net P&L formula | N/A — taken directly from CSV | If CSV provides gross only, user must know to use the right column | Med | S | Tooltip in UI: "Import the net P&L (after fees) column" |
| R:R from prices | Present — `calcRR()` | Only works when entry + SL + TP all present; most CSVs don't have SL/TP | Low | — | Acceptable fallback |
| Dollar P&L | Stored in `pnlDollar` | Not used in R:R calculation — no tick value data | High | M | See tick value gap above |
| Currency conversion | Missing | FTMO accounts are in EUR/USD; user sees raw values | Low | M | Add `accountCurrency` to preset; convert to user's display currency |

---

### Section 9 · Validation and Error Reporting

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| File-level errors | Present — clear messages | — | — | — | Good |
| Per-row validation | Missing | Invalid rows silently produce empty/wrong trades | High | M | Build `validationErrors: { row: number; field: string; message: string }[]`; show in preview |
| Missing date → today | Present but wrong (CRIT-2) | See CRIT-2 | High | S | Return null, reject row |
| Missing pair | Silently stored as `""` | Empty-pair trades corrupt all pair-based analytics | High | S | Reject rows where pair is empty after normalisation |
| Preview before commit | Present — analytics reveal modal | Does not show per-row errors | Med | M | Add "N rows with issues" tab to the reveal modal |
| Edit mapping and re-preview | Present — live re-calculation | — | — | — | Good |

---

### Section 10 · Duplicate Detection

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Content hash dedup | Present | Hash includes SL/TP which are usually empty (CRIT-5) | High | S | See CRIT-5 |
| Broker trade IDs | Missing | Tradovate fill IDs available in live sync but not in CSV path | Med | M | Add `tradeId` to `CSV_FIELD_HINTS`; if present, use as primary dedup key |
| Re-import same file | Handled via dedup | — | — | — | Good |
| Overlapping date ranges | Handled via dedup | — | — | — | Adequate |

---

### Section 11 · Account Assignment

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Account type on import | Missing | `accountType` field exists on `Trade` but is not set during CSV import | Med | S | Add account-type segmented picker (Personal / Funded / Demo) to import UI — same component as in LogTradeScreen |
| Multiple accounts | Not in scope of import flow | Trades imported to the single journal | Low | L | Post-launch: per-account P&L tracking |

---

### Section 12 · Performance and Scale

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Client-side parsing | Present | Fine for <5,000 rows | Low | — | Good |
| 5,000-row cap | Present — `CsvImportPanel.tsx:358` | No feedback when file is truncated | Med | S | Show "File contains 12,000 rows — only first 5,000 imported" |
| Chunked / streamed parsing | Missing | 5,000 × 20 columns still fast on mobile | Low | L | Defer |
| No progress indicator | Missing | See Section 2 | Med | S | See Section 2 |
| DB writes | Passed via callback to parent | Batching responsibility unclear | Low | S | Confirm `saveTrades()` does a single upsert, not row-by-row |

---

### Section 13 · Storage and Audit Trail

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Original CSV stored | Missing | Cannot reprocess with updated parser | Med | M | Upload to Supabase Storage at `imports/{userId}/{timestamp}.csv`; store ref in DB |
| Import audit record | Missing | No import history, no row count metadata | Med | M | Add `imports` table: `(id, user_id, filename, imported_at, row_count, dupe_count, error_count)` |
| Re-import from stored CSV | Missing | Follows from storage gap | Low | L | Implement after storage is in place |
| Undo import | Missing | Cannot roll back a bad import | Med | M | Add `import_id` to Trade; "Delete import" deletes all trades sharing that ID |

---

### Section 14 · Post-Import Flow

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Analytics reveal modal (pre-commit) | Present | Good summary stats | — | — | Good |
| Post-commit summary | Missing | UI returns to empty state after confirm | Med | S | After import, navigate to trade list filtered to today's import; show brief toast with counts |
| Stats recalculate | Present — derived from full trades array | — | — | — | Good |
| Prop firm metrics recalculate | Present | Driven by full trades array; correct | — | — | Good |
| Discipline score | Present in stats view | Not shown in post-import summary | Low | S | Add discipline score to reveal modal |

---

### Section 15 · Prop-Firm-Specific Logic

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Daily P&L reset at session boundary | Missing | Daily P&L uses calendar date, not prop firm's 6pm ET cutoff | Med | M | Add `sessionBoundaryTz` to prop firm profile; recompute daily P&L with offset |
| Trailing drawdown tracking | Missing | Prop firm mode tracks P&L but not running peak balance | High | M | Track `peakBalance` from opening balance + cumulative P&L; compute trailing DD from peak |
| Consistency rule violations | Missing | 30% rule (no day > 30% of total profit) not checked on import | Med | M | Post-import pass: flag days where that day's P&L > 30% of total P&L |
| Max loss day breach detection | Missing | No historical breach flag on trades | Med | M | Add `breachedDailyLimit: boolean` field; set during import if that day's P&L < −dailyLossLimit |
| Account balance reconciliation | Missing | Imported P&L not reconciled against declared starting balance | Low | L | Derive running balance; warn if it diverges from declared amount |

---

### Section 16 · Behavioural Data Backfill

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Imported trades flow into session classification | Present — `detectSessionFromDateStr()` | DST bug breaks winter imports | Med | S | Fix DST (same fix as Section 4) |
| Strategy bulk-tagging of historical trades | Missing | No batch-edit in import flow | Med | M | Add "Tag all imported trades as strategy X" step to import flow |
| Pre-Kōda trades distinguished | Missing | No `source` flag set on CSV imports | Low | S | Set `source: "csv_import"` on all imported trades (field exists in `types.ts:43`) |
| Daily loss limit backfill | Present via app state | Correct once trades are in | — | — | Good |

---

### Section 17 · Testing Coverage

| Item | State | Gap | Sev | Effort | Action |
|---|---|---|---|---|---|
| Unit tests — `csvParser.ts` | Present — 48 tests | No test for trailing summary row | High | S | Add edge-case fixtures: trailing totals, preamble rows, EU date format, comma decimal |
| Unit tests — `CsvImportPanel.tsx` | Missing | No component tests | Med | M | Add Vitest/RTL tests for: dedup display, preview rendering, account assignment |
| Fixtures — Tradovate | Present | — | — | — | Good |
| Fixtures — Rithmic | Present | — | — | — | Good |
| Fixtures — NinjaTrader 8 | Missing | Format is "supported" but untested | High | S | Collect real NT8 export; add to `__fixtures__/` |
| Fixtures — TopstepX | Missing | Untested | High | S | Collect real TopstepX export |
| Fixtures — FTMO / MT5 | Missing | Preamble rows make this risky | High | S | Collect real FTMO export; expected to trigger CRIT-6 |
| Fixtures — MT4 | Missing | Untested | Med | S | Collect MT4 export |
| Fixtures — TradingView | Missing | Untested | Med | S | Collect TradingView export |
| Edge-case fixtures | Missing | Empty file, header-only, all-duplicates, BOM, EU dates, summary rows | High | S | Create synthetic fixtures for each; add to test suite |
| Integration test coverage | Present but limited | Only Tradovate + Rithmic end-to-end | High | S | Extend integration tests to cover all supported presets once fixtures exist |

---

## 4 · Sample Fixture Gaps

Formats with a preset in code but **no fixture file** — treat these as **untested** until a real export is in the repo:

| Format | Export path to collect from |
|---|---|
| NinjaTrader 8 | Account Performance → Export → CSV |
| TopstepX | Performance → Trade History → Export |
| FTMO / MT5 | MT5 terminal → History → Save as Report → right-click → Export as CSV |
| MT4 | MT4 terminal → Account History → Save as Report |
| TradingView | Paper Trading → Trade History → Export |

**Synthetic edge-case fixtures to create** (no real broker needed):

| Fixture | Purpose |
|---|---|
| `trailing-total-row.csv` | CRIT-1: last row is `TOTAL,,,,12000` |
| `preamble-rows.csv` | CRIT-6: 3 metadata rows before header |
| `eu-date-format.csv` | CRIT-3: dates as `05.03.2024` |
| `comma-decimal.csv` | Section 5: P&L as `1.250,50` |
| `bom-windows1252.csv` | Section 3: Windows-1252 encoded with BOM |
| `empty-date-field.csv` | CRIT-2: one row with empty date column |
| `contract-codes.csv` | CRIT-4: symbols as `NQH5`, `MESM5`, `ESZ4` |
| `header-only.csv` | Edge case: header row but no data rows |
| `all-duplicates.csv` | Re-import of existing trades |

---

## 5 · Suggested Sequencing
*(Updated after Dylon's answers — 2026-05-27)*

### Phase (a) · Correctness + Launch Blockers
*Silent P&L corruption + the one feature Dylon confirmed is a launch blocker.*

1. **CRIT-2** — Missing date defaults to today → return `null`, reject row (`csvParser.ts:156`)
2. **CRIT-1** — Trailing summary rows → filter "TOTAL" / empty-symbol rows before preview
3. **CRIT-5** — Weak dedup key → remove SL/TP from hash, use `date + pair + entryPrice + pnl`
4. **CRIT-3** — Date locale ambiguity → add `dateLocale` to each preset; expose in UI
5. **CRIT-4** — Contract code normalisation → strip month/year suffix; store root symbol
6. **DST bug in session detection** → use `Intl.DateTimeFormat` for ET offset (Section 4)
7. **Per-row error surface** → build `validationErrors[]`; show in preview (Section 9)
8. **Missing pair rejects row** → required-field guard (Section 9)
9. **Gross/net P&L toggle** → add "Is this P&L gross or net?" step to import UI; show optional commission field when gross is selected *(Dylon Q4)*
10. **Excel `.xlsx` support** → add `xlsx` package; convert sheet to CSV before parsing *(Dylon confirmed launch blocker)*
11. **`source: "csv_import"`** → stamp on all imported trades *(decided: yes)*
12. **5,000-row truncation warning** → show "File has X rows — first 5,000 imported" when capped

---

### Phase (b) · Coverage — Needed for Prop Firm Market

1. **Rithmic dual-format support** — collect both R\|Trader Pro and Apex web exports; add second Rithmic preset or unified detection *(Dylon Q1)*
2. **Collect real fixture files** for all untested presets: NT8, TopstepX, FTMO, MT4, TradingView
3. **CRIT-6 preamble row detection** — blocks FTMO users; confirmed untested preset *(Dylon Q3)*
4. **TopstepX format verification** — get a real export; update preset if wrong *(Dylon Q2)*
5. **Tick value / multiplier table** — NQ $20/pt, MNQ $2/pt, ES $50/pt, MES $5/pt, YM $5/pt, MYM $0.50/pt, RTY $10/pt, M2K $1/pt; used to compute dollar P&L when broker column missing *(Dylon Q5)*
6. **`tradeId` column mapping** → broker-ID-based dedup for formats that provide one
7. **`accountType` selector in import flow** (Personal / Funded / Demo) — already on LogTradeScreen, bring to import
8. **Prop firm: trailing drawdown** — confirm Apex daily reset time first *(Dylon Q6 — pending)*
9. **Prop firm: consistency rule flag** on import

---

### Phase (c) · Polish — Post-Launch Growth

1. Drag-and-drop upload zone
2. PWA share target in `manifest.webmanifest` — receive CSVs from broker apps on mobile
3. Original CSV archived to Supabase Storage
4. Import audit record in DB with `import_id` on trades
5. Undo import — delete all trades by `import_id`
6. Strategy bulk-tagging in import flow
7. Multi-file batch upload
8. Progress indicator during parse
9. Post-commit navigation to filtered trade list
10. Comma-as-decimal-separator for EU FTMO users (when currency handling is added)

---

## 6 · Questions for Dylon

1. **Rithmic exports** — do Apex traders export from the Rithmic R|Trader Pro desktop, or from a web dashboard? The format differs. Can you export a real file to confirm the fixture matches?

2. **TopstepX** — TopstepX migrated from their own platform to Quantower. Does the CSV format in the current preset match the Quantower export, or the old TopstepX web export?

3. **FTMO** — FTMO MT5 exports always prepend 3 metadata rows (account number, date range, balance). Is the current FTMO preset tested against a real file, or was it built from documentation? (Expected to trigger CRIT-6.)

4. **Commission handling** — should imported P&L be treated as gross (before fees) or net (after fees)? Tradovate shows net by default; Rithmic shows net; NinjaTrader shows gross. Having a per-preset flag would cover this cleanly.

5. **Tick values** — should the app compute dollar P&L from entry/exit prices and quantity (which requires tick values), or is importing the broker's reported dollar P&L sufficient? If the latter, does the `pnlDollar` field need to be the required field instead of `pnl` (R-multiple)?

6. **Prop firm session boundary** — what time does your primary prop firm (Apex/Rithmic) reset the daily loss counter? 6 pm ET is the CME Globex open and common in the industry, but confirm so the reset logic can be hardcoded correctly.

7. **Account currency** — FTMO accounts are denominated in EUR or USD. Should Kōda convert to the user's chosen display currency, or store in the account currency and label it clearly?

8. **`source` field** — `Trade.source` exists but is not set during CSV import. Confirm you want `source: "csv_import"` stamped on all imported trades (affects future "pre-Kōda vs in-Kōda" segmentation in analytics).

9. **5,000-row cap** — is this sufficient for your target users? A trader with 3 years of daily NQ trades could have 3,000–4,000 rows in one export. The cap feels right but confirm.

10. **`.xlsx` priority** — some brokers (Interactive Brokers, some prop firm dashboards) only export `.xlsx`, not `.csv`. Is Excel support a launch blocker or a nice-to-have?
