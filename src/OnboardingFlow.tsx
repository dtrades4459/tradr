import { useState } from "react";
import { MONO, BODY, DISPLAY, TrMark } from "./shared";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
export const ONBOARDING_STEPS = ["welcome", "ready"] as const;
export type OnboardingStep = typeof ONBOARDING_STEPS[number];

export const AVATAR_EMOJIS = [
  "🎯","🦁","🐂","🦅","⚡","🔥","💎","🏆",
  "🦈","🧠","🎲","👑","🐺","🦊","🤖","⚔️",
  "🌊","🏔️","🎭","⭐","💰","🪄","🛡️","🎪",
];

export const FUTURES_INSTRUMENTS = [
  { code: "ES",  label: "E-mini S&P 500"  },
  { code: "NQ",  label: "E-mini Nasdaq"   },
  { code: "MES", label: "Micro S&P 500"   },
  { code: "MNQ", label: "Micro Nasdaq"    },
  { code: "YM",  label: "E-mini Dow"      },
  { code: "RTY", label: "E-mini Russell"  },
  { code: "CL",  label: "Crude Oil"       },
  { code: "GC",  label: "Gold"            },
  { code: "SI",  label: "Silver"          },
  { code: "NG",  label: "Natural Gas"     },
  { code: "ZB",  label: "T-Bond"          },
  { code: "6E",  label: "Euro FX"         },
];

export interface OnboardingData {
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  twitter: string;
  instruments: string[];
  strategy: string;
}

const TOUR_STEPS = [
  {
    icon: "+",
    title: "Log your first trade",
    body: "Hit LOG to record any trade in seconds — P&L, R-multiple, screenshot, notes.",
    highlight: "log",
  },
  {
    icon: "↗",
    title: "Track your edge",
    body: "STATS breaks down your win rate, average R, and equity curve so you know exactly what's working.",
    highlight: "stats",
  },
  {
    icon: "◆",
    title: "Compete in circles",
    body: "Join or create a Trading Circle to share trades, climb the leaderboard, and stay accountable.",
    highlight: "circles",
  },
];

