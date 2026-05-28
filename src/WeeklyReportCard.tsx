// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · WeeklyReportCard
//
// In-app weekly performance recap. Shown as Stats → Weekly sub-section.
// Pure presentational — stats are computed via lib/stats.ts.
// Share = clipboard copy (v1). PNG export is a follow-up.
// ═══════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import type { Trade } from "./types";
import type { Theme } from "./theme";
import { Card, Kicker, MONO, BODY, DISPLAY } from "./shared";
import { computeWeeklyRecap, isoWeekStart, type WeeklyRecap } from "./lib/stats";

interface Props {
  trades: Trade[];
  C: Theme;
  userHandle?: string;
}

function fmtDateShort(s: string): string {
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDollar(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtR(n: number, decimals = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}R`;
}

function shareText(recap: WeeklyRecap, handle?: string): string {
  const lines: string[] = [];
  lines.push(`Kōda · Weekly Recap (${recap.weekStart} – ${recap.weekEnd})`);
  if (handle) lines.push(`${handle}`);
  lines.push("");
  lines.push(`Net: ${fmtR(recap.netR)} · ${fmtDollar(recap.netDollar)}`);
  if (recap.winRate !== null) {
    lines.push(`Win rate: ${recap.winRate}% (${recap.wins}W / ${recap.losses}L) · ${recap.count} trades`);
  } else {
    lines.push(`Trades: ${recap.count}`);
  }
  if (recap.bestSetup) lines.push(`Best setup: ${recap.bestSetup.name} (${fmtR(recap.bestSetup.netR)})`);
  if (recap.bestDay) lines.push(`Best day: ${recap.bestDay.label} ${fmtDateShort(recap.bestDay.date)} (${fmtDollar(recap.bestDay.netDollar)})`);
  if (recap.ruleAdherencePct !== null) {
    lines.push(`Rules followed: ${recap.ruleAdherencePct}% (${recap.taggedCount} tagged)`);
  }
  lines.push("");
  lines.push("tradrjournal.xyz");
  return lines.join("\n");
}

export default function WeeklyReportCard({ trades, C, userHandle }: Props) {
  // weekAnchor = any date inside the displayed week. Defaults to today (this week).
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [copied, setCopied] = useState(false);

  const recap = useMemo(() => computeWeeklyRecap(trades, weekAnchor), [trades, weekAnchor]);
  const prevRecap = useMemo(() => {
    const prev = new Date(weekAnchor);
    prev.setDate(prev.getDate() - 7);
    return computeWeeklyRecap(trades, prev);
  }, [trades, weekAnchor]);

  const thisWeekStart = isoWeekStart(new Date()).toISOString().split("T")[0];
  const isCurrentWeek = recap.weekStart === thisWeekStart;
  const isFuture = recap.weekStart > thisWeekStart;

  function shiftWeek(days: number) {
    setWeekAnchor(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  }

  async function handleShare() {
    const text = shareText(recap, userHandle);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Kōda Weekly Recap", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled or share failed — no-op
    }
  }

  // Delta vs previous week
  const netRDelta = recap.netR - prevRecap.netR;
  const winRateDelta =
    recap.winRate !== null && prevRecap.winRate !== null ? recap.winRate - prevRecap.winRate : null;

  const cardBg = C.panel;
  const subtle = `color-mix(in oklch, ${C.text} 4%, transparent)`;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (recap.count === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <WeekHeader
          recap={recap}
          isCurrentWeek={isCurrentWeek}
          isFuture={isFuture}
          onPrev={() => shiftWeek(-7)}
          onNext={() => shiftWeek(7)}
          onThisWeek={() => setWeekAnchor(new Date())}
          C={C}
        />
        <Card C={C} pad={32}>
          <div style={{ textAlign: "center", color: C.muted, fontFamily: BODY, fontSize: 14, lineHeight: 1.5 }}>
            No trades this week.
            {!isCurrentWeek && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setWeekAnchor(new Date())}
                  style={pillBtn(C)}>
                  Jump to this week
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <WeekHeader
        recap={recap}
        isCurrentWeek={isCurrentWeek}
        isFuture={isFuture}
        onPrev={() => shiftWeek(-7)}
        onNext={() => shiftWeek(7)}
        onThisWeek={() => setWeekAnchor(new Date())}
        C={C}
      />

      {/* ── Hero stats ── */}
      <Card C={C} pad={20}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
          <Stat
            label="Net R"
            value={fmtR(recap.netR)}
            valueColor={recap.netR >= 0 ? C.green : C.red}
            delta={prevRecap.count > 0 ? fmtR(netRDelta) : undefined}
            deltaPos={netRDelta >= 0}
            C={C}
          />
          <Stat
            label="Net P&L"
            value={fmtDollar(recap.netDollar)}
            valueColor={recap.netDollar >= 0 ? C.green : C.red}
            C={C}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Stat
            label="Win rate"
            value={recap.winRate !== null ? `${recap.winRate}%` : "—"}
            valueColor={recap.winRate !== null && recap.winRate >= 50 ? C.green : C.text}
            delta={winRateDelta !== null && prevRecap.count > 0 ? `${winRateDelta >= 0 ? "+" : ""}${winRateDelta.toFixed(0)}%` : undefined}
            deltaPos={(winRateDelta ?? 0) >= 0}
            sub={recap.wins + recap.losses > 0 ? `${recap.wins}W / ${recap.losses}L` : undefined}
            C={C}
          />
          <Stat
            label="Trades"
            value={String(recap.count)}
            valueColor={C.text}
            C={C}
          />
        </div>
      </Card>

      {/* ── Setups ── */}
      {(recap.bestSetup || recap.worstSetup) && (
        <Card C={C} pad={18}>
          <Kicker C={C}>Setups</Kicker>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {recap.bestSetup && (
              <SetupRow label="Best" name={recap.bestSetup.name} netR={recap.bestSetup.netR} pos C={C} />
            )}
            {recap.worstSetup && recap.worstSetup.name !== recap.bestSetup?.name && (
              <SetupRow label="Worst" name={recap.worstSetup.name} netR={recap.worstSetup.netR} pos={false} C={C} />
            )}
          </div>
        </Card>
      )}

      {/* ── Days ── */}
      {(recap.bestDay || recap.worstDay) && (
        <Card C={C} pad={18}>
          <Kicker C={C}>Days</Kicker>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {recap.bestDay && (
              <DayRow
                label="Best"
                dayLabel={recap.bestDay.label}
                date={recap.bestDay.date}
                netDollar={recap.bestDay.netDollar}
                pos
                C={C}
              />
            )}
            {recap.worstDay && recap.worstDay.date !== recap.bestDay?.date && (
              <DayRow
                label="Worst"
                dayLabel={recap.worstDay.label}
                date={recap.worstDay.date}
                netDollar={recap.worstDay.netDollar}
                pos={false}
                C={C}
              />
            )}
          </div>
        </Card>
      )}

      {/* ── Discipline ── */}
      {recap.ruleAdherencePct !== null && (
        <Card C={C} pad={18}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <Kicker C={C}>Discipline</Kicker>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.06em" }}>
              {recap.taggedCount} tagged
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: DISPLAY,
                fontSize: 28,
                fontWeight: 600,
                color: recap.ruleAdherencePct >= 70 ? C.green : recap.ruleAdherencePct >= 50 ? (C.accent ?? C.text) : C.red,
                letterSpacing: "-0.02em",
              }}>
              {recap.ruleAdherencePct}%
            </span>
            <span style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>rules followed</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: C.border2, marginTop: 10, overflow: "hidden" }}>
            <div
              style={{
                width: `${recap.ruleAdherencePct}%`,
                height: "100%",
                background: recap.ruleAdherencePct >= 70 ? C.green : recap.ruleAdherencePct >= 50 ? (C.accent ?? C.text) : C.red,
                borderRadius: 2,
                transition: "width 0.4s ease",
              }} />
          </div>
        </Card>
      )}

      {/* ── Share ── */}
      <button
        onClick={handleShare}
        style={{
          marginTop: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "14px 22px",
          borderRadius: 999,
          background: copied ? (C.green ?? "#22c55e") : C.text,
          color: copied ? "#0A0A0A" : C.bg,
          border: "none",
          cursor: "pointer",
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}>
        {copied ? "Copied ✓" : "Share recap"}
      </button>

      <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, textAlign: "center", letterSpacing: "0.1em", marginTop: -6 }}>
        {copied ? "Summary copied to clipboard" : "Copies a text summary"}
      </div>

      {/* unused but kept for parity */}
      <div style={{ display: "none" }}>{subtle}{cardBg}</div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WeekHeader({
  recap, isCurrentWeek, isFuture, onPrev, onNext, onThisWeek, C,
}: {
  recap: WeeklyRecap;
  isCurrentWeek: boolean;
  isFuture: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;
  C: Theme;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <Kicker C={C}>Weekly Recap</Kicker>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 500, color: C.text, letterSpacing: "-0.01em", marginTop: 4 }}>
          {fmtDateShort(recap.weekStart)} – {fmtDateShort(recap.weekEnd)}
          {isCurrentWeek && (
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.muted, marginLeft: 8, textTransform: "uppercase" }}>
              This week
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onPrev} style={arrowBtn(C)} aria-label="Previous week">‹</button>
        {!isCurrentWeek && (
          <button onClick={onThisWeek} style={{ ...arrowBtn(C), width: "auto", padding: "0 12px", fontSize: 10, fontFamily: MONO, letterSpacing: "0.08em" }}>
            Today
          </button>
        )}
        <button onClick={onNext} disabled={isFuture} style={{ ...arrowBtn(C), opacity: isFuture ? 0.35 : 1, cursor: isFuture ? "not-allowed" : "pointer" }} aria-label="Next week">›</button>
      </div>
    </div>
  );
}

function Stat({
  label, value, valueColor, delta, deltaPos, sub, C,
}: {
  label: string; value: string; valueColor: string;
  delta?: string; deltaPos?: boolean; sub?: string; C: Theme;
}) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, color: valueColor, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        {delta !== undefined && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: deltaPos ? C.green : C.red }}>
            {deltaPos ? "↑" : "↓"} {delta}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 3, letterSpacing: "0.04em" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SetupRow({ label, name, netR, pos, C }: { label: string; name: string; netR: number; pos: boolean; C: Theme }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: pos ? C.green : C.red, letterSpacing: "0.1em", textTransform: "uppercase", minWidth: 38 }}>
          {label}
        </span>
        <span style={{ fontFamily: BODY, fontSize: 14, color: C.text }}>{name}</span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, color: pos ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
        {fmtR(netR)}
      </span>
    </div>
  );
}

function DayRow({ label, dayLabel, date, netDollar, pos, C }: {
  label: string; dayLabel: string; date: string; netDollar: number; pos: boolean; C: Theme;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: pos ? C.green : C.red, letterSpacing: "0.1em", textTransform: "uppercase", minWidth: 38 }}>
          {label}
        </span>
        <span style={{ fontFamily: BODY, fontSize: 14, color: C.text }}>
          {dayLabel} <span style={{ color: C.muted, fontSize: 12 }}>{fmtDateShort(date)}</span>
        </span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, color: pos ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
        {fmtDollar(netDollar)}
      </span>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function arrowBtn(C: Theme): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 999,
    border: `1px solid ${C.border2}`,
    background: "transparent",
    color: C.text,
    cursor: "pointer",
    fontSize: 18,
    fontFamily: BODY,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };
}

function pillBtn(C: Theme): React.CSSProperties {
  return {
    background: C.text,
    color: C.bg,
    border: "none",
    borderRadius: 999,
    padding: "10px 22px",
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
  };
}
