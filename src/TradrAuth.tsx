import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { installStorage, clearStorageCache } from "./lib/storage";
import type { Session } from "@supabase/supabase-js";
import Tradr from "./TRADR";

// ─── THEME ────────────────────────────────────────────────────────────────────
// Warm editorial palette, inspired by dvdrod.com + oddritualgolf.com.
const C = {
  bg: "#0C0C0B",        // warm near-black
  panel: "#161614",     // warm surface
  panel2: "#1E1E1B",    // warm raised surface
  border: "#2A2A26",    // hairline
  border2: "#3A3A34",   // focused hairline
  text: "#EDEDE8",      // warm off-white
  text2: "#BCBCB4",     // warm mid
  muted: "#8A8A82",     // warm muted
  dim: "#55554F",       // warm dim
  accent: "#EDEDE8",    // primary CTA (text-colored — stark/editorial)
  blue: "#89cff0",      // TRADR brand accent (used sparingly)
  green: "#00C96B",     // gain
  red: "#FF3D00",       // loss
};

const DISPLAY = "'Syne', 'Inter', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// ─── STYLES ───────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: `1px solid ${C.border2}`,
  borderRadius: 0,
  color: C.text,
  padding: "12px 0",
  fontSize: "16px", // 16px prevents iOS zoom-on-focus
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
  fontSize: "11px",
  color: C.muted,
  letterSpacing: "0.02em",
  marginBottom: "6px",
  display: "block",
  fontWeight: 400,
  fontFamily: BODY,
};

// ─── PRINCIPLE LIST ───────────────────────────────────────────────────────────
// Replaces the old emoji "features" grid. Short, specific, no marketing.
const PRINCIPLES: { kicker: string; title: string; body: string }[] = [
  { kicker: "01",  title: "A journal, not a feed.",
    body: "Log every trade with entry, stop, target, session, and the emotion behind the click. Your patterns show up whether you want them to or not." },
  { kicker: "02", title: "Circles, not followers.",
    body: "Trade alongside a few people who actually take it seriously. Shared leaderboards, no influencers, no signals shop." },
  { kicker: "03", title: "Rules before entries.",
    body: "Strategy checklists for ICT, Supply & Demand, Wyckoff and ORB. If your setup doesn't pass, you don't take the trade." },
  { kicker: "04", title: "Your data stays yours.",
    body: "Synced across your phone and laptop. Export any time. No ads, no resold metadata." },
];

// ─── AUTH FORM ────────────────────────────────────────────────────────────────
type AuthMode = "signin" | "signup" | "reset" | "reset-sent" | "new-password";

