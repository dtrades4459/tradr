// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · LogTradeScreen
//
// Extracted from Koda.tsx — the "log" view (view === "log").
// Restyled to match koda-screens.jsx LogScreen design:
//   Card-wrapped sections, SegBtn outcome, design-spec Save button.
// All state lives in the parent Tradr component and is passed down as props.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import type { Trade } from "./types";
import { Card, Kicker, Pill, FloatingInput, MONO, BODY, DISPLAY } from "./shared";
import type { Theme } from "./theme";
import { SESSIONS, BIAS, EMOTION_TAGS, MISTAKE_TAGS, getEmotionTags } from "./tradeConstants";

export interface LogTradeScreenProps {
  C: Record<string, string>;
  form: Partial<Trade>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Trade>>>;
  editId: string | null;
  setEditId: (id: string | null) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  handleScreenshotUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string | null) => void;
  removeScreenshot: (id: string | null) => void;
  submitTrade: () => void;
  savingTrade: boolean;
  allStrategyNames: string[];
  _allStratMap: Record<string, { setups: string[] }>;
  allSetups: string[];
  setView: (v: string) => void;
}

/* ── Segmented outcome button (matches koda-screens.jsx SegBtn) ── */
function SegBtn({ active, label, color, border2, onClick }: {
  active: boolean; label: string; color: string; border2: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 14,
      background: active ? `color-mix(in oklch, ${color} 16%, transparent)` : "transparent",
      border: active ? `1px solid ${color}` : `1px solid ${border2}`,
      color: active ? color : "inherit",
      fontSize: 12, fontWeight: 600, fontFamily: BODY, letterSpacing: "0.02em",
      cursor: "pointer", transition: "all 0.15s",
    }}>{label}</button>
  );
}