// ─── TOUR OVERLAY ─────────────────────────────────────────────────────────────
export function TourOverlay({ C, onDone }: { C: any; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  function finish() {
    try { localStorage.setItem("tradr_tour_done", "1"); } catch {}
    onDone();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={finish}>
      <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "480px", padding: "32px 28px calc(40px + env(safe-area-inset-bottom))" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "28px" }}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? "20px" : "6px", height: "6px", borderRadius: "3px", background: i === step ? C.text : C.border2, transition: "all 0.2s ease" }} />
          ))}
        </div>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: C.panel, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px", fontFamily: "system-ui, sans-serif", fontSize: "22px" }}>
          {current.icon}
        </div>
        <div style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", marginBottom: "10px" }}>
          {current.title}
        </div>
        <div style={{ fontFamily: "var(--font-body, system-ui, sans-serif)", fontSize: "14px", color: C.muted, lineHeight: 1.6, marginBottom: "32px" }}>
          {current.body}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={finish}
            style={{ flex: 1, padding: "13px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "10px", color: C.muted, cursor: "pointer", fontFamily: "var(--font-mono, monospace)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Skip
          </button>
          <button onClick={() => isLast ? finish() : setStep(s => s + 1)}
            style={{ flex: 2, padding: "13px", background: C.text, border: "none", borderRadius: "10px", color: C.bg, cursor: "pointer", fontFamily: "var(--font-mono, monospace)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>
            {isLast ? "Let's go →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING FLOW ──────────────────────────────────────────────────────────
export function OnboardingFlow({ C, allStrategyNames, onComplete }: {
  C: any;
  allStrategyNames: string[];
  onComplete: (data: OnboardingData) => Promise<void>;
}) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameErr, setNameErr] = useState("");

  function onNameChange(v: string) {
    setName(v);
    setNameErr("");
    if (!handleEdited) {
      const slug = v.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_]/g, "");
      setHandle(slug ? `@${slug}` : "");
    }
  }

  function onHandleChange(v: string) {
    setHandleEdited(true);
    const raw = v.startsWith("@") ? v.slice(1) : v;
    const clean = raw.replace(/[^a-z0-9_.]/gi, "").toLowerCase();
    setHandle(clean ? `@${clean}` : "");
  }

  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  function goNext() {
    if (stepIndex < ONBOARDING_STEPS.length - 1) setStep(ONBOARDING_STEPS[stepIndex + 1]);
  }
  function goBack() {
    if (stepIndex > 0) setStep(ONBOARDING_STEPS[stepIndex - 1]);
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    await onComplete({ name, handle, avatar, bio: "", twitter: "", instruments: [], strategy: "" });
    setSaving(false);
  }

  const inp: React.CSSProperties = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${C.border2}`, borderRadius: 0,
    color: C.text, padding: "14px 0", fontSize: "16px",
    fontFamily: BODY, width: "100%", outline: "none", minHeight: "44px",
  };
  const pillPrimary = (active: boolean): React.CSSProperties => ({
    background: active ? C.text : C.border2, color: active ? C.bg : C.muted,
    border: "none", borderRadius: "999px", padding: "16px 32px",
    fontSize: "14px", fontWeight: 500, cursor: active ? "pointer" : "default",
    fontFamily: BODY, letterSpacing: "0.01em",
    width: "100%", transition: "background 0.15s", minHeight: "44px",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  const MonoLbl = ({ children, optional }: { children: string; optional?: boolean }) => (
    <label style={{
      fontFamily: MONO, fontSize: "10px", color: C.muted,
      letterSpacing: "0.14em", textTransform: "uppercase" as const,
      display: "block", marginBottom: "8px",
    }}>
      {children}{optional && <span style={{ color: C.dim, fontSize: "9px", marginLeft: "6px" }}>optional</span>}
    </label>
  );

  const StepBadge = ({ n }: { n: number }) => (
    <div style={{
      fontFamily: MONO, fontSize: "10px", color: C.muted,
      letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: "16px",
    }}>
      — Step {n} of {ONBOARDING_STEPS.length}
    </div>
  );

  const Heading = ({ line1, line2 }: { line1: string; line2: string }) => (
    <h1 style={{
      fontFamily: DISPLAY, fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
      letterSpacing: "-0.03em", lineHeight: 1.05, color: C.text, marginBottom: "12px",
    }}>
      {line1}<br />
      <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>{line2}</span>
    </h1>
  );

  return (
    <div style={{
      minHeight: "100dvh", background: C.bg, color: C.text,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 24px", fontFamily: BODY,
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "48px" }}>
          <TrMark size={28} bg={C.panel} />
          <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 700, letterSpacing: "-0.02em", color: C.text, lineHeight: 1 }}>Kōda</span>
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "44px" }}>
          {ONBOARDING_STEPS.map((s, i) => (
            <div key={s} style={{
              height: "2px", flex: 1, borderRadius: "1px",
              background: stepIndex >= i ? C.text : C.border,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        {step === "welcome" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={1} />
            <Heading line1="Let's set up" line2="your profile." />
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "28px" }}>
              This is how other traders see you on leaderboards and in circles.
            </p>

            <div style={{ marginBottom: "28px" }}>
              <MonoLbl optional>Pick an avatar</MonoLbl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {AVATAR_EMOJIS.map(e => (
                  <button key={e} onClick={() => setAvatar(avatar === e ? "" : e)} style={{
                    width: "42px", height: "42px", borderRadius: "50%",
                    border: `1.5px solid ${avatar === e ? C.text : C.border}`,
                    background: avatar === e ? C.panel : "transparent",
                    cursor: "pointer", fontSize: "20px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "border-color 0.15s, background 0.15s",
                  }}>{e}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "32px" }}>
              <div>
                <MonoLbl>Your name</MonoLbl>
                <input
                  value={name} onChange={e => onNameChange(e.target.value)}
                  placeholder="e.g. Dylon" style={inp} autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) goNext(); }}
                />
                {nameErr && <div style={{ fontSize: "12px", color: C.red, marginTop: "6px" }}>{nameErr}</div>}
              </div>
              <div>
                <MonoLbl optional>Handle</MonoLbl>
                <input
                  value={handle} onChange={e => onHandleChange(e.target.value)}
                  placeholder="@yourhandle" style={inp}
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) goNext(); }}
                />
              </div>
            </div>

            <button onClick={() => { if (!name.trim()) { setNameErr("Name is required."); return; } goNext(); }} style={pillPrimary(!!name.trim())}>
              Continue →
            </button>
          </div>
        )}

        {step === "ready" && (
          <div style={{ animation: "rise 0.3s ease" }}>
            <StepBadge n={2} />
            <h1 style={{
              fontFamily: DISPLAY, fontSize: "clamp(32px, 8vw, 44px)", fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.05, color: C.text, marginBottom: "16px",
            }}>
              You're in,<br />
              <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>{name || "trader"}.</span>
            </h1>
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, marginBottom: "32px" }}>
              Your edge is built one trade at a time. Log your first — the stats follow automatically.
            </p>

            <div style={{
              borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
              padding: "18px 0", marginBottom: "28px",
              display: "flex", flexDirection: "column", gap: "12px",
            }}>
              {avatar && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Avatar</span>
                  <span style={{ fontSize: "22px" }}>{avatar}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Name</span>
                <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text }}>{name}</span>
              </div>
              {handle && handle !== "@" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>Handle</span>
                  <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text }}>{handle}</span>
                </div>
              )}
            </div>

            <button onClick={finish} disabled={saving} style={pillPrimary(!saving)}>
              {saving ? "Setting up…" : "Log my first trade →"}
            </button>
          </div>
        )}

        {step !== "welcome" && (
          <button onClick={goBack} style={{
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: "12px", fontFamily: MONO,
            letterSpacing: "0.1em", textTransform: "uppercase",
            marginTop: "20px", padding: "8px 0",
          }}>
            ← Back
          </button>
        )}

      </div>

      <style>{`@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
