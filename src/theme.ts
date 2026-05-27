// ═══════════════════════════════════════════════════════════════════════════════
// theme.ts — Kōda design system
//
// OKLCH-based palette, Geist type scale, glass surfaces.
// Import DARK / LIGHT for the colour token set.
// Import makeStyles(C) for the shared editorial style helpers.
// ═══════════════════════════════════════════════════════════════════════════════

import type React from "react";
import { MONO, BODY } from "./shared";

// ── Colour tokens ─────────────────────────────────────────────────────────────

export const DARK = {
  // Core surfaces
  bg: "#0A0A0B",
  panel: "#131317",
  panel2: "#1A1A20",
  border: "rgba(255,255,255,0.07)",
  border2: "rgba(255,255,255,0.12)",
  // Text
  text: "#F2F2EE",
  text2: "#A6A6A2",
  muted: "#65655F",
  dim: "#45453F",
  // Accents
  accent: "oklch(0.74 0.16 250)",    // electric blue — links, highlights
  accentSoft: "oklch(0.74 0.16 250 / 0.18)",
  live: "oklch(0.84 0.14 175)",      // mint/teal — "go" CTAs
  liveSoft: "oklch(0.84 0.14 175 / 0.18)",
  // Outcome
  green: "oklch(0.78 0.18 152)",
  red: "oklch(0.70 0.21 25)",
  // Glass/bloom
  surfaceGlass: "rgba(28,28,34,0.55)",
  orb1: "oklch(0.55 0.22 252)",
  orb2: "oklch(0.45 0.20 268)",
  orb3: "oklch(0.68 0.18 175)",
  // Legacy compat
  blue: "oklch(0.74 0.16 250)",
  yellow: "#65655F",
  inputBg: "transparent",
  shadow: "rgba(0,0,0,0.45)",
} as const;

export const LIGHT = {
  // Core surfaces
  bg: "#F4F2ED",
  panel: "#FFFFFF",
  panel2: "#FAFAF6",
  border: "rgba(10,10,10,0.07)",
  border2: "rgba(10,10,10,0.14)",
  // Text
  text: "#0A0A0A",
  text2: "#55554F",
  muted: "#9A9890",
  dim: "rgba(10,10,10,0.20)",
  // Accents
  accent: "oklch(0.55 0.18 252)",
  accentSoft: "oklch(0.55 0.18 252 / 0.10)",
  live: "oklch(0.62 0.14 175)",
  liveSoft: "oklch(0.62 0.14 175 / 0.12)",
  // Outcome
  green: "oklch(0.55 0.18 152)",
  red: "oklch(0.55 0.22 25)",
  // Glass/bloom
  surfaceGlass: "rgba(255,255,255,0.65)",
  orb1: "oklch(0.78 0.14 252)",
  orb2: "oklch(0.72 0.12 268)",
  orb3: "oklch(0.78 0.10 175)",
  // Legacy compat
  blue: "oklch(0.55 0.18 252)",
  yellow: "#9A9890",
  inputBg: "transparent",
  shadow: "rgba(0,0,0,0.08)",
} as const;

/** Canonical theme type — typeof DARK works for both (identical keys). */
export type Theme = typeof DARK;

// ── Shared style factory ──────────────────────────────────────────────────────
// Call makeStyles(C) inside a component where C = DARK | LIGHT.
// Returns the editorial input / label / pill helpers used across all screens.

export function makeStyles(C: Theme) {
  const inp: React.CSSProperties = {
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${C.border2}`,
    borderRadius: 0,
    color: C.text,
    padding: "12px 0",
    minHeight: "44px",
    fontSize: "16px",
    width: "100%",
    outline: "none",
    fontFamily: BODY,
    boxSizing: "border-box",
    letterSpacing: "0.01em",
  };

  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };

  const lbl: React.CSSProperties = {
    fontSize: "11px",
    color: C.muted,
    letterSpacing: "0.06em",
    marginBottom: "4px",
    display: "block",
    fontFamily: MONO,
    textTransform: "uppercase",
  };

  const pillPrimary = (enabled = true): React.CSSProperties => ({
    background: enabled ? C.text : "transparent",
    color: enabled ? C.bg : C.muted,
    border: enabled ? "none" : `1px solid ${C.border2}`,
    borderRadius: "999px",
    padding: "14px 20px",
    fontSize: "13px",
    letterSpacing: "0.02em",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: BODY,
    width: "100%",
    transition: "opacity 0.15s, transform 0.15s",
  });

  const pillGhost: React.CSSProperties = {
    background: "transparent",
    color: C.text,
    border: `1px solid ${C.border2}`,
    borderRadius: "999px",
    padding: "12px 18px",
    minHeight: "44px",
    fontSize: "12px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: MONO,
    textTransform: "uppercase",
    transition: "opacity 0.15s",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return { inp, sel, lbl, pillPrimary, pillGhost };
}
