// ── ReviewInboxScreen ──────────────────────────────────────────────────────────
// Shows trades that auto-synced from a broker but haven't been reviewed yet
// (review_status = 'draft' in public.trades).
//
// Publish → sets review_status='published' + adds trade to KV journal
// Skip    → sets review_status='skipped'  (hidden from inbox, not journaled)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { log } from "./lib/log";
import type { Trade } from "./types";
import { MONO, BODY, DISPLAY, Kicker, EmptyInboxState } from "./shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DraftRow {
  id: string;          // uuid PK in public.trades
  pair: string;
  side: string | null; // 'long' | 'short'
  date: string;        // YYYY-MM-DD
  pnl: number;
  outcome: string;     // 'win' | 'loss' | 'be'
  entry_price: number | null;
  strategy: string | null;
  notes: string | null;
  broker: string;
  external_id: string;
  created_at: string;
}

export interface ReviewInboxScreenProps {
  userId: string;
  trades: Trade[];
  saveTrades: (t: Trade[]) => Promise<void>;
  onCountChange: (n: number) => void;
  C: Record<string, string>;
  navigateTo: (view: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function outcomeColor(outcome: string, C: Record<string, string>): string {
  if (outcome === "win")  return C.green  ?? "#22c55e";
  if (outcome === "loss") return C.red    ?? "#ef4444";
  return C.muted ?? "#888";
}

function draftToTrade(row: DraftRow, baseId: number): Trade {
  const pnl = parseFloat(String(row.pnl ?? 0));
  return {
    id:          baseId,
    date:        row.date ?? new Date().toISOString().split("T")[0],
    pair:        row.pair ?? "",
    session:     "",
    bias:        "",
    strategy:    row.strategy ?? "",
    setup:       "",
    entryPrice:  row.entry_price != null ? String(row.entry_price) : "",
    slPrice:     "",
    tpPrice:     "",
    rr:          "",
    outcome:     row.outcome ?? "be",
    pnl:         String(pnl),
    notes:       row.notes ?? `Auto-imported from ${row.broker ?? "broker"}`,
    emotions:    "",
    screenshot:  "",
    pnlDollar:   String(pnl),
    direction:   row.side === "long" ? "Long" : row.side === "short" ? "Short" : "",
    comments:    [],
    reactions:   {},
    source:      "api",
    createdAt:   new Date().toISOString(),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewInboxScreen({ userId, trades, saveTrades, onCountChange, C, navigateTo }: ReviewInboxScreenProps) {
  const [drafts, setDrafts]               = useState<DraftRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [acting, setActing]               = useState<Set<string>>(new Set());
  const [publishingAll, setPublishingAll] = useState(false);

  // Any in-flight publish/skip — used to mutex actions across rows.
  // Per-row `acting` checks alone don't prevent concurrent publishes from
  // overwriting each other in saveTrades (each call reads stale `trades` from
  // closure and setTrades(u) is not a functional setter).
  const globalBusy = acting.size > 0 || publishingAll;

  const orb1 = C.orb1 ?? "oklch(0.55 0.22 252)";
  const cardBg = `color-mix(in srgb, ${C.text} 3%, transparent)`;
  const mintColor = C.live ?? "oklch(0.84 0.14 175)";

  // ── Load drafts ────────────────────────────────────────────────────────────

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("trades")
        .select("id, pair, side, date, pnl, outcome, entry_price, strategy, notes, broker, external_id, created_at")
        .eq("user_id", userId)
        .eq("review_status", "draft")
        .order("date", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as DraftRow[];
      setDrafts(rows);
      onCountChange(rows.length);
    } catch (e) {
      log.error("ReviewInbox.load", e);
    } finally {
      setLoading(false);
    }
  }, [userId, onCountChange]);

  useEffect(() => { if (userId) loadDrafts(); }, [userId, loadDrafts]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function publishOne(row: DraftRow) {
    if (globalBusy) return;
    setActing(prev => new Set(prev).add(row.id));
    try {
      const { error } = await supabase
        .from("trades")
        .update({ review_status: "published" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (error) throw error;

      const maxId = trades.reduce((m, t) => Math.max(m, t.id), 0);
      const newTrade = draftToTrade(row, maxId + 1);
      await saveTrades([newTrade, ...trades]);

      setDrafts(prev => {
        const next = prev.filter(d => d.id !== row.id);
        onCountChange(next.length);
        return next;
      });
    } catch (e) {
      log.error("ReviewInbox.publish", e);
    } finally {
      setActing(prev => { const s = new Set(prev); s.delete(row.id); return s; });
    }
  }

  async function skipOne(row: DraftRow) {
    if (globalBusy) return;
    setActing(prev => new Set(prev).add(row.id));
    try {
      const { error } = await supabase
        .from("trades")
        .update({ review_status: "skipped" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (error) throw error;

      setDrafts(prev => {
        const next = prev.filter(d => d.id !== row.id);
        onCountChange(next.length);
        return next;
      });
    } catch (e) {
      log.error("ReviewInbox.skip", e);
    } finally {
      setActing(prev => { const s = new Set(prev); s.delete(row.id); return s; });
    }
  }

  async function publishAll() {
    if (globalBusy || drafts.length === 0) return;
    setPublishingAll(true);
    try {
      const ids = drafts.map(d => d.id);
      const { error } = await supabase
        .from("trades")
        .update({ review_status: "published" })
        .in("id", ids)
        .eq("user_id", userId);
      if (error) throw error;

      const maxId = trades.reduce((m, t) => Math.max(m, t.id), 0);
      const newTrades = drafts.map((row, i) => draftToTrade(row, maxId + 1 + i));
      await saveTrades([...newTrades, ...trades]);

      setDrafts([]);
      onCountChange(0);
    } catch (e) {
      log.error("ReviewInbox.publishAll", e);
    } finally {
      setPublishingAll(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: "relative", fontFamily: BODY, maxWidth: "480px", margin: "0 auto" }}>

      {/* Orb bloom */}
      <div style={{
        position: "absolute", top: 0, right: -60, width: 280, height: 280,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(circle, ${orb1} 0%, transparent 65%)`,
        filter: "blur(70px)",
        opacity: C.bg?.startsWith("#0") || C.bg?.startsWith("#1") ? 0.35 : 0.2,
      }} />

      <div style={{ position: "relative", zIndex: 1, padding: "20px 0 40px" }}>

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase" as const, color: C.muted, marginBottom: "6px" }}>
            Sync · Review Inbox
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: "24px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {loading
              ? "Loading…"
              : drafts.length === 0
              ? "All caught up"
              : `${drafts.length} trade${drafts.length !== 1 ? "s" : ""} to review`}
          </div>
          <div style={{ fontSize: "13px", color: C.muted, marginTop: "6px", lineHeight: 1.5, fontFamily: BODY }}>
            {drafts.length === 0 && !loading
              ? "Auto-synced trades will appear here for you to publish to your journal."
              : "Auto-synced from your broker. Publish trades you want in your journal, skip the rest."}
          </div>
        </div>

        {/* Publish All */}
        {drafts.length > 1 && (
          <div style={{ marginBottom: "20px" }}>
            <button
              onClick={publishAll}
              disabled={globalBusy}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                width: "100%", padding: "14px 22px", borderRadius: "999px",
                background: C.green ?? "oklch(0.78 0.18 152)", color: "#0A0A0A",
                border: "none", cursor: globalBusy ? "not-allowed" : "pointer",
                fontFamily: MONO, fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                opacity: globalBusy ? 0.55 : 1,
              }}>
              {publishingAll ? "Publishing…" : `Publish all ${drafts.length} trades`}
              {!publishingAll && (
                <span style={{ width: "26px", height: "26px", borderRadius: "999px", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7l3 3 5-6" stroke={C.green ?? "#22c55e"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ borderRadius: "22px", background: C.panel, border: `1px solid ${C.border}`, height: "96px", opacity: 0.35 + i * 0.1 }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && drafts.length === 0 && (
          <EmptyInboxState C={C as any} />
        )}

        {/* Pending review section header */}
        {!loading && drafts.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Kicker C={C as any}>Pending review</Kicker>
          </div>
        )}

        {/* Draft trade cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {!loading && drafts.map(row => {
            const pnl    = parseFloat(String(row.pnl ?? 0));
            const pnlPos = pnl >= 0;
            const busy   = acting.has(row.id);
            // Disable buttons globally while any action is in flight so racing
            // clicks across rows can't both compute the same maxId in saveTrades.
            const disabled = busy || globalBusy;
            const isWin  = row.outcome === "win";
            const isLoss = row.outcome === "loss";
            const outClr = outcomeColor(row.outcome, C);
            const side   = row.side ? row.side.toUpperCase() : null;

            return (
              <div key={row.id}
                style={{ borderRadius: "22px", padding: "16px", background: C.panel, border: `1px solid ${C.border}`, opacity: busy ? 0.5 : 1, display: "flex", flexDirection: "column", gap: "12px", transition: "opacity 0.15s" }}>

                {/* Trade row */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {/* Mint dot — draft indicator */}
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: mintColor, flexShrink: 0 }} />

                  {/* Symbol badge */}
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
                    background: isWin
                      ? `color-mix(in oklch, ${C.green} 14%, transparent)`
                      : isLoss
                      ? `color-mix(in oklch, ${C.red} 14%, transparent)`
                      : "rgba(128,128,128,0.08)",
                    color: outClr,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: MONO, fontWeight: 600, fontSize: "11px",
                    border: `1px solid ${C.border2}`,
                  }}>
                    {row.pair.slice(0, 3).toUpperCase()}
                  </div>

                  {/* Meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>{row.pair}</span>
                      {/* DRAFT pill */}
                      <div style={{
                        padding: "2px 8px", borderRadius: 999,
                        background: `color-mix(in oklch, ${mintColor} 12%, transparent)`,
                        border: `1px solid color-mix(in oklch, ${mintColor} 25%, transparent)`,
                        fontFamily: MONO, fontSize: 9, letterSpacing: "0.10em",
                        color: mintColor, textTransform: "uppercase" as const,
                        flexShrink: 0,
                      }}>DRAFT</div>
                      {side && (
                        <span style={{
                          padding: "1px 6px", borderRadius: "4px", fontSize: "9px",
                          letterSpacing: "0.10em", fontFamily: MONO, fontWeight: 700,
                          background: side === "LONG"
                            ? `color-mix(in oklch, ${C.green} 14%, transparent)`
                            : `color-mix(in oklch, ${C.red} 14%, transparent)`,
                          color: side === "LONG" ? C.green : C.red,
                        }}>{side}</span>
                      )}
                      <span style={{
                        fontFamily: MONO, fontSize: "8px", letterSpacing: "0.08em",
                        color: C.muted, background: cardBg,
                        padding: "1px 5px", borderRadius: "4px",
                      }}>
                        {row.broker ?? "broker"}
                      </span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>
                      {row.date}
                      {row.entry_price != null && <span style={{ marginLeft: "8px" }}>@ {row.entry_price}</span>}
                      {row.strategy && <span style={{ marginLeft: "8px" }}>· {row.strategy}</span>}
                    </div>
                  </div>

                  {/* P&L */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: "16px", fontWeight: 700, color: outClr, fontVariantNumeric: "tabular-nums" }}>
                      {pnlPos ? "+" : ""}{pnl.toFixed(2)}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                      {row.outcome}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {row.notes && (
                  <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.45, padding: "0 2px" }}>
                    {row.notes}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => publishOne(row)}
                    disabled={disabled}
                    style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const, cursor: disabled ? "not-allowed" : "pointer", padding: "8px 16px", fontWeight: 600, opacity: disabled ? 0.5 : 1 }}>
                    {busy ? "…" : "Publish"}
                  </button>
                  <button
                    onClick={() => skipOne(row)}
                    disabled={disabled}
                    style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border2}`, borderRadius: "999px", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const, cursor: disabled ? "not-allowed" : "pointer", padding: "8px 16px", fontWeight: 600, opacity: disabled ? 0.5 : 1 }}>
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
