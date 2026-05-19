// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · BetaGate
//
// Password-gated entry screen shown before sign-up/login during closed beta.
// Set VITE_BETA_PASSWORD in Vercel env vars to enable.
// Once the correct password is entered, the unlock is stored in localStorage
// so the user isn't prompted again on the same device.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { MONO, BODY } from "./shared";

const BETA_PASSWORD  = import.meta.env.VITE_BETA_PASSWORD as string | undefined;
const STORAGE_KEY    = "tradr_beta_unlocked";

// If no password is set in env, beta gate is disabled entirely.
export const betaEnabled = !!BETA_PASSWORD;

export function isBetaUnlocked(): boolean {
  if (!betaEnabled) return true;
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function unlock() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
}

interface BetaGateProps {
  onUnlocked: () => void;
}

export function BetaGate({ onUnlocked }: BetaGateProps) {
  const [input,  setInput]  = useState("");
  const [error,  setError]  = useState(false);
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
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0d0d1a",
      padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        animation: shaking ? "betaShake 0.45s ease" : undefined,
      }}>
        {/* Logo / wordmark */}
        <div style={{
          fontFamily: MONO, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em",
          color: "#fff", marginBottom: 6, textAlign: "center",
        }}>
          TRADR
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "#7c3aed", textAlign: "center", marginBottom: 48,
        }}>
          Closed Beta
        </div>

        {/* Card */}
        <div style={{
          background: "#1a1a2e",
          borderRadius: 20,
          padding: "32px 28px 36px",
          border: `1px solid ${error ? "#ef444440" : "#ffffff12"}`,
          transition: "border-color 0.2s",
        }}>
          <div style={{
            fontFamily: BODY, fontSize: 20, fontWeight: 700,
            color: "#e2e8f0", marginBottom: 8, lineHeight: 1.3,
          }}>
            You need a beta invite
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 14, color: "#888",
            marginBottom: 28, lineHeight: 1.6,
          }}>
            TRADR is in closed beta. Enter your invite code to get started.
          </div>

          {/* Input */}
          <div style={{ marginBottom: 14 }}>
            <input
              type="password"
              autoComplete="off"
              placeholder="Enter invite code"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              onKeyDown={onKey}
              style={{
                width: "100%", padding: "13px 16px", borderRadius: 12,
                border: `1.5px solid ${error ? "#ef4444" : "#333"}`,
                background: "#0d0d1a", color: "#e2e8f0",
                fontFamily: MONO, fontSize: 16, letterSpacing: "0.12em",
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
            />
            {error && (
              <div style={{
                fontFamily: MONO, fontSize: 11, color: "#ef4444",
                marginTop: 6, letterSpacing: "0.04em",
              }}>
                Incorrect code — try again
              </div>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={attempt}
            disabled={!input.trim()}
            style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: input.trim() ? "#7c3aed" : "#333",
              color: input.trim() ? "#fff" : "#555",
              fontFamily: MONO, fontSize: 13, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: input.trim() ? "pointer" : "not-allowed",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            Enter →
          </button>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 24, textAlign: "center",
          fontFamily: MONO, fontSize: 10, color: "#444",
          letterSpacing: "0.06em",
        }}>
          No code? DM <span style={{ color: "#7c3aed" }}>@tradrjournal</span> on X
        </div>
      </div>

      {/* Shake keyframe */}
      <style>{`
        @keyframes betaShake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
