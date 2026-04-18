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
type AuthMode = "signin" | "signup";

// Username → synthetic email so Supabase auth still works.
// Users never see this — they only type their username.
const USERNAME_DOMAIN = "users.tradr.app";
const usernameToEmail = (u: string) => `${u.toLowerCase().trim()}@${USERNAME_DOMAIN}`;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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

  const titles: Record<AuthMode, string> = {
    signin: "SIGN IN", signup: "CREATE ACCOUNT",
  };

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

        {mode === "signup" && (
          <div style={{ fontSize: "12px", color: C.muted, lineHeight: 1.55, marginTop: "4px", fontFamily: BODY }}>
            Beta — no email required. Lost passwords can't be recovered, so pick one you'll remember.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: BODY, maxWidth: "560px", margin: "0 auto", paddingBottom: "80px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Syne:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        input::placeholder{color:${C.dim};font-weight:400;}
        input:focus{border-bottom-color:${C.text}!important;}
        button:hover:not(:disabled){opacity:0.88;}
        button:active:not(:disabled){transform:scale(0.99);}
      `}</style>

      {/* ───────── MASTHEAD ───────── */}
      <header style={{ padding: "28px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline", animation: "rise 0.5s ease" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em", color: C.text }}>
          TRADR<span style={{ color: C.blue }}>.</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.04em" }}>
          BETA / 2026
        </div>
      </header>

      {/* ───────── HERO ───────── */}
      <section style={{ padding: "72px 28px 56px", animation: "rise 0.6s ease 0.05s both" }}>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", marginBottom: "28px" }}>
          — A TRADING JOURNAL FOR TRADERS WHO INTEND TO IMPROVE.
        </div>

        <h1 style={{
          fontFamily: DISPLAY,
          fontSize: "clamp(48px, 13vw, 84px)",
          fontWeight: 700,
          letterSpacing: "-0.035em",
          lineHeight: 0.92,
          color: C.text,
          marginBottom: "28px",
        }}>
          Keep the<br />
          <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>trades</span> that<br />
          keep working.
        </h1>

        <p style={{ fontSize: "16px", color: C.text2, lineHeight: 1.55, maxWidth: "460px", fontWeight: 400 }}>
          Log every trade. See the patterns. Hold yourself to a checklist.
          Trade alongside a small circle that cares about the same things you do.
        </p>
      </section>

      {/* ───────── AUTH ───────── */}
      <section style={{ padding: "0 28px", animation: "rise 0.6s ease 0.1s both" }}>
        <AuthForm onSuccess={onSuccess} />
      </section>

      {/* ───────── PRINCIPLES ───────── */}
      <section style={{ padding: "24px 28px 0", animation: "rise 0.6s ease 0.15s both" }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "28px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
          WHAT'S INSIDE
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {PRINCIPLES.map((p, i) => (
            <div key={p.kicker} style={{
              display: "grid",
              gridTemplateColumns: "42px 1fr",
              gap: "16px",
              padding: "28px 0",
              borderTop: i === 0 ? `1px solid ${C.border}` : "none",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.04em", paddingTop: "6px" }}>
                {p.kicker}
              </div>
              <div>
                <h3 style={{
                  fontFamily: DISPLAY,
                  fontSize: "22px",
                  fontWeight: 500,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.15,
                  color: C.text,
                  marginBottom: "8px",
                }}>
                  {p.title}
                </h3>
                <p style={{ fontSize: "14px", color: C.text2, lineHeight: 1.55, fontWeight: 400 }}>
                  {p.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── STRATEGIES ───────── */}
      <section style={{ padding: "48px 28px 0" }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
          BUILT-IN STRATEGIES
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.35 }}>
          <span>ICT / Smart Money</span>
          <span style={{ color: C.dim }}>·</span>
          <span>Supply &amp; Demand</span>
          <span style={{ color: C.dim }}>·</span>
          <span>Wyckoff / VSA</span>
          <span style={{ color: C.dim }}>·</span>
          <span>Opening Range Breakout</span>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer style={{ padding: "72px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: MONO, fontSize: "10px", color: C.dim, letterSpacing: "0.06em" }}>
        <span>TRADR · KEEP THE EDGE YOU EARNED.</span>
        <span>v0.1</span>
      </footer>
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