export function LogTradeScreen({
  C, form, setForm, editId, setEditId,
  handleChange, handleScreenshotUpload, removeScreenshot,
  submitTrade, savingTrade,
  allStrategyNames, _allStratMap, allSetups, setView,
}: LogTradeScreenProps) {
  const T = C as any as Theme;
  const live = T.live ?? "oklch(0.84 0.14 175)";
  const enabled = !!(form.pair && form.date && form.outcome && !savingTrade);

  /* Shared input base for FloatingInput-style fields */
  const inp: React.CSSProperties = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${C.border2}`, borderRadius: 0,
    color: C.text, padding: "12px 0", minHeight: 44,
    fontSize: 16, width: "100%", outline: "none",
    fontFamily: BODY, boxSizing: "border-box", letterSpacing: "0.01em",
  };
  const sel: React.CSSProperties = {
    background: C.panel ?? "#131317", color: C.text ?? "#e2e8f0",
    border: `1px solid ${C.border2 ?? "#2a2a3e"}`,
    borderRadius: 12, padding: "11px 14px",
    fontFamily: MONO, fontSize: 13, width: "100%",
    WebkitAppearance: "none" as const,
    outline: "none", cursor: "pointer",
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, color: C.muted, letterSpacing: "0.06em",
    marginBottom: 4, display: "block", fontFamily: MONO, textTransform: "uppercase",
  };

  return (
    <div style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap: 12, marginTop: "clamp(4px, 2vw, 12px)" }}>

      {/* ── Instrument + Direction ── */}
      <Card C={T} glass pad={20}>
        <Kicker C={T}>{editId ? "Edit trade" : "Instrument"}</Kicker>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 10 }}>
          <div>
            <label style={lbl}>Pair / Instrument</label>
            <input name="pair" value={form.pair} onChange={handleChange} placeholder="ES" style={inp} />
          </div>
          <div>
            <label style={lbl}>Direction</label>
            <select name="direction" value={form.direction || ""} onChange={handleChange} style={sel}>
              <option value="">Select</option><option>Long</option><option>Short</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
          <div>
            <label style={lbl}>Date</label>
            <input type="date" name="date" value={form.date} onChange={handleChange} style={inp} />
          </div>
          <div>
            <label style={lbl}>Session</label>
            <select name="session" value={form.session} onChange={handleChange} style={sel}>
              <option value="">Select</option>
              {SESSIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* ── Outcome (segmented buttons) ── */}
      <Card C={T} pad={16}>
        <Kicker C={T}>Outcome</Kicker>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {(["Win", "Loss", "Breakeven"] as const).map(o => {
            const col = o === "Win" ? C.green : o === "Loss" ? C.red : C.text2;
            return (
              <SegBtn key={o} active={form.outcome === o} label={o === "Breakeven" ? "BE" : o}
                color={col} border2={C.border2}
                onClick={() => setForm(f => ({ ...f, outcome: form.outcome === o ? "" : o }))} />
            );
          })}
        </div>
      </Card>

      {/* ── R-multiple + P&L ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card C={T} pad={16}>
          <Kicker C={T}>P&L (R)</Kicker>
          <input type="number" name="pnl" value={form.pnl} onChange={handleChange} placeholder="+2.5"
            style={{ ...inp, fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", borderBottom: "none", padding: "8px 0 0" }} />
        </Card>
        <Card C={T} pad={16}>
          <Kicker C={T}>Net P&L</Kicker>
          <input type="number" name="pnlDollar" value={form.pnlDollar} onChange={handleChange} placeholder="$485"
            style={{ ...inp, fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", borderBottom: "none", padding: "8px 0 0" }} />
        </Card>
      </div>

      {/* ── Strategy + Setup ── */}
      <Card C={T} pad={18}>
        <Kicker C={T}>Strategy</Kicker>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {allStrategyNames.map(s => (
            <Pill key={s} C={T} size="sm" active={form.strategy === s}
              onClick={() => setForm(f => ({ ...f, strategy: form.strategy === s ? "" : s, setup: "" }))}>
              {s}
            </Pill>
          ))}
        </div>
        {form.strategy && (
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Setup · {form.strategy.slice(0, 3).toUpperCase()}</label>
            <select name="setup" value={form.setup} onChange={handleChange} style={sel}>
              <option value="">Select setup</option>
              {(_allStratMap[form.strategy]?.setups || []).map((s: string) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        {!form.strategy && (
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Setup</label>
            <select name="setup" value={form.setup} onChange={handleChange} style={sel}>
              <option value="">Select setup</option>
              {allSetups.map((s: string) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
      </Card>

      {/* ── Prices (Entry / SL / TP) ── */}
      <Card C={T} pad={18}>
        <Kicker C={T}>Price levels</Kicker>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
          <div><label style={lbl}>Entry</label><input type="number" name="entryPrice" value={form.entryPrice} onChange={handleChange} placeholder="0.00" style={inp} /></div>
          <div><label style={lbl}>Stop Loss</label><input type="number" name="slPrice" value={form.slPrice} onChange={handleChange} placeholder="0.00" style={inp} /></div>
          <div><label style={lbl}>Take Profit</label><input type="number" name="tpPrice" value={form.tpPrice} onChange={handleChange} placeholder="0.00" style={inp} /></div>
        </div>
        {form.rr && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Calculated R:R</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 22, color: C.text, fontWeight: 500, letterSpacing: "-0.02em" }}>{form.rr}R</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div><label style={lbl}>Entry Time</label><input type="time" name="entryTime" value={form.entryTime || ""} onChange={handleChange} style={inp} /></div>
          <div><label style={lbl}>Exit Time</label><input type="time" name="exitTime" value={form.exitTime || ""} onChange={handleChange} style={inp} /></div>
        </div>
      </Card>

      {/* ── Bias ── */}
      <Card C={T} pad={16}>
        <Kicker C={T}>Bias</Kicker>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {BIAS.map(b => (
            <Pill key={b} C={T} size="sm" active={form.bias === b}
              onClick={() => setForm(f => ({ ...f, bias: form.bias === b ? "" : b }))}>
              {b}
            </Pill>
          ))}
        </div>
      </Card>

      {/* ── Discipline check ── */}
      <Card C={T} pad={18}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Kicker C={T}>Discipline check</Kicker>
          {form.ruleAdherence !== null && form.ruleAdherence !== undefined && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: form.ruleAdherence ? C.green : C.red }}>
              {form.ruleAdherence ? "Rules followed ✓" : "Rules broken ✗"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {([{ val: true, label: "YES", color: C.green }, { val: false, label: "NO", color: C.red }] as const).map(opt => (
            <SegBtn key={String(opt.val)} active={form.ruleAdherence === opt.val}
              label={opt.label} color={opt.color} border2={C.border2}
              onClick={() => setForm(f => ({ ...f, ruleAdherence: form.ruleAdherence === opt.val ? null : opt.val }))} />
          ))}
        </div>
      </Card>

      {/* ── Emotional State ── */}
      <Card C={T} pad={18}>
        <Kicker C={T}>Emotional state</Kicker>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {EMOTION_TAGS.map(tag => {
            const active = getEmotionTags(form.emotions).includes(tag.id);
            return (
              <Pill key={tag.id} C={T} size="sm" active={active}
                onClick={() => {
                  const current = getEmotionTags(form.emotions);
                  const next = active ? current.filter(t => t !== tag.id) : [...current, tag.id];
                  setForm(f => ({ ...f, emotions: next.join(",") }));
                }}
                style={{
                  background: active ? tag.color + "22" : undefined,
                  color: active ? tag.color : undefined,
                  borderColor: active ? tag.color : undefined,
                }}>
                {tag.label}
              </Pill>
            );
          })}
        </div>
      </Card>

      {/* ── Mistake tag ── */}
      <Card C={T} pad={18}>
        <Kicker C={T}>Mistake (optional)</Kicker>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {MISTAKE_TAGS.map(tag => {
            const active = form.mistake === tag;
            return (
              <Pill key={tag} C={T} size="sm" active={active}
                onClick={() => setForm(f => ({ ...f, mistake: active ? null : tag }))}
                style={{
                  background: active ? `color-mix(in oklch, ${C.red} 14%, transparent)` : undefined,
                  color: active ? C.red : undefined,
                  borderColor: active ? C.red : undefined,
                }}>
                {tag}
              </Pill>
            );
          })}
        </div>
      </Card>

      {/* ── MAE / MFE ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card C={T} pad={16}>
          <Kicker C={T}>MAE (R)</Kicker>
          <input name="mae" type="number" step="0.01" value={form.mae || ""} onChange={handleChange} placeholder="0.8"
            style={{ ...inp, fontFamily: DISPLAY, fontSize: 22, fontWeight: 500, borderBottom: "none", padding: "6px 0 0" }} />
        </Card>
        <Card C={T} pad={16}>
          <Kicker C={T}>MFE (R)</Kicker>
          <input name="mfe" type="number" step="0.01" value={form.mfe || ""} onChange={handleChange} placeholder="3.2"
            style={{ ...inp, fontFamily: DISPLAY, fontSize: 22, fontWeight: 500, borderBottom: "none", padding: "6px 0 0" }} />
        </Card>
      </div>

      {/* ── Notes ── */}
      <Card C={T} pad={16}>
        <Kicker C={T}>Notes</Kicker>
        <textarea name="notes" value={form.notes} onChange={handleChange}
          placeholder="What did price do? Why did you enter?"
          rows={3}
          style={{ ...inp, resize: "vertical", lineHeight: 1.55, marginTop: 6, borderBottom: "none" }} />
      </Card>

      {/* ── Screenshot ── */}
      <Card C={T} pad={16}>
        <Kicker C={T}>Screenshot</Kicker>
        {form.screenshot ? (
          <div style={{ position: "relative", marginTop: 8 }}>
            <img src={form.screenshot} alt="screenshot"
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12,
                display: "block", maxHeight: 200, objectFit: "cover" }} loading="lazy" />
            <button onClick={() => removeScreenshot(null)}
              style={{ position: "absolute", top: 8, right: 8, background: C.bg,
                border: `1px solid ${C.border2}`, borderRadius: 999, color: C.text,
                padding: "4px 10px", cursor: "pointer", fontSize: 10, fontFamily: MONO, letterSpacing: "0.08em" }}>
              REMOVE
            </button>
          </div>
        ) : (
          <label htmlFor="ssUpload" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px dashed ${C.border2}`, borderRadius: 14, padding: 20,
            cursor: "pointer", color: C.muted, fontSize: 12, fontFamily: MONO,
            letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 8,
          }}>
            Upload screenshot
            <input id="ssUpload" type="file" accept="image/jpeg,image/png"
              onChange={e => handleScreenshotUpload(e, null)} style={{ display: "none" }} />
          </label>
        )}
      </Card>

      {/* ── Save button (design-spec: teal arrow CTA) ── */}
      <button onClick={submitTrade} disabled={savingTrade || !(form.pair && form.date && form.outcome)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: enabled ? C.text : (C as any).panel2 ?? C.panel,
          color: enabled ? C.bg : C.muted,
          border: "none", borderRadius: 14,
          padding: "5px 6px 5px 20px", fontSize: 14, fontWeight: 600,
          cursor: enabled ? "pointer" : "not-allowed", width: "100%",
          fontFamily: BODY, marginTop: 4, opacity: enabled ? 1 : 0.6,
          transition: "opacity 0.2s",
        }}>
        <span>{savingTrade ? "Saving…" : editId ? "Update trade" : "Save trade"}</span>
        <span style={{
          width: 36, height: 36, borderRadius: 999,
          background: enabled ? live : C.muted,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          boxShadow: enabled ? `0 0 0 4px color-mix(in oklch, ${live} 25%, transparent)` : "none",
          transition: "box-shadow 0.2s",
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke={enabled ? "#0A0A0A" : C.bg} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>

      {editId && (
        <button onClick={() => { setEditId(null); setView("history"); }}
          style={{
            background: "transparent", border: `1px solid ${C.border2}`, borderRadius: 999,
            padding: "12px 20px", color: C.muted, cursor: "pointer",
            fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
            width: "100%", textAlign: "center",
          }}>CANCEL EDIT</button>
      )}
    </div>
  );
}
