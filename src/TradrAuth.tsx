import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { installStorage, clearStorageCache } from "./lib/storage";
import type { Session } from "@supabase/supabase-js";
import Tradr from "./TRADR";

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#080808", panel: "#0f0f0f", panel2: "#141414",
  border: "#1e1e1e", border2: "#2a2a2a",
  text: "#e5e5e5", text2: "#a0a0a0", muted: "#6b7280", dim: "#3a3a3a",
  accent: "#89cff0", gold: "#f59e0b",
  green: "#22c55e", red: "#ef4444",
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: "#0a0a0a", border: `1px solid ${C.border2}`, borderRadius: "8px",
  color: C.text, padding: "12px 14px", fontSize: "13px", width: "100%",
  outline: "none", fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box",
};
const btn = (primary = false): React.CSSProperties => ({
  background: primary ? C.accent : "transparent",
  color: primary ? "#000" : C.accent,
  border: `1px solid ${C.accent}`,
  borderRadius: "10px", padding: "14px", fontSize: "12px",
  fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
  fontFamily: "'IBM Plex Mono', monospace", width: "100%",
  transition: "all 0.15s",
});
const lbl: React.CSSProperties = {
  fontSize: "9px", color: C.muted, letterSpacing: "0.12em",
  textTransform: "uppercase", marginBottom: "5px", display: "block", fontWeight: 700,
};

