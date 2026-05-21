// ═══════════════════════════════════════════════════════════════════════════════
// EvalAccountScreen.tsx — Prop firm / evaluation account tracking screen
// Shown when profile.propFirmMode is true, accessible via Home → Eval sub-nav.
// ═══════════════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import type { Trade, Profile } from "./types";
import { MONO, BODY, DISPLAY } from "./shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile: Profile;
  trades: Trade[];
  C: {
    bg: string; panel: string; panel2: string;
    border: string; border2: string;
    text: string; text2: string; muted: string; dim: string;
    green: string; red: string;
    accent: string; accentSoft: string;
    live: string; liveSoft: string;
  };
  onEditTargets: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(value: number, max: number): number {
  if (!max) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

function fmt$(n: number): string {
  return n >= 0 ? `+$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : `-$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtAbs$(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ pct: p, color, warn, C }: { pct: number; color: string; warn?: boolean; C: Props["C"] }) {
  return (
    <div style={{ height: "6px", borderRadius: "3px", background: C.border2, overflow: "hidden" }}>
      <div style={{
        width: `${p}%`, height: "100%", borderRadius: "3px",
        background: warn && p > 75 ? C.red : color,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

function MetricRow({
  label, value, sub, pct: p, color, warn, C,
}: { label: string; value: string; sub: string; pct: number; color: string; warn?: boolean; C: Props["C"] }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, color: warn && p > 75 ? C.red : C.text }}>{value}</span>
          <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginLeft: "6px" }}>{sub}</span>
        </div>
      </div>
      <ProgressBar pct={p} color={color} warn={warn} C={C} />
    </div>
  );
}

