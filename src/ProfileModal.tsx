import { storage } from "./lib/storage";
import type React from "react";
import { useState, useEffect, useMemo } from "react";
import { MONO, BODY, DISPLAY, AvatarCircle, Kicker, GlassOrb } from "./shared";

export function ProfileModal({ handle, myCode, following, followUser, unfollowUser, onClose, C }: any) {
  const [pubProfile, setPubProfile] = useState<any>(null);
  const [feedTrades, setFeedTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetCode, setTargetCode] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const norm = handle.replace(/^@/, "").toLowerCase();
        let code: string | null = null;
        const handleRow = await storage.get(`koda_handle_${norm}`, true);
        if (handleRow) {
          try { code = JSON.parse(handleRow.value)?.code || null; } catch {}
          if (!code) code = (handleRow as any).owner_id || null;
          setTargetCode(code);
        }
        const profileRow = await storage.get(`koda_profile_pub_${norm}`, true);
        if (profileRow) {
          try {
            const p = JSON.parse(profileRow.value);
            if (p) {
              setPubProfile(p);
              if (p.publicTrades && code) {
                const feedRow = await storage.get(`koda_feed_${code}`, true);
                if (feedRow) {
                  try { const t = JSON.parse(feedRow.value); setFeedTrades(Array.isArray(t) ? t : []); } catch {}
                }
              }
            }
          } catch { /* malformed — leave pubProfile null */ }
        } else if (code) {
          const feedRow = await storage.get(`koda_feed_${code}`, true);
          if (feedRow) {
            try {
              const t = JSON.parse(feedRow.value);
              const trades = Array.isArray(t) ? t : [];
              setFeedTrades(trades);
              if (trades.length > 0) {
                const first = trades[0];
                setPubProfile({ name: first.authorName || norm, handle: norm, avatar: first.authorAvatar || "", bio: "", publicTrades: true });
              } else {
                setPubProfile({ name: norm, handle: norm, avatar: "", bio: "", publicTrades: false });
              }
            } catch { setPubProfile({ name: norm, handle: norm, avatar: "", bio: "", publicTrades: false }); }
          } else {
            setPubProfile({ name: norm, handle: norm, avatar: "", bio: "", publicTrades: false });
          }
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [handle]);

  const stats = useMemo(() => {
    if (!feedTrades.length) return null;
    const wins = feedTrades.filter((t) => t.outcome === "Win").length;
    const total = feedTrades.length;
    const winRate = total > 0 ? (wins / total * 100) : 0;
    const totalPnL = feedTrades.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);
    const rrVals = feedTrades.map((t: any) => parseFloat(t.rr)).filter((v: number) => !isNaN(v) && v > 0);
    const avgR = rrVals.length > 0 ? rrVals.reduce((a: number, b: number) => a + b, 0) / rrVals.length : null;
    return { wins, total, winRate, totalPnL, avgR };
  }, [feedTrades]);

  const isMe = targetCode === myCode;
  const isFollowing = targetCode ? (following || []).includes(targetCode) : false;

  const isDark = C.bg === "#0A0A0B";
  const initials = (pubProfile?.name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: C.panel ?? C.bg, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto", padding: "10px 16px 48px", position: "relative", border: `1px solid ${C.border2}`, animation: "kRise 0.42s ease-out" }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <GlassOrb C={C as any} top={-60} left={-80} size={360} color={(C as any).orb1 ?? C.accent} opacity={0.4} />
        {/* Centered bloom */}
        <div style={{ position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)", width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, ${(C as any).orb1 ?? C.accent} 0%, ${(C as any).orb2 ?? C.accent} 40%, transparent 65%)`, filter: "blur(80px)", opacity: isDark ? 0.45 : 0.3, pointerEvents: "none" }} />
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: C.border2, borderRadius: 2, margin: "14px auto 20px", position: "relative", zIndex: 2 }} />

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontFamily: BODY, fontSize: 13, color: C.muted, fontStyle: "italic" }}>Loading profile…</div>
        ) : !pubProfile ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, fontStyle: "italic", color: C.text2, fontWeight: 500, marginBottom: 8 }}>Profile not found</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>This trader hasn't published their profile yet.</div>
          </div>
        ) : (<>
          {/* ── Avatar hero (centered) ── */}
          <div style={{ textAlign: "center", position: "relative", zIndex: 2, padding: "4px 0 0" }}>
            {/* Avatar — gradient orb or AvatarCircle */}
            <div style={{ width: 88, height: 88, borderRadius: 999, margin: "0 auto", background: `linear-gradient(135deg, ${(C as any).orb1 ?? C.accent}, ${(C as any).orb2 ?? C.accent})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, boxShadow: `0 0 0 4px ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}, 0 12px 36px ${(C as any).orb1 ?? C.accent}40`, border: `2px solid ${C.bg}` }}>
              {pubProfile.avatar && pubProfile.avatar.length <= 8 && !pubProfile.avatar.startsWith("http") && !pubProfile.avatar.startsWith("data:") ? (
                <span style={{ fontSize: 40 }}>{pubProfile.avatar}</span>
              ) : pubProfile.avatar && (pubProfile.avatar.startsWith("http") || pubProfile.avatar.startsWith("data:")) ? (
                <img src={pubProfile.avatar} alt="" style={{ width: 88, height: 88, borderRadius: 999, objectFit: "cover" }} />
              ) : initials}
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text, marginTop: 14, letterSpacing: "-0.02em" }}>{pubProfile.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.text2, marginTop: 4 }}>@{pubProfile.handle?.replace(/^@/, "")}</div>
            {pubProfile.bio && (
              <div style={{ fontFamily: BODY, fontSize: 13, color: C.text2, marginTop: 10, lineHeight: 1.5, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>{pubProfile.bio}</div>
            )}

            {/* Follow + label */}
            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "center" }}>
              {!isMe && targetCode && (
                <button onClick={() => isFollowing ? unfollowUser(targetCode) : followUser(targetCode)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: isFollowing ? "8px 8px 8px 18px" : "10px 20px", borderRadius: 999, background: isFollowing ? C.text : "transparent", color: isFollowing ? C.bg : C.text, border: isFollowing ? "none" : `1px solid ${C.border2}`, cursor: "pointer", fontFamily: BODY, fontSize: 13, fontWeight: 600 }}>
                  {isFollowing ? (<>Following<span style={{ width: 22, height: 22, borderRadius: 999, background: (C as any).live ?? C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="#0A0A0A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span></>) : "+ Follow"}
                </button>
              )}
              {isMe && <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.1em", padding: "10px 0" }}>YOU</span>}
            </div>
          </div>

          {/* ── Stats triplet ── */}
          {stats && stats.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "22px 0 0", position: "relative", zIndex: 2 }}>
              {[
                { label: "Trades", value: String(stats.total), sub: "all-time", good: false },
                { label: "Win rate", value: `${stats.winRate.toFixed(0)}%`, sub: stats.winRate >= 50 ? "strong" : "improving", good: stats.winRate >= 50 },
                { label: "Avg R", value: stats.avgR ? `+${stats.avgR.toFixed(1)}` : "—", sub: "per trade", good: !!stats.avgR && stats.avgR > 0 },
              ].map(s => (
                <div key={s.label} style={{ borderRadius: 18, padding: 14, background: C.panel, border: `1px solid ${C.border}`, textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text, marginTop: 6, letterSpacing: "-0.02em" }}>{s.value}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: s.good ? C.green : C.text2, marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Total P&L card ── */}
          {stats && stats.totalPnL !== 0 && (
            <div style={{ marginTop: 14, borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}`, position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>Total P&L</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: stats.totalPnL >= 0 ? C.green : C.red, marginTop: 4, letterSpacing: "-0.02em" }}>{stats.totalPnL >= 0 ? "+" : ""}{stats.totalPnL.toFixed(1)}R</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Instruments pills ── */}
          {pubProfile.instruments && pubProfile.instruments.length > 0 && (
            <div style={{ marginTop: 14, borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}`, position: "relative", zIndex: 2 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>Trades</div>
              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                {pubProfile.instruments.map((s: string) => (
                  <div key={s} style={{ padding: "6px 12px", borderRadius: 999, background: C.accentSoft, border: `1px solid ${C.border2}`, color: C.accent, fontFamily: MONO, fontSize: 11, fontWeight: 600 }}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trades list card ── */}
          {pubProfile.publicTrades && feedTrades.length > 0 && (
            <div style={{ marginTop: 14, borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}`, position: "relative", zIndex: 2 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>Recent trades · {feedTrades.length}</div>
              {feedTrades.slice(0, 25).map((tr, i) => {
                const pos = parseFloat(tr.pnl) >= 0;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < Math.min(feedTrades.length, 25) - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: "0.02em" }}>{tr.pair || "—"}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.06em", marginTop: 2 }}>{tr.date}{tr.strategy ? ` · ${tr.strategy}` : ""}</div>
                    </div>
                    {tr.rr && <span style={{ fontFamily: MONO, fontSize: 11, color: C.text2 }}>{tr.rr}R</span>}
                    {tr.pnl !== undefined && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: pos ? C.green : C.red }}>{pos ? "+" : ""}{tr.pnl}R</span>}
                  </div>
                );
              })}
            </div>
          )}

          {pubProfile.publicTrades && feedTrades.length === 0 && (
            <div style={{ marginTop: 14, padding: 20, textAlign: "center", fontFamily: BODY, fontSize: 13, color: C.muted, fontStyle: "italic", borderRadius: 22, background: C.panel, border: `1px solid ${C.border}` }}>No published trades yet.</div>
          )}

          {!pubProfile.publicTrades && (
            <div style={{ marginTop: 14, padding: 18, background: C.panel, borderRadius: 22, border: `1px solid ${C.border}`, textAlign: "center", fontFamily: BODY, fontSize: 13, color: C.muted, position: "relative", zIndex: 2 }}>
              This trader's trades are private.
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
