// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · LotSizeCalculator  (Futures only)
//
// Floating modal — Quick Action accessible from any screen.
// Takes: contract, balance, risk % or fixed $, entry price, stop loss price.
// Outputs: contracts to trade + exact risk amount + stop distance in ticks.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { MONO, BODY } from "./shared";

// ─── Futures contract specs ───────────────────────────────────────────────────

interface FuturesSpec {
  label:     string;
  tickSize:  number;   // min price move
  tickValue: number;   // $ per tick per contract
}

const SPECS: Record<string, FuturesSpec> = {
  ES:  { label: "ES  · E-mini S&P 500",        tickSize: 0.25,     tickValue: 12.50  },
  MES: { label: "MES · Micro S&P 500",          tickSize: 0.25,     tickValue: 1.25   },
  NQ:  { label: "NQ  · E-mini Nasdaq 100",      tickSize: 0.25,     tickValue: 5.00   },
  MNQ: { label: "MNQ · Micro Nasdaq 100",       tickSize: 0.25,     tickValue: 0.50   },
  RTY: { label: "RTY · E-mini Russell 2000",    tickSize: 0.10,     tickValue: 5.00   },
  M2K: { label: "M2K · Micro Russell 2000",     tickSize: 0.10,     tickValue: 0.50   },
  YM:  { label: "YM  · E-mini Dow",             tickSize: 1,        tickValue: 5.00   },
  MYM: { label: "MYM · Micro Dow",              tickSize: 1,        tickValue: 0.50   },
  CL:  { label: "CL  · Crude Oil",              tickSize: 0.01,     tickValue: 10.00  },
  MCL: { label: "MCL · Micro Crude Oil",        tickSize: 0.01,     tickValue: 1.00   },
  GC:  { label: "GC  · Gold",                   tickSize: 0.10,     tickValue: 10.00  },
  MGC: { label: "MGC · Micro Gold",             tickSize: 0.10,     tickValue: 1.00   },
  SI:  { label: "SI  · Silver",                 tickSize: 0.005,    tickValue: 25.00  },
  NG:  { label: "NG  · Natural Gas",            tickSize: 0.001,    tickValue: 10.00  },
  ZN:  { label: "ZN  · 10-Yr T-Note",           tickSize: 0.015625, tickValue: 15.625 },
  ZB:  { label: "ZB  · 30-Yr T-Bond",           tickSize: 0.03125,  tickValue: 31.25  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface LotSizeCalculatorProps {
  C:       Record<string, string>;
  onClose: () => void;
}

type RiskMode = "percent" | "fixed";

export function LotSizeCalculator({ C, onClose }: LotSizeCalculatorProps) {

  const [symbol,    setSymbol]    = useState("MES");
  const [riskMode,  setRiskMode]  = useState<RiskMode>("percent");
  const [balance,   setBalance]   = useState("");
  const [riskPct,   setRiskPct]   = useState("1");
  const [riskFixed, setRiskFixed] = useState("");
  const [entry,     setEntry]     = useState("");
  const [stop,      setStop]      = useState("");

  // ── Compute ─────────────────────────────────────────────────────────────────

  const calc = useMemo(() => {
    const spec = SPECS[symbol];
    const ent  = parseFloat(entry);
    const stp  = parseFloat(stop);
    if (!spec || isNaN(ent) || isNaN(stp)) return null;
    if (ent === stp) return { error: "Entry and stop loss cannot be the same." };

    const stopPoints = Math.abs(ent - stp);
    const stopTicks  = stopPoints / spec.tickSize;
    const riskPerContract = stopTicks * spec.tickValue;

    let riskDollars: number;
    if (riskMode === "percent") {
      const bal = parseFloat(balance);
      const pct = parseFloat(riskPct);
      if (isNaN(bal) || bal <= 0) return { error: "Enter your account balance.", stopPoints, stopTicks };
      if (isNaN(pct) || pct <= 0 || pct > 100) return { error: "Risk % must be between 0.01 and 100.", stopPoints, stopTicks };
      riskDollars = bal * (pct / 100);
    } else {
      const fx = parseFloat(riskFixed);
      if (isNaN(fx) || fx <= 0) return { error: "Enter a fixed risk amount.", stopPoints, stopTicks };
      riskDollars = fx;
    }

    const contracts = Math.floor(riskDollars / riskPerContract);
    const actualRisk = contracts * riskPerContract;
    return { contracts, riskDollars, actualRisk, stopPoints, stopTicks, riskPerContract };
  }, [symbol, riskMode, balance, riskPct, riskFixed, entry, stop]);

  // ── Styles ───────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: `1px solid ${C.border ?? "#333"}`,
    background: C.surface2 ?? "#2a2a3e",
    color: C.text ?? "#e2e8f0",
    fontFamily: BODY, fontSize: 14, boxSizing: "border-box",
    outline: "none",
  };

  const lbl: React.CSSProperties = {
    fontSize: 11, fontFamily: MONO, fontWeight: 600,
    letterSpacing: "0.06em", textTransform: "uppercase" as const,
    color: C.muted ?? "#888", marginBottom: 5, display: "block",
  };

  const tabBtn = (active: boolean, accent?: string): React.CSSProperties => ({
    flex: 1, padding: "9px 0", border: "none", borderRadius: 9, cursor: "pointer",
    fontFamily: BODY, fontSize: 13, fontWeight: 600, transition: "background 0.15s",
    background: active ? (accent ?? C.accent ?? "#7c3aed") : (C.surface2 ?? "#2a2a3e"),
    color: active ? "#fff" : (C.muted ?? "#888"),
  });

  const spec = SPECS[symbol];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.card ?? "#1a1a2e",
        width: "100%", maxWidth: 460,
        borderRadius: "22px 22px 0 0",
        padding: "22px 20px 40px",
        maxHeight: "90dvh", overflowY: "auto",
      }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.text ?? "#e2e8f0", lineHeight: 1.2 }}>
              Position Size Calculator
            </div>
            <div style={{ fontSize: 12, color: C.muted ?? "#888", marginTop: 3 }}>Futures</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted ?? "#888", fontSize: 20, padding: "2px 4px", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Contract ── */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Contract</label>
          <select
            style={{ ...inp, cursor: "pointer" }}
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
          >
            {Object.entries(SPECS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* ── Spec badges ── */}
        {spec && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "TICK SIZE",  val: spec.tickSize  },
              { label: "TICK VALUE", val: `$${spec.tickValue}` },
            ].map(({ label, val }) => (
              <div key={label} style={{
                background: "#f59e0b18", color: "#f59e0b",
                borderRadius: 6, padding: "3px 9px",
                fontFamily: MONO, fontSize: 11, fontWeight: 700,
              }}>
                {label}: {val}
              </div>
            ))}
          </div>
        )}

        {/* ── Risk mode ── */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Risk Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={tabBtn(riskMode === "percent")} onClick={() => setRiskMode("percent")}>% of Balance</button>
            <button style={tabBtn(riskMode === "fixed")}   onClick={() => setRiskMode("fixed")}>Fixed $</button>
          </div>
        </div>

        {/* ── Balance / risk amount ── */}
        {riskMode === "percent" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Account Balance ($)</label>
              <input style={inp} type="number" inputMode="decimal" placeholder="50000" value={balance} onChange={e => setBalance(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Risk %</label>
              <input style={inp} type="number" inputMode="decimal" placeholder="1" step="0.1" value={riskPct} onChange={e => setRiskPct(e.target.value)} />
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Risk Amount ($)</label>
            <input style={inp} type="number" inputMode="decimal" placeholder="200" value={riskFixed} onChange={e => setRiskFixed(e.target.value)} />
          </div>
        )}

        {/* ── Entry + Stop ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <div>
            <label style={lbl}>Entry Price</label>
            <input style={inp} type="number" inputMode="decimal" placeholder="5280.25" value={entry} onChange={e => setEntry(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Stop Loss Price</label>
            <input style={inp} type="number" inputMode="decimal" placeholder="5272.00" value={stop} onChange={e => setStop(e.target.value)} />
          </div>
        </div>

        {/* ── Result ── */}
        {calc && "error" in calc && calc.error ? (
          <div style={{
            background: "#ef444415", border: "1px solid #ef444430",
            borderRadius: 12, padding: "12px 14px",
            color: "#ef4444", fontFamily: MONO, fontSize: 13,
          }}>
            {calc.error}
          </div>

        ) : calc && "contracts" in calc ? (
          <div style={{
            background: (calc.contracts ?? 0) > 0
              ? `${C.accent ?? "#7c3aed"}18`
              : "#6b728018",
            border: `1px solid ${(calc.contracts ?? 0) > 0 ? (C.accent ?? "#7c3aed") + "33" : "#6b728033"}`,
            borderRadius: 16, padding: "20px 16px",
          }}>
            {/* Main numbers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 16 }}>
              <div style={{ textAlign: "center", borderRight: `1px solid ${C.border ?? "#333"}`, paddingRight: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.muted ?? "#888", marginBottom: 6 }}>CONTRACTS</div>
                <div style={{
                  fontSize: 44, fontWeight: 800, fontFamily: MONO, lineHeight: 1,
                  color: (calc.contracts ?? 0) > 0 ? (C.accent ?? "#7c3aed") : (C.muted ?? "#888"),
                }}>
                  {calc.contracts}
                </div>
                {calc.contracts === 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: "#f59e0b", marginTop: 6, lineHeight: 1.4 }}>
                    Risk too small for 1 contract
                  </div>
                )}
              </div>
              <div style={{ textAlign: "center", paddingLeft: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.muted ?? "#888", marginBottom: 6 }}>RISK</div>
                <div style={{ fontSize: 30, fontWeight: 700, fontFamily: MONO, lineHeight: 1, color: C.text ?? "#e2e8f0" }}>
                  ${calc.actualRisk?.toFixed(2) ?? "0.00"}
                </div>
                {riskMode === "percent" && balance && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted ?? "#888", marginTop: 6 }}>
                    of ${parseFloat(balance).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Stop details */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              borderTop: `1px solid ${C.border ?? "#2a2a3e"}`, paddingTop: 14, gap: 8,
            }}>
              {[
                { label: "STOP TICKS",  value: calc.stopTicks?.toFixed(0) },
                { label: "STOP POINTS", value: calc.stopPoints?.toFixed(2) },
                { label: "RISK/CONTRACT", value: `$${calc.riskPerContract?.toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.07em", color: C.muted ?? "#888", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.text ?? "#e2e8f0" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

        ) : (
          <div style={{
            background: C.surface2 ?? "#2a2a3e", borderRadius: 14,
            padding: "22px 16px", textAlign: "center",
            color: C.muted ?? "#888", fontFamily: MONO, fontSize: 12, lineHeight: 1.6,
          }}>
            Enter entry price and stop loss<br />to calculate position size
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: 14, textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.muted ?? "#888", opacity: 0.6, lineHeight: 1.5 }}>
          For reference only · Not financial advice · Verify with your broker
        </div>
      </div>
    </div>
  );
}
