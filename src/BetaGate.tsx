// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · BetaGate
//
// Password-gated entry screen shown before sign-up/login during closed beta.
// Set VITE_BETA_PASSWORD in Vercel env vars to enable the gate.
// Once the correct password is entered the unlock is stored in localStorage
// so the user is not prompted again on the same device.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";

const BETA_PASSWORD = import.meta.env.VITE_BETA_PASSWORD as string | undefined;
const STORAGE_KEY   = "tradr_beta_unlocked";

export const betaEnabled = !!BETA_PASSWORD;

export function isBetaUnlocked(): boolean {
  if (!betaEnabled) return true;
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function unlock() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
}

// ── Palette (matches TradrAuth exactly) ──────────────────────────────────────
const C = {
  bg:      "#0C0C0B",
  panel:   "#161614",
  border:  "#2A2A26",
  border2: "#3A3A34",
  text:    "#EDEDE8",
  text2:   "#BCBCB4",
  muted:   "#8A8A82",
  dim:     "#55554F",
};

const MONO    = "'IBM Plex Mono', ui-monospace, monospace";
const DISPLAY = "'Syne', 'Inter', system-ui, sans-serif";
const BODY    = "'Inter', system-ui, sans-serif";

// ── TR mark (same as TradrAuth) ───────────────────────────────────────────────
function TrMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <rect width="100" height="100" rx="20" fill={C.panel}/>
      <text x="50" y="67" textAnchor="middle" fill={C.text}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontWeight="700" fontSize="52" letterSpacing="-2">tr</text>
    </svg>
  );
}

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
      background: C.bg,
      color: C.text,
      fontFamily: BODY,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes betaShake{
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-7px)}
          40%{transform:translateX(7px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
        .beta-input::placeholder{color:${C.dim};}
        .beta-input:focus{border-bottom-color:${C.text}!important;}
        .beta-btn:hover:not(:disabled){opacity:0.88;}
        .beta-btn:active:not(:disabled){transform:scale(0.99);}
      `}</style>

      <div style={{
        width: "100%",
        maxWidth: 420,
        animation: shaking ? "betaShake 0.45s ease" : "rise 0.45s ease",
      }}>

        {/* Masthead */}
        <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 56 }}>
          <TrMark size={28} />
          <span style={{
            fontFamily: DISPLAY, fontSize: 17, fontWeight: 700,
            letterSpacing: "-0.02em", color: C.text, lineHeight: 1,
          }}>TRADR</span>
          <span style={{
            marginLeft: "auto",
            fontFamily: MONO, fontSize: 11, color: C.muted, letterSpacing: "0.04em",
          }}>BETA / 2026</span>
        </header>

        {/* Kicker */}
        <div style={{
          fontFamily: MONO, fontSize: 11, color: C.muted,
          letterSpacing: "0.06em", textTransform: "uppercase",
          marginBottom: 20,
        }}>
          — Closed beta
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: DISPLAY,
          fontSize: "clamp(36px, 8vw, 52px)",
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 0.95,
          color: C.text,
          marginBottom: 20,
        }}>
          You need an<br />
          <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>invite</span> to get in.
        </h1>

        <p style={{
          fontSize: 15, color: C.text2, lineHeight: 1.6,
          marginBottom: 40, fontWeight: 400,
        }}>
          TRADR is in closed beta. Enter your invite code to access the platform.
        </p>

        {/* Form */}
        <div style={{
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          padding: "28px 0",
        }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontFamily: BODY, fontSize: 11, color: C.muted,
              letterSpacing: "0.02em", marginBottom: 6,
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
                borderBottom: `1px solid ${error ? "#FF3D00" : C.border2}`,
                borderRadius: 0,
                color: C.text,
                padding: "12px 0",
                fontSize: 16,
                width: "100%",
                outline: "none",
                fontFamily: BODY,
                boxSizing: "border-box",
                letterSpacing: "0.08em",
                transition: "border-color 0.15s",
              }}
            />
            {error && (
              <div style={{
                fontFamily: BODY, fontSize: 12,
                color: "#FF3D00", marginTop: 6,
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
              background: input.trim() ? C.text : "transparent",
              color: input.trim() ? C.bg : C.muted,
              border: input.trim() ? "none" : `1px solid ${C.border2}`,
              borderRadius: 999,
              padding: "14px 20px",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.01em",
              cursor: input.trim() ? "pointer" : "not-allowed",
              fontFamily: BODY,
              width: "100%",
              transition: "background 0.15s, color 0.15s, opacity 0.15s",
            }}
          >
            {input.trim() ? "Enter →" : "Enter invite code above"}
          </button>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 24,
          fontFamily: MONO, fontSize: 10,
          color: C.dim, letterSpacing: "0.06em",
        }}>
          No code? DM @tradrjournal on X
        </div>

      </div>
    </div>
  );
}