// Username → synthetic email so Supabase auth still works.
// Users never see this — they only type their username.
const USERNAME_DOMAIN = "users.tradr.app";
const usernameToEmail = (u: string) => `${u.toLowerCase().trim()}@${USERNAME_DOMAIN}`;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // If user arrives via a password-reset magic link, Supabase fires a
  // PASSWORD_RECOVERY event — switch to the new-password form automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("new-password");
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    const u = username.toLowerCase().trim();
    if (!u || !password) return;
    if (!USERNAME_RE.test(u)) {
      setError("Username must be 3–20 chars, lowercase letters, numbers, or underscores only.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
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
          options: { data: { username: u } },
        });
        if (e) throw e;
        // If confirmation is OFF in Supabase, this signs them in immediately.
        // If confirmation is ON, they'll need to try signing in after.
        onSuccess();
      }
    } catch (e: any) {
      // Supabase throws "Invalid login credentials" for wrong password OR user not found.
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
      // resetPasswordForEmail sends a magic link to the synthetic email address.
      const { error: e } = await supabase.auth.resetPasswordForEmail(usernameToEmail(u), {
        // redirectTo must match an allowed redirect URL in your Supabase project settings.
        redirectTo: window.location.origin,
      });
      if (e) throw e;
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

  // ── Reset-sent confirmation screen ────────────────────────────────
  if (mode === "reset-sent") {
    return (
      <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.green, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
          — Link sent
        </div>
        <p style={{ fontSize: "14px", color: C.text2, lineHeight: 1.65, marginBottom: "20px", fontFamily: BODY }}>
          Check the inbox linked to your username. Click the link in the email, then come back here to set a new password.
        </p>
        <button onClick={() => { setMode("signin"); setUsername(""); setError(""); }} style={{ ...btn(false) }}>
          Back to sign in
        </button>
      </div>
    );
  }

  // ── New-password screen (after clicking the magic link) ───────────
  if (mode === "new-password") {
    return (
      <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "20px" }}>
          — Set new password
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={lbl}>New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNewPassword()}
              placeholder="min. 6 characters"
              style={inp}
              autoComplete="new-password" />
          </div>
          {error && <div style={{ fontSize: "13px", color: C.red, fontFamily: BODY }}>{error}</div>}
          <button onClick={handleNewPassword} disabled={loading} style={{ ...btn(true), marginTop: "8px" }}>
            {loading ? "…" : "Update password →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Password reset request screen ─────────────────────────────────
  if (mode === "reset") {
    return (
      <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "20px" }}>
          — Reset password
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={lbl}>Username</label>
            <input type="text" value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              onKeyDown={e => e.key === "Enter" && handleReset()}
              placeholder="yourname"
              style={inp}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false} />
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

  // ── Main sign-in / sign-up form ───────────────────────────────────
  return (
    <div style={{ padding: "28px 0 8px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      {/* Mode toggle — text link pair, no pill */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "24px", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em" }}>
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
            style={inp}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false} />
        </div>

        <div>
          <label style={lbl}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder={mode === "signup" ? "min. 6 characters" : "••••••••"}
            style={inp}
            autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        </div>

        {error && (
          <div style={{ fontSize: "13px", color: C.red, marginTop: "4px", fontFamily: BODY }}>
            {error}
          </div>
        )}
        {msg && (
          <div style={{ fontSize: "13px", color: C.green, marginTop: "4px", fontFamily: BODY }}>
            {msg}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{ ...btn(true), marginTop: "8px" }}>
          {loading ? "…" : mode === "signin" ? "Sign in →" : "Create account →"}
        </button>

        {mode === "signin" && (
          <button onClick={() => { setMode("reset"); setError(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "12px", cursor: "pointer", fontFamily: BODY, textAlign: "left", padding: 0, marginTop: "2px" }}>
            Forgot password?
          </button>
        )}

        {mode === "signup" && (
          <div style={{ fontSize: "12px", color: C.muted, lineHeight: 1.55, marginTop: "4px", fontFamily: BODY }}>
            Beta — no email required. Keep a copy of your password somewhere safe.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div className="tradr-landing" style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: BODY }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .tradr-landing input::placeholder{color:${C.dim};font-weight:400;}
        .tradr-landing input:focus{border-bottom-color:${C.text}!important;}
        .tradr-landing button:hover:not(:disabled){opacity:0.88;}
        .tradr-landing button:active:not(:disabled){transform:scale(0.99);}

        /* Layout shell — mobile-first, expands on desktop */
        .tradr-shell{
          max-width:1440px;margin:0 auto;
          padding:24px 24px 80px;
        }
        .tradr-grid{
          display:grid;grid-template-columns:1fr;gap:56px;
          margin-top:56px;
        }
        @media (min-width:900px){
          .tradr-shell{padding:36px 56px 96px;}
          .tradr-grid{
            grid-template-columns:minmax(0,1.35fr) minmax(340px,460px);
            gap:80px;
            margin-top:96px;
            align-items:start;
          }
          .tradr-auth-card{position:sticky;top:36px;}
        }
        @media (min-width:1280px){
          .tradr-shell{padding:44px 88px 120px;}
          .tradr-grid{gap:128px;}
        }

        /* Principles — 1-col mobile, 2-col desktop */
        .tradr-principles{display:grid;grid-template-columns:1fr;border-top:1px solid ${C.border};}
        @media (min-width:900px){.tradr-principles{grid-template-columns:1fr 1fr;}}
        .tradr-principle{padding:32px 0;border-bottom:1px solid ${C.border};}
        @media (min-width:900px){
          .tradr-principle{padding:36px 40px 36px 0;}
          .tradr-principle:nth-child(odd){border-right:1px solid ${C.border};}
          .tradr-principle:nth-child(even){padding-left:40px;padding-right:0;}
        }
      `}</style>

      <div className="tradr-shell" style={{ animation: "rise 0.5s ease" }}>

        {/* ───────── MASTHEAD ───────── */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 700, letterSpacing: "-0.01em", color: C.text }}>
            TRADR<span style={{ color: C.blue }}>.</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.04em" }}>
            BETA / 2026
          </div>
        </header>

        {/* ───────── TOP GRID: HERO + AUTH ───────── */}
        <div className="tradr-grid">

          {/* Hero column */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: "12px", color: C.muted, letterSpacing: "0.06em", marginBottom: "36px", textTransform: "uppercase" }}>
              — A trading journal for traders who intend to improve.
            </div>

            <h1 style={{
              fontFamily: DISPLAY,
              fontSize: "clamp(52px, 9vw, 128px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              color: C.text,
              marginBottom: "36px",
            }}>
              Keep the<br />
              <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>trades</span> that<br />
              keep working.
            </h1>

            <p style={{ fontSize: "clamp(15px, 1.4vw, 18px)", color: C.text2, lineHeight: 1.55, maxWidth: "540px", fontWeight: 400 }}>
              Log every trade. See the patterns. Hold yourself to a checklist.
              Trade alongside a small circle that cares about the same things you do.
            </p>
          </div>

          {/* Auth column */}
          <aside className="tradr-auth-card">
            <AuthForm onSuccess={onSuccess} />
          </aside>
        </div>

        {/* ───────── PRINCIPLES ───────── */}
        <section style={{ marginTop: "clamp(80px, 10vw, 128px)" }}>
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "0 0 32px", height: "1px", background: C.border2 }} />
            WHAT'S INSIDE
          </div>

          <div className="tradr-principles">
            {PRINCIPLES.map((p) => (
              <div key={p.kicker} className="tradr-principle">
                <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "12px" }}>
                  <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.04em" }}>
                    {p.kicker}
                  </span>
                  <span style={{ flex: 1, height: "1px", background: C.border, opacity: 0.6 }} />
                </div>
                <h3 style={{
                  fontFamily: DISPLAY,
                  fontSize: "clamp(22px, 2.4vw, 30px)",
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: C.text,
                  marginBottom: "12px",
                }}>
                  {p.title}
                </h3>
                <p style={{ fontSize: "15px", color: C.text2, lineHeight: 1.55, fontWeight: 400, maxWidth: "48ch" }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ───────── STRATEGIES ───────── */}
        <section style={{ marginTop: "clamp(64px, 8vw, 112px)" }}>
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "0 0 32px", height: "1px", background: C.border2 }} />
            BUILT-IN STRATEGIES
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: "clamp(22px, 3vw, 38px)", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
            ICT / Smart Money <span style={{ color: C.dim }}> · </span>
            Supply &amp; Demand <span style={{ color: C.dim }}> · </span>
            Wyckoff / VSA <span style={{ color: C.dim }}> · </span>
            <span style={{ color: C.text2, fontStyle: "italic" }}>Opening Range Breakout</span>
          </div>
        </section>

        {/* ───────── FOOTER ───────── */}
        <footer style={{ marginTop: "clamp(80px, 10vw, 128px)", paddingTop: "28px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px", fontFamily: MONO, fontSize: "11px", color: C.dim, letterSpacing: "0.06em" }}>
          <span>TRADR · KEEP THE EDGE YOU EARNED.</span>
          <span>v0.1 / {new Date().getFullYear()}</span>
        </footer>

      </div>
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: BODY }}>
      <div style={{ fontFamily: DISPLAY, fontSize: "32px", fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>
        TRADR<span style={{ color: C.blue }}>.</span>
      </div>
    </div>
  );
}

// ─── ROOT AUTH WRAPPER ────────────────────────────────────────────────────────
export default function TradrAuth() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <LandingPage onSuccess={() => {}} />;
  return <Tradr user={session.user} />;
}
