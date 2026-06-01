import { useState, useRef, useCallback, useEffect } from "react";
import type { Trade, StrategyDef } from "./types";
import type { Theme } from "./theme";
import { MONO, BODY } from "./shared";
import { EMOTION_TAGS, MISTAKE_TAGS } from "./tradeConstants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeTaggerProps {
  trades: Trade[];
  strategies: Record<string, StrategyDef>;
  allStrategyNames: string[];
  onSave: (id: number, updates: Partial<Trade>) => Promise<void>;
  onDone: (savedCount: number) => void;
  C: Theme;
}

interface TagState {
  setup: string;
  ruleAdherence: boolean | null;
  mistake: string;
  emotions: string[];
  notes: string;
}

const EMPTY_TAG: TagState = {
  setup: "",
  ruleAdherence: null,
  mistake: "",
  emotions: [],
  notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(v: string | number | null | undefined): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getSetupList(trade: Trade, strategies: Record<string, StrategyDef>): string[] {
  const strat = strategies[trade.strategy];
  if (strat?.setups?.length) return strat.setups;
  // Common cross-strategy setups as fallback
  return ["Breakout","Pullback","Reversal","Range","Momentum","News","Other"];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TradeTagger({ trades, strategies, onSave, onDone, C }: TradeTaggerProps) {
  const [idx, setIdx] = useState(0);
  const [tags, setTags] = useState<TagState>(EMPTY_TAG);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  // Cache typed-but-not-saved tags per trade id so Back/forward navigation
  // restores in-flight input instead of silently wiping it.
  const draftCache = useRef<Map<number, TagState>>(new Map());
  // Swipe gesture tracking
  const touchX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const trade = trades[idx];
  const total = trades.length;
  const progress = idx / total;

  const isDirty = (t: TagState) =>
    !!(t.setup || t.mistake || t.ruleAdherence !== null || t.emotions.length || t.notes.trim());

  const pnlNum = parseFloat(trade?.pnl ?? "");
  const pnlOk = Number.isFinite(pnlNum);
  const isWin = pnlOk && pnlNum > 0;
  const isLoss = pnlOk && pnlNum < 0;
  const pnlColor = isWin ? C.green : isLoss ? C.red : C.text2;

  const setupList = trade ? getSetupList(trade, strategies) : [];

  function toggleEmotion(id: string) {
    setTags(t => ({
      ...t,
      emotions: t.emotions.includes(id)
        ? t.emotions.filter(e => e !== id)
        : [...t.emotions, id],
    }));
  }

  const advance = useCallback((newIdx: number, cacheCurrent: boolean = true) => {
    if (cacheCurrent && trade && isDirty(tags)) {
      draftCache.current.set(trade.id, tags);
    }
    if (newIdx >= total) {
      onDone(savedCount);
    } else {
      setIdx(newIdx);
      const next = trades[newIdx];
      const restored = next ? draftCache.current.get(next.id) : undefined;
      setTags(restored ?? EMPTY_TAG);
    }
  }, [total, savedCount, onDone, trade, tags, trades]);

  async function handleSave() {
    if (!trade || saving) return;
    setSaving(true);
    try {
      const updates: Partial<Trade> = {};
      if (tags.setup) updates.setup = tags.setup;
      if (tags.ruleAdherence !== null) updates.ruleAdherence = tags.ruleAdherence;
      if (tags.mistake) updates.mistake = tags.mistake;
      if (tags.emotions.length) updates.emotions = tags.emotions.join(",");
      if (tags.notes.trim()) updates.notes = tags.notes.trim();
      await onSave(trade.id, updates);
      setSavedCount(n => n + 1);
      // Saved successfully — clear any stale draft for this trade.
      draftCache.current.delete(trade.id);
      advance(idx + 1, /* cacheCurrent */ false);
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    advance(idx + 1);
  }

  function handleBack() {
    if (idx > 0) advance(idx - 1);
  }

  function handleExit() {
    if (isDirty(tags) && !confirm("You have unsaved tags on this trade. Exit anyway?")) return;
    onDone(savedCount);
  }

  // Keyboard shortcuts — power users tag much faster with the keyboard.
  // Suppress when focus is inside an input/textarea so typing notes works.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); handleSave(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); handleBack(); }
      else if (e.key.toLowerCase() === "s") { e.preventDefault(); handleSkip(); }
      else if (e.key === "Escape") { e.preventDefault(); handleExit(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, tags, saving]);

  // Touch swipe: right = save, left = skip
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > 80) handleSave();
    else if (dx < -80) handleSkip();
  }

  if (!trade) return null;

  const PILL = (
    label: string,
    active: boolean,
    onClick: () => void,
    color?: string,
  ) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: "7px 13px",
        border: `1px solid ${active ? (color ?? C.text) : C.border2}`,
        borderRadius: "999px",
        background: active ? (color ?? C.text) : "transparent",
        color: active ? (color ? "#fff" : C.bg) : C.muted,
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: "10px",
        letterSpacing: "0.06em",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: C.bg, zIndex: 1000,
      display: "flex", flexDirection: "column", overflowY: "auto",
    }}>
      {/* Progress bar */}
      <div style={{ height: "3px", background: C.border, flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${progress * 100}%`,
          background: C.green,
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px", flexShrink: 0,
      }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Quick tag &nbsp;
          <span style={{ color: C.text }}>{idx + 1}</span>
          <span style={{ color: C.muted }}>/{total}</span>
        </div>
        <button onClick={handleExit} style={{
          background: "none", border: "none", color: C.muted, cursor: "pointer",
          fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          Done ({savedCount} saved)
        </button>
      </div>

      {/* Trade card */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          margin: "0 16px 16px",
          border: `1px solid ${C.border2}`,
          borderRadius: "16px",
          background: C.panel,
          padding: "20px",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Pair + session + date */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: "20px", fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>
              {trade.pair || "--"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px", letterSpacing: "0.06em" }}>
              {trade.date}{trade.session ? ` · ${trade.session}` : ""}
            </div>
          </div>
          {trade.bias && (
            <div style={{
              padding: "4px 10px", borderRadius: "999px",
              border: `1px solid ${trade.bias === "Bullish" ? C.green : C.red}`,
              color: trade.bias === "Bullish" ? C.green : C.red,
              fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em",
            }}>
              {trade.bias === "Bullish" ? "LONG" : trade.bias === "Bearish" ? "SHORT" : trade.bias}
            </div>
          )}
        </div>

        {/* P&L */}
        <div style={{
          fontFamily: MONO, fontSize: "32px", fontWeight: 700,
          color: pnlColor, letterSpacing: "-0.02em", marginBottom: "12px",
        }}>
          {fmt$(trade.pnl)}
        </div>

        {/* Entry / Exit / R:R row */}
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {trade.entryPrice && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px" }}>Entry</div>
              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text2 }}>{trade.entryPrice}</div>
            </div>
          )}
          {trade.slPrice && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px" }}>SL</div>
              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.red }}>{trade.slPrice}</div>
            </div>
          )}
          {trade.tpPrice && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px" }}>TP</div>
              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.green }}>{trade.tpPrice}</div>
            </div>
          )}
          {trade.rr && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px" }}>R:R</div>
              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text2 }}>{trade.rr}R</div>
            </div>
          )}
        </div>

        {/* Swipe hint (mobile only) */}
        <div style={{ fontFamily: BODY, fontSize: "10px", color: C.border2, marginTop: "12px", textAlign: "center" }}>
          swipe right to save · swipe left to skip
        </div>
      </div>

      {/* Tag sections */}
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: "20px", flex: 1 }}>

        {/* Setup */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
            Setup
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {setupList.map(s => PILL(s, tags.setup === s, () => setTags(t => ({ ...t, setup: t.setup === s ? "" : s }))))}
          </div>
        </div>

        {/* Discipline */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
            Discipline
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {PILL(
              "Followed rules",
              tags.ruleAdherence === true,
              () => setTags(t => ({ ...t, ruleAdherence: t.ruleAdherence === true ? null : true })),
              "#00C96B",
            )}
            {PILL(
              "Broke a rule",
              tags.ruleAdherence === false,
              () => setTags(t => ({ ...t, ruleAdherence: t.ruleAdherence === false ? null : false })),
              "#FF3D00",
            )}
          </div>
        </div>

        {/* Mistake */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
            Mistake
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {MISTAKE_TAGS.map(m => PILL(
              m,
              tags.mistake === m,
              () => setTags(t => ({ ...t, mistake: t.mistake === m ? "" : m })),
              m === "None" ? undefined : "#FF3D00",
            ))}
          </div>
        </div>

        {/* Emotions */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
            State of mind
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {EMOTION_TAGS.map(e => PILL(
              e.label,
              tags.emotions.includes(e.id),
              () => toggleEmotion(e.id),
              e.color,
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
            Notes
          </div>
          <textarea
            value={tags.notes}
            onChange={e => setTags(t => ({ ...t, notes: e.target.value }))}
            placeholder="What happened on this trade?"
            rows={3}
            style={{
              width: "100%",
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: "10px",
              color: C.text,
              fontFamily: BODY,
              fontSize: "13px",
              padding: "10px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Navigation buttons */}
      <div style={{
        padding: "16px 20px 24px",
        display: "flex",
        gap: "10px",
        alignItems: "center",
        flexShrink: 0,
        borderTop: `1px solid ${C.border}`,
        marginTop: "16px",
        background: C.bg,
        position: "sticky",
        bottom: 0,
      }}>
        {idx > 0 && (
          <button onClick={handleBack} style={{
            background: "transparent",
            border: `1px solid ${C.border2}`,
            borderRadius: "999px",
            padding: "11px 16px",
            cursor: "pointer",
            fontFamily: MONO,
            fontSize: "11px",
            color: C.muted,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            ← Back
          </button>
        )}
        <button onClick={handleSkip} style={{
          background: "transparent",
          border: `1px solid ${C.border2}`,
          borderRadius: "999px",
          padding: "11px 20px",
          cursor: "pointer",
          fontFamily: MONO,
          fontSize: "11px",
          color: C.muted,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          flex: idx === 0 ? 1 : "unset",
        }}>
          Skip
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            background: saving ? C.border2 : C.text,
            color: saving ? C.muted : C.bg,
            border: "none",
            borderRadius: "999px",
            padding: "12px 24px",
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {saving ? "Saving..." : idx === total - 1 ? "Save & Finish" : "Save & Next →"}
        </button>
      </div>
    </div>
  );
}
