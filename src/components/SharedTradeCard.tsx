// src/components/SharedTradeCard.tsx
import type { SharedTrade } from "../types";
import { MONO } from "../shared";
import type { Theme } from "../theme";

const REACTIONS = ["🔥","💎","🎯","👍","💀","🤯"];

interface Props {
  trade: SharedTrade;
  myCode: string;
  C: Theme;
  onReact: (tradeId: string, emoji: string) => void;
}

export function SharedTradeCard({ trade, myCode, C, onReact }: Props) {
  const isWin = trade.outcome === "win";
  const isLoss = trade.outcome === "loss";
  const borderLeft = isWin ? "2px solid #4ade80" : isLoss ? "2px solid #f87171" : `1px solid ${C.border}`;

  function fmtPnl(v: number) {
    return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`;
  }
  function fmtR(v: number | null) {
    if (v === null) return null;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  }
  function fmtTime(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft, borderRadius: 12, overflow: "hidden" }}>
      {/* Header: avatar initial, handle, time */}
      <div style={{ padding: "11px 13px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.dim, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.text2, flexShrink: 0 }}>
          {(trade.authorHandle || trade.authorName || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>@{trade.authorHandle || trade.authorName}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.03em" }}>{fmtTime(trade.sharedAt)}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "0 13px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* Pair + side + date */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{trade.pair}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.text2, letterSpacing: "0.06em" }}>
            {trade.side.toUpperCase()} · {trade.date}
          </div>
        </div>

        {/* Metrics row: P&L, R, Strategy */}
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>P&amp;L</div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: trade.pnl >= 0 ? "#4ade80" : "#f87171" }}>{fmtPnl(trade.pnl)}</div>
          </div>
          {trade.rr !== null && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>R</div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: (trade.rr ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>{fmtR(trade.rr)}</div>
            </div>
          )}
          {trade.strategy && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Strategy</div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text2 }}>{trade.strategy}</div>
            </div>
          )}
        </div>

        {/* Notes (full text, no truncation) */}
        {trade.notes && (
          <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.55 }}>{trade.notes}</div>
        )}

        {/* Screenshot */}
        {trade.screenshot && (
          <img src={trade.screenshot} alt="trade screenshot" style={{ width: "100%", borderRadius: 7, maxHeight: 200, objectFit: "cover" }} />
        )}
      </div>

      {/* Reaction bar */}
      <div style={{ padding: "6px 13px 10px", display: "flex", gap: 10, borderTop: `1px solid ${C.border}` }}>
        {REACTIONS.map(emoji => {
          const reactors = trade.reactions[emoji] ?? [];
          const hasReacted = reactors.includes(myCode);
          return (
            <button
              key={emoji}
              onClick={() => onReact(trade.id, emoji)}
              style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13, cursor: "pointer", background: "none", border: "none", padding: 0, opacity: hasReacted ? 1 : 0.5 }}
            >
              {emoji}
              {reactors.length > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text2 }}>{reactors.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
