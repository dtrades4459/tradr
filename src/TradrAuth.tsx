import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { installStorage, clearStorageCache } from "./lib/storage";
import type { Session } from "@supabase/supabase-js";
import Tradr from "./TRADR";
import { BetaGate, betaEnabled, isBetaUnlocked } from "./BetaGate";

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg:      "#0A0A0B",
  panel:   "#131317",
  panel2:  "#1A1A20",
  border:  "rgba(255,255,255,0.07)",
  border2: "rgba(255,255,255,0.13)",
  text:    "#F2F2EE",
  text2:   "#A6A6A2",
  muted:   "#65655F",
  dim:     "#45453F",
  accent:  "#F2F2EE",
  blue:    "oklch(0.74 0.16 250)",
  green:   "oklch(0.78 0.18 152)",
  red:     "oklch(0.70 0.21 25)",
};
const MINT    = "oklch(0.84 0.14 175)";
const BODY    = "'Geist', 'Inter', system-ui, sans-serif";
const MONO    = "'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace";
const DISPLAY = BODY;

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: `1px solid ${C.border2}`,
  borderRadius: 0,
  color: C.text,
  padding: "12px 0",
  fontSize: "16px",
  width: "100%",
  outline: "none",
  fontFamily: BODY,
  boxSizing: "border-box",
  letterSpacing: "0.01em",
};
const btn = (primary = false): React.CSSProperties => ({
  background: primary ? C.text : "transparent",
  color: primary ? C.bg : C.text,
  border: primary ? "none" : `1px solid ${C.border2}`,
  borderRadius: "999px",
  padding: "14px 20px",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "0.01em",
  cursor: "pointer",
  fontFamily: BODY,
  width: "100%",
  transition: "opacity 0.15s, transform 0.15s",
});
const lbl: React.CSSProperties = {
  fontSize: "10px",
  color: C.muted,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "8px",
  display: "block",
  fontWeight: 400,
  fontFamily: MONO,
};

// ─── TR MARK ─────────────────────────────────────────────────────────────────
function TrMark({ size = 28, bg = C.panel }: { size?: number; bg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <rect width="100" height="100" rx="20" fill={bg}/>
      <text x="50" y="67" textAnchor="middle" fill={C.text}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
        fontWeight="700" fontSize="52" letterSpacing="-2">tr</text>
    </svg>
  );
}

// ─── MANIFESTO PILLARS ────────────────────────────────────────────────────────
const MANIFESTO = [
  { n: "01", word: "Discipline", sub: "the rules you keep when no one's watching",  accent: false },
  { n: "02", word: "Momentum",   sub: "small wins that compound into a streak",      accent: false },
  { n: "03", word: "Progress",   sub: "an edge measurable in R, not feelings",       accent: false },
  { n: "04", word: "Success",    sub: "where you arrive — quieter than you expected", accent: true  },
];

// ─── AUTH FORM ────────────────────────────────────────────────────────────────
type AuthMode = "signin" | "signup" | "reset" | "reset-sent" | "new-password";

