import { useState, useEffect, useRef } from "react";
import type { StrategyDef } from "./types";
import type { Theme } from "./theme";

// ─── FONT STACKS (duplicated from Koda.tsx for standalone use) ──────────────
export const MONO = "'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace";
export const BODY = "'Geist', 'Inter', system-ui, sans-serif";
export const DISPLAY = "'Geist', 'Inter', system-ui, sans-serif";

// ─── STRATEGY CODE HELPERS ───────────────────────────────────────────────────
// Module-level mutable full strategies map (built-ins + custom).
// Koda.tsx calls setSharedStrategiesMap(getAllStrategiesMap()) whenever strategies
// change (on load and after saveCustomStrategies). This keeps stratCode in sync.
let _sharedStrategiesMap: Record<string, StrategyDef> = {};
export function setSharedStrategiesMap(map: Record<string, StrategyDef>) {
  _sharedStrategiesMap = map;
}

export function stratCode(name: string): string {
  const entry = _sharedStrategiesMap[name];
  if (entry?.code) return entry.code;
  return name.slice(0, 3).toUpperCase();
}

export function stratShort(name: string) { return name.split("(")[0].trim(); }

// ─── IMAGE COMPRESS ──────────────────────────────────────────────────────────
export function compressImage(file: File, maxSize = 600): Promise<string> {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = (e.target as any).result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── OUTCOME HELPERS ─────────────────────────────────────────────────────────
export function outcomeColor(outcome: string, C: any) {
  return outcome === "Win" ? C.green : outcome === "Loss" ? C.red : C.muted;
}
export function outcomeLetter(outcome: string) {
  return outcome === "Win" ? "W" : outcome === "Loss" ? "L" : outcome === "Breakeven" ? "BE" : "—";
}

// ─── TR MARK ─────────────────────────────────────────────────────────────────
export function KodaMark({ size = 28, color = "currentColor", strokeWidth = 1.6 }: {
  size?: number; color?: string; strokeWidth?: number;
}) {
  const w = size;
  const h = size * 0.80;
  return (
    <svg width={w} height={h} viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <path d="M8 8 L8 72 L40 40 Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="miter" fill="none" />
      <path d="M28 8 L28 72 L60 40 Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="miter" fill="none" />
      <path d="M48 8 L48 72 L80 40 Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="miter" fill="none" />
      <path d="M68 8 L68 72 L100 40 Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="miter" fill="none" />
    </svg>
  );
}

/** @deprecated Use KodaMark instead — kept for backward compat */
export function KodaMarkFilled({ size = 28, bg = "#0C0C0B" }: { size?: number; bg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <rect width="100" height="100" rx="18" fill={bg}/>
      <g fill="none" stroke="#EDEDE8" strokeWidth="2.2" strokeLinejoin="miter" strokeLinecap="square">
        <polygon points="10,23 37,50 10,77"/>
        <polygon points="28,23 55,50 28,77"/>
        <polygon points="46,23 73,50 46,77"/>
        <polygon points="64,23 91,50 64,77"/>
      </g>
    </svg>
  );
}

// ─── CROWN ICON ──────────────────────────────────────────────────────────────
// Minimal crown badge — shown next to handle for Pro/Elite users
export function CrownIcon({ size = 13, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <path d="M2 14h16M3 14L1 6l5 3.5L10 2l4 7.5L19 6l-2 8H3z"
        fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── TOAST SYSTEM ────────────────────────────────────────────────────────────
// Legacy single-message toast (kept for backward compat)
export function Toast({ message, onDone, C }: any) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: "calc(52px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "kSlideIn 0.38s cubic-bezier(.2,.8,.2,1)", background: C.panel, border: `0.5px solid ${C.border2}`, borderRadius: "999px", padding: "9px 18px", fontSize: "10px", color: C.text2, whiteSpace: "nowrap", letterSpacing: "0.10em", fontFamily: MONO, textTransform: "uppercase" }}>
      {message}
    </div>
  );
}

// ─── TOAST V2 (4 kinds, stacked, auto-dismiss) ─────────────────────────────
export type ToastKind = "success" | "info" | "warn" | "error";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  ts: number;
}

const TOAST_ACCENT: Record<ToastKind, string> = {
  success: "oklch(0.78 0.18 152)",
  info: "oklch(0.74 0.16 250)",
  warn: "oklch(0.80 0.16 85)",
  error: "oklch(0.70 0.21 25)",
};

const TOAST_ICONS: Record<ToastKind, string> = {
  success: "M5 12l4 4L19 7",
  info: "M12 8v4m0 4h.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z",
  warn: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  error: "M18 6L6 18M6 6l12 12",
};