// ─── TICKER ───────────────────────────────────────────────────────────────────
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "US30", "GBPJPY", "AUDUSD", "USDCAD"];
function Ticker() {
  const [vals] = useState(() =>
    PAIRS.map(p => ({ pair: p, v: (Math.random() * 0.6 - 0.3).toFixed(2) }))
  );
  return (
    <div style={{ overflow: "hidden", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "8px 0", marginBottom: "40px" }}>
      <div style={{ display: "flex", gap: "32px", animation: "ticker 22s linear infinite", whiteSpace: "nowrap" }}>
        {[...vals, ...vals].map((item, i) => (
          <span key={i} style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: parseFloat(item.v) >= 0 ? C.green : C.red }}>
            {item.pair} <span style={{ opacity: 0.5 }}>{parseFloat(item.v) >= 0 ? "+" : ""}{item.v}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── FEATURE CARDS ────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: "📊", title: "Trade Journal", desc: "Log every trade with entry, SL, TP, session and emotional state." },
  { icon: "🧠", title: "AI Insights", desc: "Rule-based pattern detection finds your weaknesses automatically." },
  { icon: "✅", title: "Pre-Trade Check", desc: "Strategy-specific checklists so you only enter high-probability trades." },
  { icon: "👥", title: "Circles & Feed", desc: "Share trades with friends and compete on leaderboards." },
  { icon: "📈", title: "Performance Stats", desc: "Win rate, avg R:R, session breakdowns and monthly P&L charts." },
  { icon: "📅", title: "Calendar View", desc: "Visualise profitable days and identify your best trading windows." },
];

function FeatureGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "40px" }}>
      {FEATURES.map(f => (
        <div key={f.title} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 14px" }}>
          <div style={{ fontSize: "22px", marginBottom: "8px" }}>{f.icon}</div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.text, marginBottom: "5px", letterSpacing: "0.04em" }}>{f.title.toUpperCase()}</div>
          <div style={{ fontSize: "10px", color: C.muted, lineHeight: 1.6 }}>{f.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ─── STATS STRIP ──────────────────────────────────────────────────────────────
const STATS = [{ label: "Strategies", value: "4" }, { label: "Setups", value: "40+" }, { label: "Data Points", value: "15" }, { label: "Charts", value: "6" }];
function StatsStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "40px" }}>
      {STATS.map(s => (
        <div key={s.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "22px", fontWeight: 700, color: C.accent, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.1em", marginTop: "4px" }}>{s.label.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MINI SPARKLINE DEMO ──────────────────────────────────────────────────────
function DemoChart() {
  const pts = [0, 1.2, 0.8, 2.4, 1.9, 3.1, 2.7, 4.2, 3.8, 5.1];
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min;
  const W = 300, H = 60, PAD = 6;
  const cx = (x: number) => PAD + (x / (pts.length - 1)) * (W - PAD * 2);
  const cy = (y: number) => H - PAD - ((y - min) / range) * (H - PAD * 2);
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i)},${cy(p)}`).join(" ");
  const areaD = `${pathD} L${cx(pts.length - 1)},${H - PAD} L${cx(0)},${H - PAD} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.green} stopOpacity="0.25" />
          <stop offset="100%" stopColor={C.green} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#dg)" />
      <path d={pathD} fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={cx(pts.length - 1)} cy={cy(pts[pts.length - 1])} r="4" fill={C.green} />
    </svg>
  );
}

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
    <div style={{ background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "28px 24px", marginBottom: "32px" }}>
      <div style={{ display: "flex", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
        {(["signin", "signup"] as AuthMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(""); setMsg(""); }}
            style={{ flex: 1, padding: "10px", background: mode === m ? "#1e1e1e" : "none", border: "none", borderBottom: mode === m ? `2px solid ${C.accent}` : "2px solid transparent", color: mode === m ? C.accent : C.muted, fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.15s" }}>
            {m === "signin" ? "SIGN IN" : "SIGN UP"}
          </button>
        ))}
      </div>

      <div style={{ fontSize: "10px", color: C.accent, letterSpacing: "0.14em", fontWeight: 700, marginBottom: "20px" }}>{titles[mode]}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={lbl}>Username</label>
          <input type="text" value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder={mode === "signup" ? "pick a handle (3-20 chars)" : "yourname"}
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
          <div style={{ background: "#200a0a", border: `1px solid #7f1d1d`, borderRadius: "8px", padding: "10px 12px", fontSize: "11px", color: C.red }}>
            {error}
          </div>
        )}
        {msg && (
          <div style={{ background: "#0a2018", border: `1px solid #14532d`, borderRadius: "8px", padding: "10px 12px", fontSize: "11px", color: C.green }}>
            {msg}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={btn(true)}>
          {loading ? "..." : titles[mode]}
        </button>

        {mode === "signup" && (
          <div style={{ fontSize: "9px", color: C.muted, textAlign: "center", lineHeight: 1.5, marginTop: "4px" }}>
            Beta access. No email required. Lost passwords can't be recovered — pick something you'll remember.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'IBM Plex Mono', monospace", maxWidth: "480px", margin: "0 auto", paddingBottom: "60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        input::placeholder{color:${C.dim};}
        input:focus{border-color:${C.accent}!important;}
      `}</style>

      <div style={{ padding: "48px 24px 32px", animation: "fadeIn 0.5s ease" }}>
        <div style={{ fontSize: "9px", color: C.accent, letterSpacing: "0.3em", fontWeight: 700, marginBottom: "12px" }}>
          MULTI-STRATEGY TRADING JOURNAL
        </div>
        <div style={{ fontSize: "52px", fontWeight: 700, color: "#fff", letterSpacing: "-0.03em", lineHeight: 0.95, marginBottom: "20px" }}>
          TRADR
        </div>
        <div style={{ fontSize: "12px", color: C.muted, lineHeight: 1.7, maxWidth: "320px", marginBottom: "32px" }}>
          Track, analyse and sharpen your edge across ICT, Supply & Demand, Wyckoff and ORB strategies.
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px 18px", marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "8px", color: C.muted, letterSpacing: "0.14em" }}>CUMULATIVE P&L</div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: C.green, lineHeight: 1 }}>+5.10R</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "9px", color: C.muted }}>WIN RATE</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: C.accent }}>68%</div>
            </div>
          </div>
          <DemoChart />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
            {[["10 TRADES", C.muted], ["7W · 3L", C.muted], ["2.3R AVG", C.accent], ["4W STREAK", C.green]].map(([label, color]) => (
              <span key={label as string} style={{ fontSize: "9px", color: color as string, fontWeight: 700 }}>{label as string}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ paddingLeft: "24px", paddingRight: "24px" }}>
        <Ticker />
      </div>

      <div style={{ padding: "0 24px" }}>
        <AuthForm onSuccess={onSuccess} />
      </div>

      <div style={{ padding: "0 24px" }}>
        <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>WHAT'S INSIDE</div>
        <StatsStrip />
        <FeatureGrid />

        <div style={{ marginBottom: "40px" }}>
          <div style={{ fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "12px" }}>SUPPORTED STRATEGIES</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { name: "ICT / Smart Money", color: "#89cff0" },
              { name: "Supply & Demand", color: "#a78bfa" },
              { name: "Wyckoff / VSA", color: "#34d399" },
              { name: "ORB", color: "#fb923c" },
            ].map(s => (
              <div key={s.name} style={{ background: `${s.color}12`, border: `1px solid ${s.color}35`, borderRadius: "20px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.color }} />
                <span style={{ fontSize: "10px", color: s.color, fontWeight: 700 }}>{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: "9px", color: C.dim, letterSpacing: "0.1em" }}>
          TRADR · YOUR DATA, YOUR EDGE
        </div>
      </div>
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "32px", fontWeight: 700, color: C.accent, letterSpacing: "0.12em", marginBottom: "12px" }}>TRADR</div>
        <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "0.2em" }}>LOADING...</div>
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
