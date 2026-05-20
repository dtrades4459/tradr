import { useState, useEffect, useRef } from "react";
import type { StrategyDef } from "./types";

// ─── FONT STACKS (duplicated from TRADR.tsx for standalone use) ──────────────
export const MONO = "'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace";
export const BODY = "'Geist', 'Inter', system-ui, sans-serif";
export const DISPLAY = "'Geist', 'Inter', system-ui, sans-serif";

// ─── STRATEGY CODE HELPERS ───────────────────────────────────────────────────
// Module-level mutable full strategies map (built-ins + custom).
// TRADR.tsx calls setSharedStrategiesMap(getAllStrategiesMap()) whenever strategies
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
export function TrMark({ size = 28, bg = "#0C0C0B" }: { size?: number; bg?: string }) {
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

// ─── TOAST ───────────────────────────────────────────────────────────────────
export function Toast({ message, onDone, C }: any) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: "calc(52px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: 1000, animation: "rise 0.25s ease", background: C.panel, border: `0.5px solid ${C.border2}`, borderRadius: "999px", padding: "9px 18px", fontSize: "10px", color: C.text2, whiteSpace: "nowrap", letterSpacing: "0.10em", fontFamily: MONO, textTransform: "uppercase" }}>
      {message}
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
  if (safeAvatar) return <img src={safeAvatar} alt="av" style={style} onClick={onClick} />;
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