function StatCard({ label, value, sub, C }: { label: string; value: string; sub?: string; C: Props["C"] }) {
  return (
    <div style={{ background: C.panel2, borderRadius: "14px", padding: "14px 16px", flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 700, color: C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

// ── Evaluation status ─────────────────────────────────────────────────────────

type EvalStatus = "passing" | "at_risk" | "failed";

function evalStatus(targetPct: number, ddPct: number, dailyPct: number): EvalStatus {
  if (ddPct >= 100 || dailyPct >= 100) return "failed";
  if (ddPct > 75 || dailyPct > 75) return "at_risk";
  return "passing";
}

const STATUS_CONFIG: Record<EvalStatus, { label: string; color: string; bg: string }> = {
  passing:  { label: "PASSING",  color: "oklch(0.78 0.18 152)", bg: "oklch(0.78 0.18 152 / 0.12)" },
  at_risk:  { label: "AT RISK",  color: "#f59e0b",               bg: "rgba(245,158,11,0.12)" },
  failed:   { label: "FAILED",   color: "oklch(0.70 0.21 25)",   bg: "oklch(0.70 0.21 25 / 0.12)" },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function EvalAccountScreen({ profile, trades, C, onEditTargets }: Props) {
  const bal       = profile.propFirmBalance ?? 0;
  const target    = profile.propFirmProfitTarget ?? 0;
  const dailyLim  = profile.propFirmDailyLossLimit ?? 0;
  const maxDD     = profile.propFirmMaxDrawdown ?? 0;

  const today = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const totalPnl = trades.reduce((a, t) => a + (parseFloat(t.pnlDollar as string) || 0), 0);
    const todayPnl = trades.filter(t => t.date === today).reduce((a, t) => a + (parseFloat(t.pnlDollar as string) || 0), 0);
    const wins     = trades.filter(t => t.outcome === "Win").length;
    const losses   = trades.filter(t => t.outcome === "Loss").length;
    const winRate  = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
    const avgR     = trades.length > 0 ? trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0) / trades.length : 0;

    // Best / worst day
    const byDay = trades.reduce<Record<string, number>>((acc, t) => {
      acc[t.date] = (acc[t.date] ?? 0) + (parseFloat(t.pnlDollar as string) || 0);
      return acc;
    }, {});
    const days = Object.values(byDay);
    const bestDay  = days.length ? Math.max(...days) : 0;
    const worstDay = days.length ? Math.min(...days) : 0;

    return { totalPnl, todayPnl, wins, losses, winRate, avgR, bestDay, worstDay };
  }, [trades, today]);

  const profit   = Math.max(0, stats.totalPnl);
  const loss     = Math.abs(Math.min(0, stats.totalPnl));
  const todayLoss = Math.abs(Math.min(0, stats.todayPnl));

  const targetPct = pct(profit, target);
  const ddPct     = pct(loss, maxDD);
  const dailyPct  = pct(todayLoss, dailyLim);

  const status = evalStatus(targetPct, ddPct, dailyPct);
  const sc = STATUS_CONFIG[status];

  // Recent trades (last 15, newest first)
  const recent = [...trades].sort((a, b) => b.id - a.id).slice(0, 15);

  if (!bal && !target && !dailyLim && !maxDD) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: "12px", color: C.muted, marginBottom: "16px" }}>
          No eval targets configured yet.
        </div>
        <button
          onClick={onEditTargets}
          style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          Set up eval account
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "0 0 80px" }}>

      {/* ── Header card ── */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "4px" }}>Eval Account</div>
            {bal > 0 && (
              <div style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 700, color: C.text, lineHeight: 1 }}>
                ${bal.toLocaleString()}
              </div>
            )}
          </div>
          {/* Status badge */}
          <div style={{ background: sc.bg, borderRadius: "999px", padding: "5px 12px" }}>
            <span style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.16em", color: sc.color }}>{sc.label}</span>
          </div>
        </div>

        {/* Progress bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {target > 0 && (
            <MetricRow
              label="Profit target"
              value={fmt$(stats.totalPnl)}
              sub={`/ ${fmtAbs$(target)} (${targetPct}%)`}
              pct={targetPct}
              color={C.green}
              C={C}
            />
          )}
          {dailyLim > 0 && (
            <MetricRow
              label="Daily loss today"
              value={stats.todayPnl >= 0 ? fmt$(stats.todayPnl) : `-${fmtAbs$(todayLoss)}`}
              sub={`/ ${fmtAbs$(dailyLim)} limit (${dailyPct}%)`}
              pct={dailyPct}
              color="#f59e0b"
              warn
              C={C}
            />
          )}
          {maxDD > 0 && (
            <MetricRow
              label="Max drawdown"
              value={stats.totalPnl >= 0 ? fmt$(stats.totalPnl) : `-${fmtAbs$(loss)}`}
              sub={`/ ${fmtAbs$(maxDD)} limit (${ddPct}%)`}
              pct={ddPct}
              color="#f59e0b"
              warn
              C={C}
            />
          )}
        </div>

        <button
          onClick={onEditTargets}
          style={{ marginTop: "16px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase" }}
        >
          Edit targets
        </button>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: "flex", gap: "8px" }}>
        <StatCard label="Trades" value={String(trades.length)} C={C} />
        <StatCard label="Win rate" value={`${stats.winRate}%`} sub={`${stats.wins}W · ${stats.losses}L`} C={C} />
        <StatCard label="Avg R" value={stats.avgR >= 0 ? `+${stats.avgR.toFixed(2)}R` : `${stats.avgR.toFixed(2)}R`} C={C} />
      </div>

      {/* ── Best / worst day ── */}
      {(stats.bestDay !== 0 || stats.worstDay !== 0) && (
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "5px" }}>Best day</div>
            <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 700, color: C.green }}>{fmt$(stats.bestDay)}</div>
          </div>
          <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "14px 16px" }}>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "5px" }}>Worst day</div>
            <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 700, color: C.red }}>{fmt$(stats.worstDay)}</div>
          </div>
        </div>
      )}

      {/* ── Rules checklist ── */}
      {(ddPct > 75 || dailyPct > 75) && (
        <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}40`, borderRadius: "16px", padding: "14px 16px" }}>
          <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 600, color: C.red, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
            {dailyPct >= 100 ? "Daily loss limit hit — stop trading today" : ddPct >= 100 ? "Max drawdown hit — eval failed" : "Approaching a limit"}
          </div>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.text2 ?? C.muted }}>
            {dailyPct >= 100
              ? "You've reached your daily loss limit. Close any open positions and resume tomorrow."
              : ddPct >= 100
                ? "Total drawdown has exceeded the maximum. This evaluation is over."
                : "One or more limits are above 75%. Trade carefully and consider reducing size."}
          </div>
        </div>
      )}

      {/* ── Recent trades ── */}
      {recent.length > 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "22px", overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 10px", fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>
            Recent trades
          </div>
          {recent.map((t, i) => {
            const pnlNum = parseFloat(t.pnlDollar as string) || 0;
            const rNum   = parseFloat(t.pnl) || 0;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.pair}</div>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "2px" }}>{t.date}{t.session ? ` · ${t.session}` : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, color: pnlNum >= 0 ? C.green : C.red }}>
                    {pnlNum >= 0 ? "+" : ""}{pnlNum !== 0 ? `$${Math.abs(pnlNum).toFixed(0)}` : "—"}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "2px" }}>
                    {rNum !== 0 ? `${rNum >= 0 ? "+" : ""}${rNum.toFixed(2)}R` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
