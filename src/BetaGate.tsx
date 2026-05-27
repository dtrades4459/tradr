// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · BetaGate
//
// Password-gated entry screen shown before sign-up/login during closed beta.
// Set VITE_BETA_PASSWORD in Vercel env vars to enable the gate.
// Once the correct password is entered the unlock is stored in localStorage
// so the user is not prompted again on the same device.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";

const BETA_PASSWORD = import.meta.env.VITE_BETA_PASSWORD as string | undefined;
const STORAGE_KEY   = "koda_beta_unlocked";

export const betaEnabled = !!BETA_PASSWORD;

export function isBetaUnlocked(): boolean {
  if (!betaEnabled) return true;
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function unlock() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
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

const MONO    = "'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace";
const BODY    = "'Geist', 'Inter', system-ui, sans-serif";

// ── Kōda mark (square badge) ──────────────────────────────────────────────────
function KodaMarkFilled({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <rect width="100" height="100" rx="20" fill={PANEL}/>
      <text x="50" y="67" textAnchor="middle" fill={TEXT}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
        fontWeight="700" fontSize="52" letterSpacing="-2">tr</text>
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
  const [input,   setInput]   = useState("");
  const [error,   setError]   = useState(false);
  const [shaking, setShaking] = useState(false);

  function attempt() {
    if (input.trim().toLowerCase() === BETA_PASSWORD!.trim().toLowerCase()) {
      unlock();
      onUnlocked();
    } else {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") attempt();
    if (error) setError(false);
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{
              fontFamily: BODY, fontSize: 16, fontWeight: 600,
              letterSpacing: "0.20em", color: TEXT, lineHeight: 1,
            }}>Kōda</span>
            <span style={{
              fontFamily: MONO, fontWeight: 500, fontSize: 10,
              letterSpacing: "0.16em", color: TEXT,
              padding: "2px 6px", borderRadius: 5,
              border: `1.5px solid ${BORDER2}`, lineHeight: 1,
            }}>OS</span>
          </div>
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
            disabled={!input.trim()}
            style={{
              background: input.trim() ? TEXT : "transparent",
              color: input.trim() ? BG : MUTED,
              border: input.trim() ? "none" : `1px solid ${BORDER2}`,
              borderRadius: 999,
              padding: "14px 20px",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.02em",
              cursor: input.trim() ? "pointer" : "not-allowed",
              fontFamily: BODY,
              width: "100%",
              transition: "background 0.15s, color 0.15s, opacity 0.15s",
            }}
          >
            {input.trim() ? "Enter →" : "Enter invite code above"}
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

        {/* Footer */}
        <div style={{
          marginTop: 32,
          fontFamily: MONO, fontSize: 10,
          color: DIM, letterSpacing: "0.06em",
        }}>
          No code? DM{" "}
          <a
            href="https://instagram.com/dylon.trades"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: MINT, textDecoration: "none" }}
          >@dylon.trades</a>{" "}on Instagram
        </div>

      </div>
    </div>
  );
}
