// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · NewsScreen
//
// Full News page reached via the Home subnav. Today / Week / Month filter pills,
// impact filter chips, timezone picker, calendar list grouped by day, headlines.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import type { Theme } from "./theme";
import { MONO, BODY } from "./shared";
import { useNews } from "./hooks/useNews";
import type { CalendarEvent, Headline, Impact } from "./lib/news";

type Range = "today" | "week" | "month";

type TzId = "local" | "et" | "london" | "utc";

const TZ_OPTIONS: ReadonlyArray<{ id: TzId; label: string; iana: string | undefined }> = [
  { id: "local",  label: "LOCAL",  iana: undefined },
  { id: "et",     label: "ET",     iana: "America/New_York" },
  { id: "london", label: "LONDON", iana: "Europe/London" },
  { id: "utc",    label: "UTC",    iana: "UTC" },
];

const TZ_LS_KEY = "koda_news_tz";

interface Props {
  C: Theme;
}

function impactColor(C: Theme, impact: Impact): string {
  if (impact === "high")   return C.red;
  if (impact === "medium") return C.warn;
  return C.muted;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function rangeWindow(range: Range): [Date, Date] {
  const now = new Date();
  if (range === "today") return [startOfDay(now), endOfDay(now)];
  if (range === "week") {
    const end = new Date(now);
    end.setDate(now.getDate() + 7);
    return [startOfDay(now), endOfDay(end)];
  }
  const end = new Date(now);
  end.setDate(now.getDate() + 30);
  return [startOfDay(now), endOfDay(end)];
}

function relativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatTime(iso: string, tz: string | undefined): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

function formatDayLabel(iso: string, tz: string | undefined): string {
  return new Date(iso)
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    })
    .toUpperCase();
}

function dayBucket(iso: string, tz: string | undefined): string {
  // YYYY-MM-DD in the selected timezone, used as the group key.
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  });
}

function staleHours(fetchedAtIso: string): number {
  return (Date.now() - new Date(fetchedAtIso).getTime()) / 3600_000;
}

const ALL_IMPACTS: ReadonlyArray<Impact> = ["high", "medium", "low", "holiday"];

function loadTz(): TzId {
  if (typeof window === "undefined") return "local";
  const stored = window.localStorage?.getItem(TZ_LS_KEY);
  if (stored === "local" || stored === "et" || stored === "london" || stored === "utc") {
    return stored;
  }
  return "local";
}

export function NewsScreen({ C }: Props) {
  const { calendar, headlines } = useNews();
  const [range, setRange] = useState<Range>("today");
  const [impactFilter, setImpactFilter] = useState<Set<Impact>>(() => new Set(ALL_IMPACTS));
  const [tz, setTz] = useState<TzId>(loadTz);

  useEffect(() => {
    try { window.localStorage?.setItem(TZ_LS_KEY, tz); } catch { /* quota / private mode */ }
  }, [tz]);

  const tzIana = useMemo(() => TZ_OPTIONS.find(o => o.id === tz)?.iana, [tz]);

  function toggleImpact(impact: Impact) {
    setImpactFilter(prev => {
      const next = new Set(prev);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      if (next.size === 0) return prev;
      return next;
    });
  }

  const filteredEvents = useMemo<CalendarEvent[]>(() => {
    const events = calendar?.items ?? [];
    const [from, to] = rangeWindow(range);
    return events
      .filter(e => impactFilter.has(e.impact))
      .filter(e => {
        const t = new Date(e.time).getTime();
        return t >= from.getTime() && t <= to.getTime();
      })
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [calendar, range, impactFilter]);

  // Group events by day for Week/Month views. Today view stays flat (single day).
  const dayGroups = useMemo<Array<{ key: string; label: string; events: CalendarEvent[] }>>(() => {
    if (range === "today") {
      return filteredEvents.length === 0 ? [] : [{ key: "today", label: "", events: filteredEvents }];
    }
    const groups: Array<{ key: string; label: string; events: CalendarEvent[] }> = [];
    for (const ev of filteredEvents) {
      const key = dayBucket(ev.time, tzIana);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.events.push(ev);
      } else {
        groups.push({ key, label: formatDayLabel(ev.time, tzIana), events: [ev] });
      }
    }
    return groups;
  }, [filteredEvents, range, tzIana]);

  const articles = headlines?.items ?? [];

  return (
    <div
      style={{
        padding: 14,
        fontFamily: BODY,
        color: C.text,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Range pills */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["today", "week", "month"] as Range[]).map(r => {
          const active = range === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: active ? "none" : `1px solid ${C.border}`,
                background: active ? C.text : C.panel,
                color:      active ? C.bg   : C.muted,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              {r.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Impact filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ALL_IMPACTS.map(imp => {
          const active = impactFilter.has(imp);
          const color = impactColor(C, imp);
          return (
            <button
              key={imp}
              type="button"
              aria-pressed={active}
              onClick={() => toggleImpact(imp)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                border: `1px solid ${active ? color : C.border}`,
                background: C.panel,
                color: active ? C.text : C.muted,
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.08em",
                fontWeight: 600,
                cursor: "pointer",
                opacity: active ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: active ? color : C.muted,
                  display: "inline-block",
                }}
              />
              {imp.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Calendar section */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            gap: 8,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: C.muted }}>
            ECONOMIC CALENDAR
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {calendar && staleHours(calendar.fetchedAt) > 24 && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.warn }}>
                {Math.round(staleHours(calendar.fetchedAt))}h ago
              </span>
            )}
            <label style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                aria-label="Timezone"
                value={tz}
                onChange={e => setTz(e.target.value as TzId)}
                style={{
                  appearance: "none",
                  WebkitAppearance: "none",
                  padding: "5px 22px 5px 10px",
                  borderRadius: 999,
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  color: C.text,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {TZ_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 8,
                  pointerEvents: "none",
                  fontSize: 8,
                  color: C.muted,
                }}
              >
                ▾
              </span>
            </label>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: C.panel,
              color: C.muted,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {range === "today"
              ? "No US events today — quiet session ahead."
              : "No events in this range."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dayGroups.map(group => (
              <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {group.label && (
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      color: C.muted,
                      padding: "4px 0 2px",
                    }}
                  >
                    {group.label}
                  </div>
                )}
                {group.events.map(ev => {
                  const c = impactColor(C, ev.impact);
                  const past = new Date(ev.time).getTime() < Date.now();
                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: 9,
                        background: C.panel,
                        border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${c}`,
                        borderRadius: 6,
                        opacity: past ? 0.55 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span>{ev.title}</span>
                        <span style={{ fontFamily: MONO, color: C.muted }}>{formatTime(ev.time, tzIana)}</span>
                      </div>
                      {(ev.forecast || ev.previous || ev.actual) && (
                        <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
                          {ev.forecast && `Forecast: ${ev.forecast}`}
                          {ev.forecast && ev.previous && " · "}
                          {ev.previous && `Prev: ${ev.previous}`}
                          {ev.actual && ` · Actual: ${ev.actual}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Headlines section */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: C.muted }}>
            HEADLINES
          </span>
          {headlines && staleHours(headlines.fetchedAt) > 24 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.warn }}>
              Last updated {Math.round(staleHours(headlines.fetchedAt))}h ago
            </span>
          )}
        </div>

        {articles.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: C.panel,
              color: C.muted,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Headlines loading — check back in a few minutes.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {articles.map((a: Headline) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: 9,
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.text,
                  textDecoration: "none",
                }}
              >
                <div style={{ fontSize: 11, lineHeight: 1.3 }}>{a.title}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
                  {a.source} · {relativeAgo(a.publishedAt)}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