function ToastCard({ item, onDismiss, C }: { item: ToastItem; onDismiss: (id: number) => void; C: Theme }) {
  const accentColor = TOAST_ACCENT[item.kind];
  const autoDismiss = item.kind === "success" || item.kind === "info";

  useEffect(() => {
    if (!autoDismiss) return;
    const t = setTimeout(() => onDismiss(item.id), 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeStr = new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 14px", borderRadius: 14,
      background: C.panel, border: `1px solid ${C.border}`,
      boxShadow: `0 8px 24px ${C.shadow}`,
      animation: "kSlideIn 0.38s cubic-bezier(.2,.8,.2,1)",
      position: "relative", overflow: "hidden", minWidth: 260, maxWidth: 360,
      cursor: autoDismiss ? "default" : "pointer",
    }} onClick={autoDismiss ? undefined : () => onDismiss(item.id)}>
      {/* Left accent bar */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: accentColor, borderRadius: "3px 0 0 3px",
      }} />
      {/* Icon chip */}
      <div style={{
        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
        background: `color-mix(in oklch, ${accentColor} 16%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d={TOAST_ICONS[item.kind]} stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: BODY, lineHeight: 1.3 }}>
          {item.title}
        </div>
        {item.body && (
          <div style={{ fontSize: 11, color: C.text2, fontFamily: BODY, marginTop: 2, lineHeight: 1.35 }}>
            {item.body}
          </div>
        )}
      </div>
      {/* Timestamp */}
      <span style={{ fontSize: 9, color: C.muted, fontFamily: MONO, letterSpacing: "0.08em", flexShrink: 0, marginTop: 2 }}>
        {timeStr}
      </span>
    </div>
  );
}

/** Stacked toast container — render at app root */
export function ToastStack({ toasts, onDismiss, C }: {
  toasts: ToastItem[]; onDismiss: (id: number) => void; C: Theme;
}) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", bottom: "calc(72px + env(safe-area-inset-bottom))",
      left: "50%", transform: "translateX(-50%)",
      zIndex: 1100, display: "flex", flexDirection: "column-reverse", gap: 8,
      pointerEvents: "auto",
    }}>
      {toasts.slice(-4).map(t => (
        <ToastCard key={t.id} item={t} onDismiss={onDismiss} C={C} />
      ))}
    </div>
  );
}

// ─── AVATAR CIRCLE ───────────────────────────────────────────────────────────
export function AvatarCircle({ name, avatar, size = 40, color, onClick, C }: any) {
  const initials = (name || "TR").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const col = color || (C?.text ?? "#EDEDE8");
  const border = C?.border2 ?? "#3A3A34";
  const bg = C?.panel ?? "#161614";
  const orb1 = C?.orb1 ?? "oklch(0.55 0.22 252)";
  const orb2 = C?.orb2 ?? "oklch(0.45 0.20 268)";
  const style: React.CSSProperties = { width: size, height: size, borderRadius: "50%", border: `1px solid ${border}`, flexShrink: 0, cursor: onClick ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", objectFit: "cover" };
  const safeAvatar = avatar && (avatar.startsWith("data:image/") || avatar.startsWith("https://")) ? avatar : null;
  // Emoji avatar: short string that isn't a URL or data URI
  const isEmoji = avatar && !safeAvatar && avatar.length <= 8;
  if (safeAvatar) return <img src={safeAvatar} alt="av" style={style} onClick={onClick} loading="lazy" />;
  return (
    <div style={{ ...style, background: isEmoji ? bg : `linear-gradient(135deg, ${orb1}, ${orb2})` }} onClick={onClick}>
      {isEmoji
        ? <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{avatar}</span>
        : <span style={{ fontSize: size * 0.34, color: col, letterSpacing: "0.04em", fontFamily: MONO, mixBlendMode: "overlay" as React.CSSProperties["mixBlendMode"] }}>{initials}</span>
      }
    </div>
  );
}

// ─── BADGE ───────────────────────────────────────────────────────────────────
// Collapsed to uppercase mono 11px, 0.06em tracking, optional single color.
export function Badge({ color, children, C }: any) {
  const col = color === "win" ? C.green : color === "loss" ? C.red : color === "be" ? C.muted : color === "accent" ? C.text : C.muted;
  return <span style={{ color: col, fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: MONO, whiteSpace: "nowrap" }}>{children}</span>;
}

// ─── SECTION KICKER ──────────────────────────────────────────────────────────
export function SectionKicker({ label, C }: any) {
  return (
    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 500 }}>
      {label}
    </div>
  );
}

// ─── STRATEGY PILL ───────────────────────────────────────────────────────────
// Mono lettered kicker, no emoji. Pill shape, borderRadius 999px.
export function StrategyPill({ name, selected, onClick, C }: any) {
  return (
    <button onClick={onClick} style={{
      background: selected ? C.text : "transparent",
      border: `1px solid ${selected ? C.text : C.border2}`,
      borderRadius: "999px",
      padding: "10px 16px",
      minHeight: "44px",
      cursor: "pointer",
      fontFamily: MONO,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "opacity 0.15s, transform 0.15s",
      whiteSpace: "nowrap",
      color: selected ? C.bg : C.text,
    }}>
      <span style={{ fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500 }}>{stratCode(name)}</span>
      <span style={{ fontSize: "11px", color: selected ? C.bg : C.muted, letterSpacing: "0.02em" }}>{stratShort(name)}</span>
    </button>
  );
}

// ─── STRATEGY SELECT ─────────────────────────────────────────────────────────
// Compact pill-shaped dropdown. Replaces pill rows where strategy is a *selector*
// (not a form input). Scales to any number of strategies including custom ones.
export function StrategySelect({ strategies, value, onChange, C, align = "left" }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => {
    function onDoc(e: any) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px",
        padding: "7px 14px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, display: "inline-flex",
        alignItems: "center", gap: "8px", whiteSpace: "nowrap", color: C.text,
      }}>
        <span style={{ fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500 }}>{stratCode(value)}</span>
        <span style={{ fontSize: "11px", color: C.muted, letterSpacing: "0.02em" }}>{stratShort(value)}</span>
        <span style={{ fontSize: "10px", color: C.muted, marginLeft: "2px" }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", [align]: 0, zIndex: 50,
          minWidth: "220px", background: C.panel, border: `1px solid ${C.border2}`,
          borderRadius: "12px", padding: "6px", boxShadow: `0 8px 24px ${C.shadow}`,
          maxHeight: "320px", overflowY: "auto",
        }}>
          {strategies.map((s: string) => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }} style={{
              display: "flex", width: "100%", alignItems: "center", gap: "10px",
              background: s === value ? C.panel2 : "transparent", border: "none",
              borderRadius: "8px", padding: "11px 11px", minHeight: "44px", cursor: "pointer", textAlign: "left",
              fontFamily: MONO, color: C.text,
            }}>
              <span style={{ fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500, minWidth: "34px" }}>{stratCode(s)}</span>
              <span style={{ fontSize: "12px", color: C.text2, letterSpacing: "0.02em" }}>{stratShort(s)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUB-NAV DROPDOWN ────────────────────────────────────────────────────────
// Compact dropdown for the current section's sub-views. Lives inside the desktop
// top-nav on the right, so main-nav + sub-nav collapse from 2 rows to 1.
export function SubNavDropdown({ sections, value, onChange, C }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<any>(null);
  useEffect(() => {
    function onDoc(e: any) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const current = sections.find((s: any) => s.id === value);
  if (!current) return null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px",
        padding: "6px 12px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, display: "inline-flex",
        alignItems: "center", gap: "8px", whiteSpace: "nowrap", color: C.text,
        fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        <span>{current.label}</span>
        <span style={{ fontSize: "9px", color: C.muted }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          minWidth: "180px", background: C.panel, border: `1px solid ${C.border2}`,
          borderRadius: "12px", padding: "6px", boxShadow: `0 8px 24px ${C.shadow}`,
        }}>
          {sections.map((s: any) => (
            <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }} style={{
              display: "flex", alignItems: "center", width: "100%", background: s.id === value ? C.panel2 : "transparent",
              border: "none", borderRadius: "8px", padding: "9px 11px", minHeight: "44px", cursor: "pointer",
              textAlign: "left", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em",
              textTransform: "uppercase", color: s.id === value ? C.text : C.text2,
            }}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GEAR BUTTON ─────────────────────────────────────────────────────────────
// Small circular icon button rendered next to SubNavDropdown. Clicking it jumps
// the user to Home → Settings. Replaces the old "Settings" entry in the sub-nav.
export function GearButton({ onClick, active, C }: any) {
  return (
    <button onClick={onClick} title="Settings" aria-label="Settings"
      style={{
        background: active ? C.text : "transparent",
        color: active ? C.bg : C.muted,
        border: `1px solid ${active ? C.text : C.border2}`,
        borderRadius: "999px",
        width: "44px", height: "44px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0, flexShrink: 0,
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATOMS — Kōda visual system components
// Ported from koda-screens.jsx design reference (May 2026 redesign).
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GLASS ORB ──────────────────────────────────────────────────────────────
// Soft radial bloom anchored off-canvas. Use sparingly — one per screen max.
export function GlassOrb({ C, top, left, right, bottom, size = 320, color, opacity = 0.5 }: {
  C: Theme; top?: number | string; left?: number | string; right?: number | string; bottom?: number | string;
  size?: number; color?: string; opacity?: number;
}) {
  return (
    <div style={{
      position: "absolute", top, left, right, bottom,
      width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle at 50% 50%, ${color || C.orb1} 0%, transparent 65%)`,
      filter: "blur(40px)", opacity, pointerEvents: "none", zIndex: 0,
    }} />
  );
}

