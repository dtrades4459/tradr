import { storage } from "./lib/storage";
import { useState, useEffect, useMemo } from "react";
import { MONO, BODY, DISPLAY, AvatarCircle } from "./shared";

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
        const handleRow = await storage.get(`tradr_handle_${norm}`, true);
        if (handleRow) {
          try { code = JSON.parse(handleRow.value)?.code || null; } catch {}
          if (!code) code = handleRow.owner_id || null;
          setTargetCode(code);
        }
        const profileRow = await storage.get(`tradr_profile_pub_${norm}`, true);
        if (profileRow) {
          const p = JSON.parse(profileRow.value);
          setPubProfile(p);
          if (p.publicTrades && code) {
            const feedRow = await storage.get(`tradr_feed_${code}`, true);
            if (feedRow) {
              try { const t = JSON.parse(feedRow.value); setFeedTrades(Array.isArray(t) ? t : []); } catch {}
            }
          }
        } else if (code) {
          const feedRow = await storage.get(`tradr_feed_${code}`, true);
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
    const wins = feedTrades.filter((t: any) => t.outcome === "Win" || parseFloat(t.pnl) > 0).length;
    const total = feedTrades.length;
    const winRate = total > 0 ? (wins / total * 100) : 0;
    const totalPnL = feedTrades.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);
    const rrVals = feedTrades.map((t: any) => parseFloat(t.rr)).filter((v: number) => !isNaN(v) && v > 0);
    const avgR = rrVals.length > 0 ? rrVals.reduce((a: number, b: number) => a + b, 0) / rrVals.length : null;
    return { wins, total, winRate, totalPnL, avgR };
  }, [feedTrades]);

  const isMe = targetCode === myCode;
  const isFollowing = targetCode ? (following || []).includes(targetCode) : false;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto", padding: "10px 24px 48px" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 24px" }} />

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading profile…</div>
        ) : !pubProfile ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontStyle: "italic", color: C.text2, fontWeight: 500, marginBottom: "8px" }}>Profile not found</div>
            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted }}>This trader hasn't published their profile yet.</div>
          </div>
        ) : (<>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <AvatarCircle name={pubProfile.name} avatar={pubProfile.avatar} size={60} C={C} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{pubProfile.name}</div>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.06em", marginTop: "3px" }}>@{pubProfile.handle?.replace(/^@/, "")}</div>
            </div>
            {!isMe && targetCode && (
              <button
                onClick={() => isFollowing ? unfollowUser(targetCode) : followUser(targetCode)}
                style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "9px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
                {isFollowing ? "✓ Following" : "+ Follow"}
              </button>
            )}
            {isMe && <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>YOU</span>}
          </div>

          {pubProfile.bio && (
            <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.65, marginBottom: "22px", paddingBottom: "22px", borderBottom: `1px solid ${C.border}` }}>
              {pubProfile.bio}
            </div>
          )}

          {stats && stats.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "24px" }}>
              {[
                { label: "TOTAL P&L", value: `${stats.totalPnL >= 0 ? "+" : ""}${stats.totalPnL.toFixed(1)}R`, color: stats.totalPnL >= 0 ? C.green : C.red },
                { label: "WIN RATE", value: `${stats.winRate.toFixed(0)}%`, color: stats.winRate >= 50 ? C.green : C.red },
                { label: "AVG R", value: stats.avgR ? `${stats.avgR.toFixed(1)}R` : "—", color: C.text },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center", padding: "14px 8px", background: C.panel, borderRadius: "10px" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: s.color, letterSpacing: "-0.01em" }}>{s.value}</div>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginTop: "4px" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {pubProfile.publicTrades && feedTrades.length > 0 && (<>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "12px" }}>TRADES · {feedTrades.length}</div>
            {feedTrades.slice(0, 25).map((t: any, i: number) => {
              const pos = parseFloat(t.pnl) >= 0;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{t.pair || "—"}</div>
                    <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{t.date}{t.strategy ? ` · ${t.strategy}` : ""}</div>
                  </div>
                  {t.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2 }}>{t.rr}R</span>}
                  {t.pnl !== undefined && <span style={{ fontFamily: MONO, fontSize: "12px", color: pos ? C.green : C.red }}>{pos ? "+" : ""}{t.pnl}R</span>}
                </div>
              );
            })}
          </>)}

          {pubProfile.publicTrades && feedTrades.length === 0 && (
            <div style={{ padding: "20px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>No published trades yet.</div>
          )}

          {!pubProfile.publicTrades && (
            <div style={{ padding: "16px", background: C.panel, borderRadius: "10px", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted }}>
              This trader's trades are private.
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
