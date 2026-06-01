// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · BetaGate
//
// Password-gated entry screen shown before sign-up/login during closed beta.
// Set VITE_BETA_PASSWORD in Vercel env vars to enable the gate.
// Once the correct password is entered the unlock is stored in localStorage
// so the user is not prompted again on the same device.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { MONO, BODY } from "./shared";
import { BetaWelcome } from "./BetaWelcome";

// VITE_BETA_ENABLED=true shows the gate UI. The actual password lives in
// BETA_PASSWORD on the server — never in the bundle.
const STORAGE_KEY = "koda_beta_unlocked";
const COOKIE_KEY  = "koda_beta_unlocked";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const betaEnabled = import.meta.env.VITE_BETA_ENABLED === "true";

function hasUnlockCookie(): boolean {
  try { return document.cookie.split("; ").some(c => c.startsWith(`${COOKIE_KEY}=1`)); }
  catch { return false; }
}

export function isBetaUnlocked(): boolean {
  if (!betaEnabled) return true;
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch { /* ignore */ }
  // Cookie fallback — survives localStorage flushes (iOS Safari/PWA after OAuth round-trip).
  return hasUnlockCookie();
}

function unlock() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  try {
    document.cookie = `${COOKIE_KEY}=1; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
  } catch { /* ignore */ }
}

// ── Palette — matches DARK theme in Koda.tsx ─────────────────────────────────
const BG      = "#0A0A0B";
const PANEL   = "#131317";
const BORDER  = "rgba(255,255,255,0.07)";
const BORDER2 = "rgba(255,255,255,0.13)";
const TEXT    = "#F2F2EE";
const TEXT2   = "#A6A6A2";
const MUTED   = "#65655F";
const DIM     = "#45453F";
const MINT    = "oklch(0.84 0.14 175)";
const RED     = "oklch(0.70 0.21 25)";

// ── Kōda mark (square badge) ──────────────────────────────────────────────────
function KodaMarkFilled({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.8)} viewBox="0 0 100 80" fill="none" style={{ display: "block", flexShrink: 0 }}>
      <polyline points="8,8 22,40 8,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="28,8 42,40 28,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="48,8 62,40 48,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="68,8 82,40 68,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
    </svg>
  );
}

const PILLARS = [
  { n: "01", w: "discipline", accent: false },
  { n: "02", w: "momentum",   accent: false },
  { n: "03", w: "progress",   accent: false },
  { n: "04", w: "success",    accent: true  },
];

interface BetaGateProps {
  onUnlocked: () => void;
}

export function BetaGate({ onUnlocked }: BetaGateProps) {
  const [input,    setInput]    = useState("");
  const [error,    setError]    = useState(false);
  const [shaking,  setShaking]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const [wlEmail,   setWlEmail]   = useState("");
  const [wlLoading, setWlLoading] = useState(false);
  const [wlResult,  setWlResult]  = useState<{ position: number; existing?: boolean } | "error" | null>(null);

  if (showWelcome) {
    return <BetaWelcome onClose={onUnlocked} />;
  }

  async function attempt() {
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/account?action=beta-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input.trim() }),
      });
      if (res.ok) {
        unlock();
        setShowWelcome(true);
      } else {
        setError(true);
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      }
    } catch {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") attempt();
    if (error) setError(false);
  }

  async function joinWaitlist() {
    if (!wlEmail.trim() || wlLoading) return;
    setWlLoading(true);
    try {
      const res = await fetch("/api/account?action=join-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: wlEmail.trim() }),
      });
      const json = await res.json();
      if (res.ok || res.status === 409) {
        setWlResult({ position: json.position, existing: json.existing });
      } else {
        setWlResult("error");
      }
    } catch {
      setWlResult("error");
    } finally {
      setWlLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: BG,
      color: TEXT,
      fontFamily: BODY,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes betaShake{
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-7px)}
          40%{transform:translateX(7px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
        @keyframes orbFloat{
          0%,100%{transform:translate(-50%,-50%) scale(1)}
          50%{transform:translate(-50%,-50%) scale(1.08)}
        }
        .beta-input::placeholder{color:${DIM};}
        .beta-input:focus{border-bottom-color:${TEXT}!important;}
        .beta-btn:hover:not(:disabled){opacity:0.85;}
        .beta-btn:active:not(:disabled){transform:scale(0.98);}
      `}</style>

      {/* Background orb */}
      <div style={{
        position: "absolute",
        top: "30%", left: "20%",
        width: 560, height: 560,
        borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.55 0.22 252) 0%, transparent 65%)",
        filter: "blur(80px)",
        opacity: 0.28,
        animation: "orbFloat 8s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      <div style={{
        width: "100%",
        maxWidth: 400,
        position: "relative",
        zIndex: 1,
        animation: shaking ? "betaShake 0.45s ease" : "rise 0.45s ease",
      }}>

        {/* Masthead */}
        <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 64 }}>
          <KodaMarkFilled size={28} />
          <span style={{
            fontFamily: BODY, fontSize: 16, fontWeight: 600,
            letterSpacing: "0.20em", color: TEXT, lineHeight: 1,
          }}>Kōda</span>
          <span style={{
            marginLeft: "auto",
            fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: "0.08em",
          }}>BETA / 2026</span>
        </header>

        {/* Kicker */}
        <div style={{
          fontFamily: MONO, fontSize: 11, color: MUTED,
          letterSpacing: "0.08em", textTransform: "uppercase",
          marginBottom: 20,
        }}>
          — Closed beta
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: BODY,
          fontSize: "clamp(34px, 8vw, 48px)",
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 0.95,
          color: TEXT,
          marginBottom: 20,
        }}>
          You need an<br />
          <span style={{ fontStyle: "italic", fontWeight: 400, color: TEXT2 }}>invite</span> to get in.
        </h1>

        <p style={{
          fontSize: 14, color: TEXT2, lineHeight: 1.65,
          marginBottom: 40, fontWeight: 400,
        }}>
          Kōda is in closed beta. Enter your invite code to access the platform.
        </p>

        {/* Form */}
        <div style={{
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
          padding: "28px 0",
        }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontFamily: MONO, fontSize: 10, color: MUTED,
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10,
            }}>
              Invite code
            </label>
            <input
              className="beta-input"
              type="password"
              autoComplete="off"
              placeholder="enter code"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              onKeyDown={onKey}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${error ? RED : BORDER2}`,
                borderRadius: 0,
                color: TEXT,
                padding: "12px 0",
                fontSize: 16,
                width: "100%",
                outline: "none",
                fontFamily: BODY,
                boxSizing: "border-box" as const,
                letterSpacing: "0.06em",
                transition: "border-color 0.15s",
              }}
            />
            {error && (
              <div style={{
                fontFamily: MONO, fontSize: 11,
                color: RED, marginTop: 8, letterSpacing: "0.04em",
              }}>
                Incorrect code — try again.
              </div>
            )}
          </div>

          <button
            className="beta-btn"
            onClick={attempt}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? TEXT : "transparent",
              color: input.trim() && !loading ? BG : MUTED,
              border: input.trim() && !loading ? "none" : `1px solid ${BORDER2}`,
              borderRadius: 999,
              padding: "14px 20px",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.02em",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontFamily: BODY,
              width: "100%",
              transition: "background 0.15s, color 0.15s, opacity 0.15s",
            }}
          >
            {loading ? "Checking…" : input.trim() ? "Enter →" : "Enter invite code above"}
          </button>
        </div>

        {/* Four pillars */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          marginTop: 28, flexWrap: "wrap" as const,
        }}>
          {PILLARS.map((p, i) => (
            <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3 }}>
                <span style={{
                  fontFamily: MONO, fontWeight: 500, fontSize: 8,
                  letterSpacing: "0.18em",
                  color: p.accent ? MINT : MUTED,
                }}>{p.n}</span>
                <span style={{
                  fontFamily: BODY, fontStyle: "italic",
                  fontWeight: p.accent ? 500 : 400, fontSize: 12,
                  color: p.accent ? MINT : DIM,
                }}>{p.w}</span>
              </div>
              {i < PILLARS.length - 1 && (
                <svg width="10" height="8" viewBox="0 0 12 10" style={{ opacity: 0.35, marginTop: 8, flexShrink: 0 }}>
                  <path d="M2 1l4 4-4 4M6 1l4 4-4 4" stroke={TEXT} strokeWidth="0.9" fill="none" strokeLinecap="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>

        {/* Waitlist */}
        <div style={{ marginTop: 32 }}>
          <div style={{
            fontFamily: MONO, fontSize: 10, color: MUTED,
            letterSpacing: "0.08em", textTransform: "uppercase" as const,
            marginBottom: 10,
          }}>
            No invite code?
          </div>

          {wlResult === null || wlResult === "error" ? (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={wlEmail}
                  disabled={wlLoading}
                  onChange={e => { setWlEmail(e.target.value); if (wlResult === "error") setWlResult(null); }}
                  onKeyDown={e => { if (e.key === "Enter") joinWaitlist(); }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    borderBottom: `1px solid ${wlResult === "error" ? RED : BORDER2}`,
                    borderRadius: 0,
                    color: TEXT,
                    padding: "10px 0",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: BODY,
                    letterSpacing: "0.02em",
                    transition: "border-color 0.15s",
                  }}
                />
                <button
                  onClick={joinWaitlist}
                  disabled={!wlEmail.trim() || wlLoading}
                  style={{
                    background: "transparent",
                    border: `1px solid ${BORDER2}`,
                    borderRadius: 999,
                    color: wlEmail.trim() && !wlLoading ? TEXT : MUTED,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: BODY,
                    cursor: wlEmail.trim() && !wlLoading ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap" as const,
                    transition: "color 0.15s",
                  }}
                >
                  {wlLoading ? "Joining…" : "Join waitlist →"}
                </button>
              </div>
              {wlResult === "error" && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: RED, marginTop: 8, letterSpacing: "0.04em" }}>
                  Something went wrong — try again
                </div>
              )}
            </>
          ) : (
            <div>
              <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: MINT, letterSpacing: "-0.02em" }}>
                {wlResult.existing
                  ? `You're already on the list (#${wlResult.position}).`
                  : `You're #${wlResult.position} on the list.`}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12, color: TEXT2, marginTop: 6 }}>
                We'll email you when access opens.
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