// ─── CORNER GLOW ────────────────────────────────────────────────────────────
// Iridescent conic-gradient blob inside glass cards.
export function CornerGlow({ C, corner = "tl", opacity = 0.55 }: {
  C: Theme; corner?: "tl" | "tr" | "bl" | "br"; opacity?: number;
}) {
  const posMap: Record<string, React.CSSProperties> = {
    tl: { top: -60, left: -60 },
    tr: { top: -60, right: -60 },
    bl: { bottom: -60, left: -60 },
    br: { bottom: -60, right: -60 },
  };
  return (
    <div style={{
      position: "absolute", ...posMap[corner], width: 220, height: 220,
      borderRadius: "50%", pointerEvents: "none",
      background: `conic-gradient(from 200deg at 50% 50%, ${C.orb3}, ${C.accent}, ${C.orb2}, ${C.orb3})`,
      filter: "blur(40px)", opacity, zIndex: 0,
    }} />
  );
}

// ─── GHOST WORD ─────────────────────────────────────────────────────────────
// Ultra-display stenciled word behind hero blocks — editorial heft.
export function GhostWord({ word = "EDGE", C, isDark = true, fontSize = 200, bottom, top, left, right, align = "left" }: {
  word?: string; C: Theme; isDark?: boolean; fontSize?: number;
  bottom?: number | string; top?: number | string; left?: number | string; right?: number | string;
  align?: "left" | "center" | "right";
}) {
  return (
    <div style={{
      position: "absolute", top, bottom, left, right,
      pointerEvents: "none", overflow: "hidden",
      width: "100%", textAlign: align, lineHeight: 0.9, zIndex: 0,
    }}>
      <span style={{
        fontFamily: DISPLAY, fontWeight: 700,
        fontSize, letterSpacing: "-0.04em",
        background: isDark
          ? "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.01))"
          : "linear-gradient(180deg, rgba(10,10,10,0.12), rgba(10,10,10,0.02))",
        WebkitBackgroundClip: "text", backgroundClip: "text",
        WebkitTextFillColor: "transparent", color: "transparent",
        WebkitTextStroke: isDark ? "1px rgba(255,255,255,0.06)" : "1px rgba(10,10,10,0.08)",
      } as React.CSSProperties}>{word}</span>
    </div>
  );
}