const USERNAME_DOMAIN = "users.tradr.app";
const usernameToEmail = (u: string) => `${u.toLowerCase().trim()}@${USERNAME_DOMAIN}`;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function AuthForm({ onSuccess, initialError = "" }: { onSuccess: () => void; initialError?: string }) {
  const [mode,          setMode]          = useState<AuthMode>("signin");
  const [username,      setUsername]      = useState("");
  const [password,      setPassword]      = useState("");
  const [newPassword,   setNewPassword]   = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(initialError);
  const [msg,           setMsg]           = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("new-password");
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    const u = username.toLowerCase().trim();
    if (!u || !password) return;
    if (!USERNAME_RE.test(u)) { setError("Username must be 3–20 chars, lowercase letters, numbers, or underscores only."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError(""); setMsg("");
    try {
      const email = usernameToEmail(u);
      if (mode === "signin") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onSuccess();
      } else {
        const { error: e } = await supabase.auth.signUp({
          email, password,
          options: { data: { username: u, ...(recoveryEmail.trim() ? { recovery_email: recoveryEmail.trim().toLowerCase() } : {}) } },
        });
        if (e) throw e;
        onSuccess();
      }
    } catch (e: any) {
      const raw = e?.message || "Something went wrong.";
      if (raw.toLowerCase().includes("invalid login")) {
        setError("Username or password incorrect.");
      } else if (raw.toLowerCase().includes("already registered")) {
        setError("That username is taken. Try a different one.");
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    const u = username.toLowerCase().trim();
    if (!u) { setError("Enter your username."); return; }
    if (!USERNAME_RE.test(u)) { setError("Invalid username format."); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u }),
      });
      if (!r.ok) throw new Error("Failed to request reset");
      setMode("reset-sent");
    } catch (e: any) {
      setError(e?.message || "Failed to send reset link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword() {
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError("");
    try {
      const { error: e } = await supabase.auth.updateUser({ password: newPassword });
      if (e) throw e;
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Failed to update password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "reset-sent") {
    return (
      <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: "16px" }}>
          — Check your recovery email
        </div>
        <p style={{ fontSize: "14px", color: C.text2, lineHeight: 1.65, marginBottom: "20px", fontFamily: BODY }}>
          If you added a recovery email at signup, your reset link is on its way. Check your inbox and spam folder.
        </p>
        <button onClick={() => { setMode("signin"); setUsername(""); setError(""); }} style={{ ...btn(false) }}>
          Back to sign in
        </button>
      </div>
    );
  }

  if (mode === "new-password") {
    return (
      <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: "20px" }}>
          — Set new password
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={lbl}>New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNewPassword()}
              placeholder="min. 6 characters" style={inp} autoComplete="new-password" />
          </div>
          {error && <div style={{ fontSize: "13px", color: C.red, fontFamily: BODY }}>{error}</div>}
          <button onClick={handleNewPassword} disabled={loading} style={{ ...btn(true), marginTop: "8px" }}>
            {loading ? "…" : "Update password →"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: "20px" }}>
          — Reset password
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={lbl}>Username</label>
            <input type="text" value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              onKeyDown={e => e.key === "Enter" && handleReset()}
              placeholder="yourname" style={inp}
              autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </div>
          {error && <div style={{ fontSize: "13px", color: C.red, fontFamily: BODY }}>{error}</div>}
          <button onClick={handleReset} disabled={loading} style={{ ...btn(true), marginTop: "8px" }}>
            {loading ? "…" : "Send reset link →"}
          </button>
          <button onClick={() => { setMode("signin"); setError(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "12px", cursor: "pointer", fontFamily: BODY, textAlign: "left", padding: 0 }}>
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", gap: "20px", marginBottom: "24px" }}>
        {(["signin", "signup"] as AuthMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(""); setMsg(""); }}
            style={{
              background: "none", border: "none", padding: 0,
              color: mode === m ? C.text : C.muted,
              borderBottom: mode === m ? `1px solid ${C.text}` : "1px solid transparent",
              paddingBottom: "4px",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={lbl}>Username</label>
          <input type="text" value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder={mode === "signup" ? "pick a handle" : "yourname"}
            style={inp} autoComplete="username" autoCapitalize="none" spellCheck={false} />
        </div>

        <div>
          <label style={lbl}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder={mode === "signup" ? "min. 6 characters" : "••••••••"}
            style={inp}
            autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        </div>

        {error && <div style={{ fontSize: "13px", color: C.red, marginTop: "4px", fontFamily: BODY }}>{error}</div>}
        {msg   && <div style={{ fontSize: "13px", color: C.green, marginTop: "4px", fontFamily: BODY }}>{msg}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{ ...btn(true), marginTop: "8px" }}>
          {loading ? "…" : mode === "signin" ? "Sign in →" : "Create account →"}
        </button>

        {mode === "signin" && (
          <button onClick={() => { setMode("reset"); setError(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "12px", cursor: "pointer", fontFamily: BODY, textAlign: "left", padding: 0, marginTop: "2px" }}>
            Forgot password?
          </button>
        )}

        {mode === "signup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={lbl}>Recovery email <span style={{ color: C.dim, textTransform: "none", letterSpacing: 0 }}>(optional — for password reset)</span></label>
            <input type="email" value={recoveryEmail}
              onChange={e => setRecoveryEmail(e.target.value)}
              placeholder="you@example.com" style={inp} autoComplete="email" />
            <div style={{ fontSize: "11px", color: C.dim, marginTop: "2px", fontFamily: BODY }}>
              We never show this publicly.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PARSE OAUTH ERROR FROM URL HASH ─────────────────────────────────────────
function parseOAuthError(): string {
  const hash = window.location.hash.slice(1);
  if (!hash.includes("error=")) return "";
  const params = new URLSearchParams(hash);
  const code = params.get("error") ?? "";
  const desc = params.get("error_description") ?? "";
  history.replaceState(null, "", window.location.pathname + window.location.search);
  if (code === "access_denied" || desc.toLowerCase().includes("cancel")) {
    return "Google sign-in was cancelled. Use your username and password instead.";
  }
  if (desc) return `Sign-in failed: ${desc.replace(/\+/g, " ")}. Please use username and password.`;
  return "Google sign-in isn't available. Please use your username and password.";
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onSuccess }: { onSuccess: () => void }) {
  const [oauthError] = useState(() => parseOAuthError());
  return (
    <div className="tradr-landing" style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: BODY, position: "relative", overflow: "hidden" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes orbDrift{0%,100%{transform:scale(1) translate(0,0)}50%{transform:scale(1.06) translate(20px,-12px)}}

        .tradr-landing input::placeholder{color:${C.dim};font-weight:400;}
        .tradr-landing input:focus{border-bottom-color:${C.text}!important;}
        .tradr-landing button:hover:not(:disabled){opacity:0.85;}
        .tradr-landing button:active:not(:disabled){transform:scale(0.98);}

        .tradr-shell{max-width:1440px;margin:0 auto;padding:24px 24px 80px;position:relative;z-index:1;}
        .tradr-grid{display:grid;grid-template-columns:1fr;gap:56px;margin-top:56px;}

        @media(min-width:900px){
          .tradr-shell{padding:36px 56px 96px;}
          .tradr-grid{grid-template-columns:minmax(0,1.45fr) minmax(320px,440px);gap:80px;margin-top:96px;align-items:start;}
          .tradr-auth-card{position:sticky;top:36px;}
        }
        @media(min-width:1280px){
          .tradr-shell{padding:44px 88px 120px;}
          .tradr-grid{gap:120px;}
        }

        .tradr-strategies{display:grid;grid-template-columns:1fr;border-top:1px solid ${C.border};}
        @media(min-width:900px){.tradr-strategies{grid-template-columns:1fr 1fr;}}
        .tradr-strat-item{padding:28px 0;border-bottom:1px solid ${C.border};}
        @media(min-width:900px){
          .tradr-strat-item{padding:32px 40px 32px 0;}
          .tradr-strat-item:nth-child(odd){border-right:1px solid ${C.border};}
          .tradr-strat-item:nth-child(even){padding-left:40px;padding-right:0;}
        }
      `}</style>

      {/* ── Background orbs ── */}
      <div style={{ position: "absolute", top: -180, left: -180, width: 680, height: 680, borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.55 0.22 252) 0%, transparent 62%)",
        filter: "blur(100px)", opacity: 0.22, animation: "orbDrift 10s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: -80, right: -160, width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, oklch(0.68 0.18 175) 0%, transparent 65%)",
        filter: "blur(90px)", opacity: 0.14, animation: "orbDrift 13s ease-in-out infinite reverse", pointerEvents: "none" }} />

      <div className="tradr-shell" style={{ animation: "rise 0.5s ease" }}>

        {/* ── MASTHEAD ── */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <TrMark size={26} />
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontFamily: BODY, fontSize: "15px", fontWeight: 600, letterSpacing: "0.20em", color: C.text, lineHeight: 1 }}>Kōda</span>
              <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: "9px", letterSpacing: "0.16em", color: C.text, padding: "2px 5px", borderRadius: "4px", border: `1.5px solid ${C.border2}`, lineHeight: 1 }}>OS</span>
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em" }}>BETA / 2026</div>
        </header>

        {/* ── GRID ── */}
        <div className="tradr-grid">

          {/* Hero column */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", marginBottom: "36px", textTransform: "uppercase" }}>
              — A trading journal for traders who intend to improve.
            </div>

            <h1 style={{
              fontFamily: DISPLAY,
              fontSize: "clamp(52px, 9vw, 128px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 0.92,
              color: C.text,
              marginBottom: "32px",
            }}>
              Keep the<br />
              <span style={{ fontStyle: "italic", fontWeight: 400, color: C.text2 }}>trades</span> that<br />
              keep working.
            </h1>

            <p style={{ fontSize: "clamp(15px, 1.4vw, 17px)", color: C.text2, lineHeight: 1.65, maxWidth: "480px", fontWeight: 400, marginBottom: "48px" }}>
              Log every trade. See the patterns. Hold yourself to a checklist.
              Trade alongside a small circle that cares about the same things you do.
            </p>

            {/* Manifesto pillars */}
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {MANIFESTO.map((p) => (
                <div key={p.n} style={{ display: "flex", alignItems: "baseline", gap: "18px", padding: "16px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: "9px", letterSpacing: "0.18em", color: p.accent ? MINT : C.muted, minWidth: "20px", flexShrink: 0 }}>{p.n}</span>
                  <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: p.accent ? 500 : 400, fontSize: "clamp(18px, 2vw, 24px)", letterSpacing: "-0.02em", lineHeight: 1, color: p.accent ? MINT : C.text, textShadow: p.accent ? `0 0 28px ${MINT}40` : "none", flexShrink: 0 }}>{p.word}</span>
                  <span style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "normal", lineHeight: 1.4 }}>— {p.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Auth column */}
          <aside className="tradr-auth-card">
            {oauthError && (
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.red, marginBottom: "16px", padding: "12px 16px", background: "rgba(255,80,60,0.06)", borderRadius: "8px", border: `1px solid rgba(255,80,60,0.15)` }}>
                {oauthError}
              </div>
            )}
            <AuthForm onSuccess={onSuccess} initialError="" />
          </aside>
        </div>

        {/* ── BUILT-IN STRATEGIES ── */}
        <section style={{ marginTop: "clamp(80px, 10vw, 128px)" }}>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "0 0 32px", height: "1px", background: C.border2 }} />
            BUILT-IN STRATEGIES
          </div>
          <div className="tradr-strategies">
            {[
              { n: "01", name: "ICT / Smart Money",       desc: "Order blocks, fair value gaps, liquidity sweeps. Mark your bias before the open." },
              { n: "02", name: "Supply & Demand",          desc: "Fresh zones, base-to-base, institutional imbalances. No stale levels." },
              { n: "03", name: "Wyckoff / VSA",            desc: "Accumulation, distribution, spring and upthrust. Read the auction, not the candle." },
              { n: "04", name: "Opening Range Breakout",   desc: "First 15–30 min range. Clean breakouts with defined risk." },
            ].map((s) => (
              <div key={s.n} className="tradr-strat-item">
                <div style={{ display: "flex", alignItems: "baseline", gap: "14px", marginBottom: "10px" }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em" }}>{s.n}</span>
                  <span style={{ flex: 1, height: "1px", background: C.border }} />
                </div>
                <h3 style={{ fontFamily: DISPLAY, fontSize: "clamp(20px, 2.2vw, 26px)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: C.text, marginBottom: "10px" }}>
                  {s.name}
                </h3>
                <p style={{ fontSize: "14px", color: C.text2, lineHeight: 1.6, fontWeight: 400, maxWidth: "46ch" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ marginTop: "clamp(80px, 10vw, 128px)", paddingTop: "24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", fontFamily: MONO, fontSize: "10px", color: C.dim, letterSpacing: "0.08em" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <TrMark size={18} />
            <span>KŌDA · KEEP THE EDGE YOU EARNED</span>
          </div>
          <span>v0.1 / {new Date().getFullYear()}</span>
        </footer>

      </div>
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
const PULSE_CSS = "@keyframes tradr-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(0.96)}}";

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px" }}>
      <style dangerouslySetInnerHTML={{ __html: PULSE_CSS }} />
      <div style={{ animation: "tradr-pulse 1.8s ease-in-out infinite" }}>
        <TrMark size={80} />
      </div>
    </div>
  );
}

// ─── ROOT AUTH WRAPPER ────────────────────────────────────────────────────────
export default function TradrAuth() {
  const [session,      setSession]      = useState<Session | null | undefined>(undefined);
  const [betaUnlocked, setBetaUnlocked] = useState<boolean>(() => isBetaUnlocked());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      installStorage(data.session?.user?.id ?? null);
      setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "SIGNED_OUT") clearStorageCache();
      installStorage(sess?.user?.id ?? null);
      setSession(sess);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (betaEnabled && !betaUnlocked) return <BetaGate onUnlocked={() => setBetaUnlocked(true)} />;
  if (session === undefined) return <LoadingScreen />;
  if (!session) return <LandingPage onSuccess={() => {}} />;

  const jwtPlan = (session.user.app_metadata?.plan ?? "free") as "free" | "pro" | "elite";
  return <Tradr user={session.user} jwtPlan={jwtPlan} />;
}
