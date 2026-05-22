import { MONO, BODY } from "../shared";
import type { WeeklySummary } from "../lib/weeklyReport";

interface Props {
  summary: WeeklySummary;
  C: Record<string, string>;
}

export function WeeklyReport({ summary, C }: Props) {
  const pnlColor = summary.totalPnlDollar >= 0 ? C.green : C.red;

  async function handleShare() {
    const text = [
      `Kōda Weekly — ${summary.periodLabel}`,
      `${summary.count} trades · ${summary.winRate.toFixed(1)}% win rate`,
      `Net P&L: ${summary.totalPnlDollar >= 0 ? "+" : ""}$${summary.totalPnlDollar.toFixed(2)}`,
    ].join("\n");

    if (navigator.share) {
      await navigator.share({ title: "My Trading Week", text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  return (
    <div style={{
      border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "20px",
      background: C.panel, display: "flex", flexDirection: "column", gap: "16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {summary.periodLabel}
        </span>
        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.04em" }}>
          {summary.count} trade{summary.count !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: "24px", alignItems: "baseline" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: "clamp(24px, 6vw, 36px)", fontWeight: 700, color: pnlColor, letterSpacing: "-0.02em" }}>
            {summary.totalPnlDollar >= 0 ? "+" : ""}${Math.abs(summary.totalPnlDollar).toFixed(0)}
          </div>
          <div style={{ fontFamily: BODY, fontSize: "11px", color: C.muted, marginTop: "2px" }}>net P&L</div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: "clamp(24px, 6vw, 36px)", fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>
            {summary.winRate.toFixed(0)}%
          </div>
          <div style={{ fontFamily: BODY, fontSize: "11px", color: C.muted, marginTop: "2px" }}>win rate</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px" }}>
        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.green, letterSpacing: "0.04em" }}>{summary.wins}W</span>
        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.red, letterSpacing: "0.04em" }}>{summary.losses}L</span>
      </div>

      <button
        onClick={handleShare}
        style={{
          alignSelf: "flex-start", fontFamily: MONO, fontSize: "10px",
          letterSpacing: "0.1em", textTransform: "uppercase",
          background: "transparent", border: `1px solid ${C.border2}`,
          borderRadius: "999px", padding: "8px 16px", color: C.text2,
          cursor: "pointer",
        }}
      >
        Share week →
      </button>
    </div>
  );
}