// ─── TICK MOTIF ─────────────────────────────────────────────────────────────
// Scattered candle/tick marks as decorative background pattern.
export function TickMotif({ C, opacity = 0.4, density = 8 }: {
  C: Theme; opacity?: number; density?: number;
}) {
  const items: Array<{ x: number; y: number; k: number; sz: number; i: number }> = [];
  for (let i = 0; i < density; i++) {
    items.push({
      x: (i * 137 % 92) + 4,
      y: (i * 71 % 80) + 8,
      k: i % 4,
      sz: 14 + (i % 3) * 6,
      i,
    });
  }
  const syms = ["ES", "NQ", "CL", "GC"];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity, zIndex: 0, overflow: "hidden" }}>
      {items.map(({ x, y, k, sz, i }) => (
        <div key={i} style={{
          position: "absolute",
          left: `${x}%`, top: `${y}%`,
          transform: `rotate(${(i * 23) % 30 - 15}deg)`,
          color: C.text2, fontFamily: MONO,
          fontSize: sz * 0.5, letterSpacing: "0.08em",
        }}>
          {k === 0 && <span>+{((i + 1) * 0.3).toFixed(1)}R</span>}
          {k === 1 && (
            <svg width={sz} height={sz * 1.4} viewBox="0 0 20 28">
              <line x1="10" y1="2" x2="10" y2="26" stroke="currentColor" strokeWidth="0.8" />
              <rect x="6" y="8" width="8" height="10" stroke="currentColor" strokeWidth="0.8" fill="none" />
            </svg>
          )}
          {k === 2 && <span style={{ fontSize: sz * 0.6 }}>{"▲"}</span>}
          {k === 3 && <span>{syms[i % 4]}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── TEAL ARROW BUTTON ──────────────────────────────────────────────────────
// Mint circular CTA — "go" action.
export function TealArrowBtn({ C, size = 36, onClick }: {
  C: Theme; size?: number; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: 999,
      background: C.live,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 0 4px color-mix(in oklch, ${C.live} 25%, transparent)`,
      flexShrink: 0, cursor: onClick ? "pointer" : "default",
    }}>
      <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="#0A0A0A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── FLOATING INPUT ─────────────────────────────────────────────────────────
// Label-floats-up input with mono kicker label.
export function FloatingInput({ C, label, value, placeholder, action, onChange }: {
  C: Theme; label: string; value?: string; placeholder?: string;
  action?: React.ReactNode; onChange?: (v: string) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 8px 10px 16px",
      borderRadius: 14,
      background: "color-mix(in srgb, currentColor 4%, transparent)",
      border: `1px solid ${C.border2}`,
      position: "relative",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: MONO, fontSize: 9,
          letterSpacing: "0.16em", color: C.muted,
          textTransform: "uppercase", marginBottom: 2,
        }}>{label}</div>
        {onChange ? (
          <input
            value={value || ""}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            style={{
              fontFamily: BODY, fontSize: 14,
              color: C.text, fontWeight: 500,
              background: "transparent", border: "none", outline: "none",
              width: "100%", padding: 0,
            }}
          />
        ) : (
          <div style={{
            fontFamily: BODY, fontSize: 14,
            color: value ? C.text : C.muted, fontWeight: 500,
          }}>{value || placeholder}</div>
        )}
      </div>
      {action}
    </div>
  );
}

// ─── PILL ───────────────────────────────────────────────────────────────────
// Active/inactive chip — for filters, tags, segmented controls.
export function Pill({ C, active, children, onClick, size = "md", style }: {
  C: Theme; active?: boolean; children: React.ReactNode; onClick?: () => void;
  size?: "sm" | "md"; style?: React.CSSProperties;
}) {
  const pad = size === "sm" ? "6px 12px" : "8px 16px";
  const fs = size === "sm" ? 11 : 13;
  return (
    <div onClick={onClick} style={{
      padding: pad, borderRadius: 999,
      background: active ? C.text : "transparent",
      color: active ? C.bg : C.text2,
      border: active ? `1px solid ${C.text}` : `1px solid ${C.border2}`,
      fontSize: fs, fontWeight: 500, fontFamily: BODY,
      letterSpacing: "0.01em", cursor: onClick ? "pointer" : "default",
      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center",
      ...style,
    }}>{children}</div>
  );
}

// ─── CARD ───────────────────────────────────────────────────────────────────
// Glass-or-solid card with consistent radius (24px).
export function Card({ C, children, style, glass = false, pad = 18 }: {
  C: Theme; children: React.ReactNode; style?: React.CSSProperties;
  glass?: boolean; pad?: number;
}) {
  return (
    <div style={{
      borderRadius: 24,
      background: glass ? C.surfaceGlass : C.panel,
      backdropFilter: glass ? "blur(20px) saturate(140%)" : undefined,
      WebkitBackdropFilter: glass ? "blur(20px) saturate(140%)" : undefined,
      border: `1px solid ${C.border}`,
      padding: pad,
      position: "relative",
      overflow: "hidden",
      ...style,
    }}>{children}</div>
  );
}
// ─── KICKER ─────────────────────────────────────────────────────────────────
// Mono 10px uppercase section label.
export function Kicker({ C, children, color }: {
  C: Theme; children: React.ReactNode; color?: string;
}) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 500,
      letterSpacing: "0.16em", textTransform: "uppercase",
      color: color || C.muted,
    }}>{children}</div>
  );
}

// ─── DELTA ──────────────────────────────────────────────────────────────────
// +/-% chip with arrow, coloured by sign.
export function Delta({ C, value, dollars }: {
  C: Theme; value: number; dollars?: string;
}) {
  const positive = value > 0;
  const c = positive ? C.green : C.red;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 999,
      background: `color-mix(in oklch, ${c} 14%, transparent)`,
      color: c, fontSize: 11, fontWeight: 600,
      fontFamily: MONO,
    }}>
      <span style={{ fontSize: 9 }}>{positive ? "\u25b2" : "\u25bc"}</span>
      {positive ? "+" : ""}{value}%
      {dollars !== undefined && <span style={{ opacity: 0.7, marginLeft: 2 }}>({dollars})</span>}
    </span>
  );
}

// ─── SCREEN HEADER ──────────────────────────────────────────────────────────
// Wordmark + right actions (bell + avatar) masthead.
export function ScreenHeader({ C, right }: {
  C: Theme; right?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 22px 6px", position: "relative", zIndex: 2,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <KodaMark size={22} color={C.text} />
        <span style={{
          fontFamily: DISPLAY, fontWeight: 600, fontSize: 14,
          letterSpacing: "0.22em", color: C.text,
        }}>K&#333;da</span>
        <span style={{
          fontFamily: MONO, fontWeight: 500, fontSize: 9,
          letterSpacing: "0.16em", color: C.text,
          padding: "2px 5px", borderRadius: 4,
          border: `1px solid ${C.border2}`, lineHeight: 1,
        }}>OS</span>
      </div>
      {right && <div style={{ display: "flex", gap: 8 }}>{right}</div>}
    </div>
  );
}

// ─── ICON BUTTON ────────────────────────────────────────────────────────────
// 36x36 round panel button with SVG icon.
const ICON_PATHS: Record<string, string> = {
  bell: "M10 3.5a4.5 4.5 0 0 1 4.5 4.5v3l1.2 2.4H4.3L5.5 11V8A4.5 4.5 0 0 1 10 3.5Zm-1.5 10.5h3a1.5 1.5 0 0 1-3 0Z",
  back: "M12 4L6 10l6 6",
  plus: "M10 5v10M5 10h10",
  search: "M9 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM12.5 12.5L15 15",
};

export function IconButton({ C, icon, onClick }: {
  C: Theme; icon: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 999,
      background: C.panel, border: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: onClick ? "pointer" : "default", flexShrink: 0,
    }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d={ICON_PATHS[icon] || ""} stroke={C.text} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

// ── Skeleton bar ─────────────────────────────────────────────────────────────
export function SkeletonBar({ w = "100%", h = 14, C }: { w?: string | number; h?: number; C: Theme }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: `linear-gradient(90deg, ${C.panel} 0%, ${C.border2} 50%, ${C.panel} 100%)`,
      backgroundSize: "600px 100%",
      animation: "kShimmer 1.4s linear infinite",
    }} />
  );
}

// ── Empty: no trades ─────────────────────────────────────────────────────────
export function EmptyTradesState({ C, onLog, onSync }: { C: Theme; onLog: () => void; onSync: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "60px 24px 40px" }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.7 }}>
        <rect x="14" y="14" width="52" height="62" rx="6" stroke={C.border2} strokeWidth="1.4"/>
        <path d="M22 28h36M22 38h36M22 48h28M22 58h22" stroke={C.border2} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 4"/>
        <circle cx="62" cy="20" r="10" fill={C.live} opacity="0.18"/>
        <path d="M58 20l3 3 5-6" stroke={C.live} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: "-0.01em" }}>Your journal awaits.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 260, lineHeight: 1.6 }}>
          Log a trade to start seeing your win rate, average R, and edge patterns.
        </div>
      </div>
      <button onClick={onLog} style={{
        marginTop: 4, padding: "13px 28px", borderRadius: 999,
        background: C.text, color: C.bg, border: "none",
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" as const, fontWeight: 600, cursor: "pointer",
      }}>Log first trade</button>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.12em", marginTop: 4 }}>
        OR <span onClick={onSync} style={{ color: C.live, cursor: "pointer" }}>connect Tradovate</span> · <span onClick={onSync} style={{ color: C.accent, cursor: "pointer" }}>import CSV</span>
      </div>
    </div>
  );
}

// ── Empty: no circles ────────────────────────────────────────────────────────
export function EmptyCirclesState({ C, onDiscover, onJoin }: { C: Theme; onDiscover: () => void; onJoin: () => void }) {
  const colors = [C.accent, C.live, C.green];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "60px 24px 40px" }}>
      <div style={{ position: "relative", width: 110, height: 90 }}>
        {colors.map((c, i) => (
          <div key={i} style={{
            position: "absolute", width: 56, height: 56, borderRadius: "50%",
            border: `1.5px solid ${C.border2}`,
            left: i * 24, top: i % 2 === 0 ? 0 : 28,
            background: `radial-gradient(circle, color-mix(in oklch, ${c} 19%, transparent) 0%, transparent 70%)`,
          }} />
        ))}
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text }}>Don't trade alone.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 270, lineHeight: 1.6 }}>
          Join the Kōda Global circle, find a niche group, or create your own with friends.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={onDiscover} style={{ padding: "11px 18px", borderRadius: 999, background: C.live, color: C.bg, border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>Discover</button>
        <button onClick={onJoin} style={{ padding: "11px 18px", borderRadius: 999, background: "transparent", color: C.text, border: `1px solid ${C.border2}`, fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>Join by code</button>
      </div>
    </div>
  );
}

// ── Empty: inbox zero ────────────────────────────────────────────────────────
export function EmptyInboxState({ C }: { C: Theme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "80px 24px 40px" }}>
      <div style={{ width: 76, height: 76, borderRadius: "50%", background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border2}` }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M4 12h6l2 4 2-8 2 4h4" stroke={C.live} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text }}>All clear.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 260, lineHeight: 1.6 }}>
          New circle activity, follower pings, and Kōda AI insights will land here.
        </div>
      </div>
    </div>
  );
}

// ── Error: offline ────────────────────────────────────────────────────────────
export function ErrorOfflineState({ C, onRetry }: { C: Theme; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "80px 24px 40px" }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke={C.red} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: C.text }}>You're offline.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 260, lineHeight: 1.6 }}>
          Your trades are safe locally. Kōda will sync when the connection returns.
        </div>
      </div>
      <button onClick={onRetry} style={{ padding: "11px 22px", borderRadius: 999, background: C.panel, color: C.text, border: `1px solid ${C.border2}`, fontFamily: MONO, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase" as const, cursor: "pointer" }}>Retry</button>
    </div>
  );
}

// ── Error: sync failed ────────────────────────────────────────────────────────
export function ErrorSyncFailedState({ C, broker, onRetry }: { C: Theme; broker: string; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 0" }}>
      <div style={{ padding: "16px 18px", borderRadius: 14, background: `color-mix(in oklch, ${C.red} 10%, transparent)`, border: `1px solid color-mix(in oklch, ${C.red} 25%, transparent)`, display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={C.red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: C.red, textTransform: "uppercase" as const }}>Sync error · {broker}</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 3 }}>Last attempt failed. Check your connection or re-authenticate.</div>
        </div>
        <button onClick={onRetry} style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 999, background: "transparent", border: `1px solid color-mix(in oklch, ${C.red} 38%, transparent)`, color: C.red, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", cursor: "pointer", flexShrink: 0 }}>Retry</button>
      </div>
    </div>
  );
}

// ── Celebration overlays ─────────────────────────────────────────────────────
type CelebrationKind = "trade" | "streak" | "pro";

interface CelebrationProps {
  C: Theme;
  kind: CelebrationKind;
  streakCount?: number;
  tradeStats?: { winRate: number; avgR: number; streak: number };
  onDismiss: () => void;
  onViewTrade?: () => void;
}

export function CelebrationOverlay({ C, kind, streakCount, tradeStats, onDismiss, onViewTrade }: CelebrationProps) {
  const live = C.live;
  const orb1 = (C as any).orb1 ?? C.accent;
  const orb3 = (C as any).orb3 ?? C.green;
  const confettiColors = [live, C.accent, C.green, orb1, orb3];

  useEffect(() => {
    if (kind === "trade") {
      const t = setTimeout(onDismiss, 2500);
      return () => clearTimeout(t);
    }
  }, [kind, onDismiss]);

  return (
    <div
      onClick={kind === "streak" ? undefined : onDismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 8000,
        background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center",
        animation: "kFadeIn 0.25s ease-out",
      }}
    >
      {kind === "trade" && (
        <div style={{ position: "relative", width: "min(360px, 92vw)", padding: "36px 24px 28px", borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, animation: "kRise 0.42s ease-out" }} onClick={e => e.stopPropagation()}>
          {/* confetti burst */}
          <div style={{ position: "absolute", top: 120, left: "50%", width: 1, height: 1, pointerEvents: "none" }}>
            {Array.from({ length: 20 }).map((_, i) => {
              const angle = (i / 20) * 360;
              return <span key={i} style={{ position: "absolute", top: 0, left: 0, width: 6, height: 11, borderRadius: 1, background: confettiColors[i % confettiColors.length], transform: `translate(-50%,-50%) rotate(${angle}deg)`, animation: `kConfettiA 2s ${i * 0.05}s ease-out forwards` }} />;
            })}
          </div>
          {/* checkmark ring */}
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: `color-mix(in oklch, ${live} 13%, transparent)`, border: `1.5px solid ${live}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4 4L19 7" stroke={live} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" style={{ animation: "kTick 0.7s ease-out forwards" }} />
            </svg>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>Trade logged.</div>
          {tradeStats && (
            <div style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: C.bg, border: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { l: "Win rate", v: `${tradeStats.winRate}%` },
                { l: "Avg R", v: tradeStats.avgR > 0 ? `+${tradeStats.avgR.toFixed(1)}` : tradeStats.avgR.toFixed(1) },
                { l: "Streak", v: tradeStats.streak > 0 ? `${tradeStats.streak}W` : "—" },
              ].map(s => (
                <div key={s.l} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", color: C.muted, textTransform: "uppercase" as const }}>{s.l}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.text, marginTop: 4 }}>{s.v}</div>
                </div>
              ))}
            </div>
          )}
          {onViewTrade && (
            <button onClick={onViewTrade} style={{ padding: "11px 24px", borderRadius: 999, background: C.text, color: C.bg, border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, cursor: "pointer" }}>View trade →</button>
          )}
        </div>
      )}

      {kind === "streak" && (
        <div style={{ width: "min(360px, 92vw)", padding: "36px 24px 28px", borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, animation: "kRise 0.42s ease-out" }} onClick={e => e.stopPropagation()}>
          <div style={{ color: live, animation: "kStreakGlow 1.6s ease-in-out infinite" }}>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.5 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 4 4 0-3 0-5 0-7z"/></svg>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, background: `linear-gradient(180deg, ${C.text}, ${live})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{streakCount}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 500, color: C.text, fontStyle: "italic" }}>green days in a row.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={onDismiss} style={{ padding: "11px 20px", borderRadius: 999, background: live, color: C.bg, border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>Keep going</button>
          </div>
        </div>
      )}

      {kind === "pro" && (
        <div style={{ width: "min(380px, 92vw)", padding: "36px 24px 28px", borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, position: "relative", overflow: "hidden", animation: "kRise 0.42s ease-out" }} onClick={e => e.stopPropagation()}>
          <div style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", width: 320, height: 320, borderRadius: "50%", background: `conic-gradient(from 180deg, ${orb1}, ${orb3}, ${live}, ${orb1})`, filter: "blur(80px)", opacity: 0.35, pointerEvents: "none" }} />
          <div style={{ position: "relative", padding: "12px 28px", borderRadius: 999, background: `linear-gradient(135deg, ${live}, ${C.accent})`, color: C.bg, overflow: "hidden", fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: "0.16em" }}>
            PRO
            <div style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", background: "rgba(255,255,255,0.45)", animation: "kSheen 2.8s linear infinite" }} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, color: C.text, letterSpacing: "-0.02em", position: "relative" }}>You're in.</div>
          <div style={{ fontSize: 13, color: C.text2, maxWidth: 270, lineHeight: 1.5, position: "relative" }}>Auto-import, unlimited circles, prop firm tracker, and Kōda AI are now active.</div>
          <button onClick={onDismiss} style={{ marginTop: 8, padding: "12px 28px", borderRadius: 999, background: C.text, color: C.bg, border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, cursor: "pointer", position: "relative" }}>Start trading →</button>
        </div>
      )}
    </div>
  );
}


// ─── EMPTY STATE ────────────────────────────────────────────────────────────
// Reusable branded empty state: icon, headline, body, optional CTA.
export function EmptyState({ C, icon, headline, body, cta, onCta }: {
  C: Theme; icon: string; headline: string; body: string;
  cta?: string; onCta?: () => void;
}) {
  return (
    <div style={{
      textAlign: "center", padding: "60px 20px", position: "relative",
      overflow: "hidden",
    }}>
      {/* Ghost watermark */}
      <div style={{
        position: "absolute", bottom: -12, right: -4, pointerEvents: "none",
        fontFamily: DISPLAY, fontWeight: 700, fontSize: 80, lineHeight: 0.85,
        letterSpacing: "-0.05em", opacity: 0.03, color: C.text,
      }}>EDGE</div>

      <div style={{ fontSize: 36, marginBottom: 16, filter: "grayscale(0.3)" }}>{icon}</div>
      <div style={{
        fontFamily: DISPLAY, fontSize: "clamp(18px, 4vw, 22px)",
        fontWeight: 500, fontStyle: "italic", color: C.text2,
        letterSpacing: "-0.02em", marginBottom: 8, lineHeight: 1.2,
      }}>{headline}</div>
      <div style={{
        fontFamily: BODY, fontSize: 13, color: C.muted,
        lineHeight: 1.6, maxWidth: "32ch", margin: "0 auto",
      }}>{body}</div>
      {cta && onCta && (
        <button onClick={onCta} style={{
          marginTop: 24, background: C.text, color: C.bg,
          border: "none", borderRadius: 999, padding: "12px 24px",
          cursor: "pointer", fontFamily: MONO, fontSize: 10,
          letterSpacing: "0.1em", textTransform: "uppercase",
          fontWeight: 500,
        }}>{cta}</button>
      )}
    </div>
  );
}
