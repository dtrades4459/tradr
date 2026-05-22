import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { SectionKicker, StrategyPill, Toast, stratCode, TradrMark, MONO, BODY, DISPLAY } from "./shared";
import { KODA_GLOBAL_CODE } from "./hooks/useCircles";

export function TradingCircles({ myCircles, circlesView, setCirclesView, activeCircle, setActiveCircle, circleForm, setCircleForm, circleJoinCode, setCircleJoinCode, circleMsg, setCircleMsg, createCircle, joinCircle, publishToCircle, fetchCircleLeaderboard, profile, getMyCode, showToast, wins, losses, total, winRate, totalPnL, pnlPos, weekPnL, weekPnLPos, weekPnLStr, avgRR, streak, STRATEGY_NAMES, C, inp, sel, lbl, pillPrimary, pillGhost, following, followUser, unfollowUser, kickMember, leaveCircle, openProfile, isJoiningCircle, isCreatingCircle, totalPnlDollar, hasDollarData }: any) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lbSort, setLbSort] = useState<"all" | "week">("all");
  const [loadingLB, setLoadingLB] = useState(false);
  const [circleTab, setCircleTab] = useState<"leaderboard" | "chat" | "members">("leaderboard");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const CIRCLE_EMOJIS = ["◆","▲","●","■","⬡","◈","△","○","□","✦"];
  const MEDALS = ["🥇","🥈","🥉"];

  // Returns the primary metric label + formatted value for a leaderboard entry
  function metricDisplay(entry: any, circle: any): { val: string; raw: number; label: string } {
    const m = circle?.metric || "dollar";
    if (m === "dollar") { const v = entry.totalPnLDollar || 0; return { val: `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`, raw: v, label: "$ P&L" }; }
    if (m === "r")       { const v = entry.totalPnL || 0; return { val: `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`, raw: v, label: "R P&L" }; }
    if (m === "winrate") { const v = entry.winRate || 0; return { val: `${v.toFixed(0)}%`, raw: v, label: "WIN RATE" }; }
    if (m === "trades")  { const v = entry.total || 0; return { val: `${v}`, raw: v, label: "TRADES" }; }
    if (m === "avgr")    { const v = entry.avgRR || 0; return { val: `${v.toFixed(2)}R`, raw: v, label: "AVG R" }; }
    const v = entry.totalPnLDollar || 0; return { val: `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`, raw: v, label: "$ P&L" };
  }

  // Label for the circle's competition metric
  const METRIC_LABELS: Record<string, string> = { dollar: "$ DOLLAR P&L", r: "R-MULTIPLE", winrate: "WIN RATE", trades: "MOST TRADES", avgr: "AVG R" };

  async function loadChatMessages(circleCode: string) {
    setChatLoading(true);
    try {
      const { data } = await supabase
        .from("circle_messages")
        .select("*")
        .eq("circle_code", circleCode)
        .order("created_at", { ascending: true })
        .limit(100);
      setChatMessages(data || []);
    } catch {}
    setChatLoading(false);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function sendChatMessage(circleCode: string, myId: string) {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    setChatInput("");
    try {
      await supabase.from("circle_messages").insert({
        circle_code: circleCode,
        sender_id: myId,
        sender_name: profile.name || "Trader",
        sender_handle: profile.handle || "",
        text,
      });
    } catch { setChatInput(text); }
    setChatSending(false);
  }

  async function deleteChatMessage(id: string) {
    await supabase.from("circle_messages").delete().eq("id", id);
    setChatMessages(prev => prev.filter((m: any) => m.id !== id));
  }

  function fmtMsgTime(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function openCircle(circle: any) {
    setActiveCircle(circle);
    setCirclesView("detail");
    setExpandedMember(null);
    setCircleTab("leaderboard");
    setChatMessages([]);
    setChatInput("");
    setLoadingLB(true);
    const entries = await fetchCircleLeaderboard(circle);
    setLeaderboard(entries);
    setLoadingLB(false);
  }

  useEffect(() => {
    if (circlesView !== "detail" || !activeCircle) return;
    let alive = true;
    async function refresh() {
      try {
        const entries = await fetchCircleLeaderboard(activeCircle);
        if (alive) setLeaderboard(entries);
      } catch {}
    }
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 120_000);
    let unsub = () => {};
    try { unsub = subscribeToCircle(activeCircle.code, () => { refresh(); }); } catch {}
    const chatChannel = supabase
      .channel(`circle_chat_${activeCircle.code}`)
      .on("postgres_changes" as any, {
        event: "INSERT", schema: "public",
        table: "circle_messages",
        filter: `circle_code=eq.${activeCircle.code}`,
      }, (payload: any) => {
        setChatMessages(prev => prev.some((m: any) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .subscribe();
    return () => {
      alive = false; clearInterval(id);
      try { unsub(); } catch {}
      supabase.removeChannel(chatChannel);
    };
  }, [circlesView, activeCircle, fetchCircleLeaderboard]);

  // ── Derived circle stats ──────────────────────────────────────────────
  const myRank = leaderboard.findIndex((e: any) => e.memberCode === getMyCode()) + 1;
  const leader = leaderboard[0];
  const circleAvgWR = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((s: number, e: any) => s + (e.winRate || 0), 0) / leaderboard.length)
    : 0;
  const circleTotalTrades = leaderboard.reduce((s: number, e: any) => s + (e.total || 0), 0);

  function shareInviteLink(circle: any) {
    const url = `https://tradrjournal.xyz/?join=${circle.code}`;
    const msg = `Join my TRADR circle "${circle.name}" → ${url}`;
    if (navigator.share) {
      navigator.share({ title: "Join my TRADR circle", text: msg, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      showToast("Invite link copied");
    }
  }

  const sortedCircles = [...myCircles].sort((a, b) =>
    a.code === KODA_GLOBAL_CODE ? -1 : b.code === KODA_GLOBAL_CODE ? 1 : 0
  );

  return (
    <div style={{ position: "relative" }}>
      {/* ambient orb */}
      <div style={{ position: "absolute", top: 120, left: -100, width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, ${(C as any).orb2 ?? C.accent} 0%, transparent 65%)`, filter: "blur(60px)", opacity: 0.4, pointerEvents: "none", zIndex: 0 }} />

      {/* ── BROWSE ── */}
      {circlesView === "browse" && (
        <>
          {/* Title */}
          <div style={{ padding: "12px 6px 14px", position: "relative", zIndex: 2 }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Trading circles</div>
            <div style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em", marginTop: "4px", color: C.text }}>
              Compete with <span style={{ fontWeight: 600 }}>your circle</span>
            </div>
          </div>

          {/* Pill tabs */}
          <div style={{ display: "flex", gap: "6px", padding: "0 6px 12px", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
            {["Joined", "Discover"].map((tab, i) => (
              <button key={tab} style={{ padding: "6px 14px", borderRadius: "999px", background: i === 0 ? C.text : "transparent", color: i === 0 ? C.bg : C.text2, border: i === 0 ? `1px solid ${C.text}` : `1px solid ${C.border2}`, fontFamily: BODY, fontSize: "11px", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>{tab}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => setCirclesView("create")} style={{ padding: "6px 14px", borderRadius: "999px", background: "transparent", color: C.text2, border: `1px solid ${C.border2}`, fontFamily: BODY, fontSize: "11px", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>+ New</button>
          </div>

          {sortedCircles.length > 0 ? (
            <>
            {/* Featured / first circle — glass card */}
            {sortedCircles.slice(0, 1).map(circle => (
              <div key={circle.id} onClick={() => openCircle(circle)} style={{ position: "relative", zIndex: 2, cursor: "pointer", borderRadius: "22px", padding: "22px", overflow: "hidden", isolation: "isolate", background: (C as any).surfaceGlass ?? C.panel, backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)", border: `1px solid ${C.border2}` }}>
                {/* corner glow */}
                <div style={{ position: "absolute", top: -60, left: -60, width: 200, height: 200, borderRadius: "50%", background: `conic-gradient(from 200deg at 50% 50%, ${(C as any).orb3 ?? C.green}, ${C.accent}, ${(C as any).orb2 ?? C.accent}, ${(C as any).orb3 ?? C.green})`, filter: "blur(40px)", opacity: 0.4, pointerEvents: "none", zIndex: 0 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 1 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.accent }}>● LIVE · YOUR CIRCLE</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 600, color: C.text, marginTop: "8px", letterSpacing: "-0.02em" }}>{circle.name}</div>
                    <div style={{ fontSize: "12px", color: C.text2, marginTop: "4px", fontFamily: MONO }}>{circle.code} · {circle.members?.length || 1} members</div>
                  </div>
                  {myRank > 0 && (
                    <div style={{ padding: "6px 12px", borderRadius: "999px", background: C.text, color: C.bg, fontSize: "11px", fontWeight: 600, fontFamily: BODY }}>#{myRank}</div>
                  )}
                </div>
                {/* Avatar stack */}
                <div style={{ display: "flex", marginTop: "18px", alignItems: "center", position: "relative", zIndex: 1 }}>
                  {(circle.members || []).slice(0, 5).map((m, i) => (
                    <div key={m.code || i} style={{ width: 34, height: 34, borderRadius: "999px", background: `linear-gradient(135deg, oklch(0.7 0.16 ${200 + i * 30}), oklch(0.5 0.18 ${280 + i * 20}))`, border: `2px solid ${C.bg}`, marginLeft: i === 0 ? 0 : -10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: DISPLAY, fontWeight: 600, fontSize: "10px" }}>{(m.name || "?").slice(0, 2).toUpperCase()}</div>
                  ))}
                  {(circle.members?.length || 0) > 5 && (
                    <div style={{ marginLeft: -10, height: 34, padding: "0 12px", borderRadius: "999px", background: C.panel2, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", color: C.text2, fontSize: "11px", fontFamily: MONO }}>+{(circle.members?.length || 0) - 5}</div>
                  )}
                </div>
              </div>
            ))}

            {/* Other circles list */}
            {sortedCircles.length > 1 && (
            <div style={{ marginTop: "12px", borderRadius: "22px", overflow: "hidden", isolation: "isolate", background: C.panel, border: `1px solid ${C.border}`, position: "relative", zIndex: 2 }}>
              {sortedCircles.slice(1).map((circle, i, arr) => (
                <div key={circle.id} className="row-hvr" onClick={() => openCircle(circle)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 14px", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}`, cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "14px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <TradrMark size={16} color={C.accent} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{circle.name}</div>
                    <div style={{ fontSize: "11px", color: C.text2, marginTop: "2px", fontFamily: MONO }}>{circle.code} · {circle.members?.length || 1} members</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, color: C.text2 }}>
                    {circle.isOwner ? "OWNER" : "›"}
                  </div>
                </div>
              ))}
            </div>
            )}

            {/* Join circle button */}
            <div style={{ marginTop: "12px", display: "flex", gap: "8px", position: "relative", zIndex: 2 }}>
              <button onClick={() => setCirclesView("join")} style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "12px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                ⤵ Join with code
              </button>
            </div>
            </>
          ) : (
            <section style={{ marginTop: "12px", padding: "48px 24px", background: C.panel, borderRadius: "22px", textAlign: "center", border: `1px solid ${C.border}`, position: "relative", zIndex: 2 }}>
              <div style={{ fontFamily: MONO, fontSize: "32px", color: C.border2, marginBottom: "16px", letterSpacing: "-0.02em" }}>◆</div>
              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontStyle: "italic", fontWeight: 500, color: C.text2, letterSpacing: "-0.01em", marginBottom: "8px" }}>No circles yet.</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, marginBottom: "24px" }}>
                Compete with friends, share trades, and build your edge together.
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => setCirclesView("create")} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  + Create circle
                </button>
                <button onClick={() => setCirclesView("join")} style={{ background: "transparent", color: C.text, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  ⤵ Join with code
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── CREATE ── */}
      {circlesView === "create" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setCirclesView("browse")} style={{ width: 36, height: 36, borderRadius: "999px", background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4L6 10l6 6" stroke={C.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Create a circle</div>
          </div>
          <h2 style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: C.text, marginTop: "4px" }}>
            Start <span style={{ fontStyle: "italic", fontWeight: 500, color: C.text2 }}>something small</span>.
          </h2>
          {/* Symbol picker */}
          <div>
            <label style={lbl}>Symbol</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              {CIRCLE_EMOJIS.map(em => {
                const active = (circleForm.emoji || "◆") === em;
                return (
                  <button key={em} onClick={() => setCircleForm((f: any) => ({ ...f, emoji: em }))}
                    style={{ width: "36px", height: "36px", borderRadius: "8px", fontSize: "16px", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: active ? C.text : "transparent", color: active ? C.bg : C.muted, border: `1px solid ${active ? C.text : C.border2}`, transition: "all 100ms", lineHeight: 1 }}>
                    {em}
                  </button>
                );
              })}
            </div>
          </div>
          <div><label style={lbl}>Circle name</label><input value={circleForm.name} onChange={e => setCircleForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. London ICT Traders" style={inp} /></div>
          <div><label style={lbl}>Description (optional)</label><textarea value={circleForm.description} onChange={e => setCircleForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="What's this circle about?" rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
          <div>
            <label style={lbl}>Strategy focus (optional)</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              <button onClick={() => setCircleForm((f: any) => ({ ...f, strategy: "" }))}
                style={{ background: circleForm.strategy === "" ? C.text : "transparent", border: `1px solid ${circleForm.strategy === "" ? C.text : C.border2}`, borderRadius: "999px", padding: "7px 13px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em", color: circleForm.strategy === "" ? C.bg : C.muted, textTransform: "uppercase" }}>
                Any
              </button>
              {STRATEGY_NAMES.map((s: string) => (
                <StrategyPill key={s} name={s} selected={circleForm.strategy === s} onClick={() => setCircleForm((f: any) => ({ ...f, strategy: s }))} C={C} />
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Privacy</label>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {[["public", "● Public"], ["private", "◐ Private"]].map(([val, label]) => (
                <button key={val} onClick={() => setCircleForm((f: any) => ({ ...f, privacy: val }))}
                  style={{ background: circleForm.privacy === val ? C.text : "transparent", border: `1px solid ${circleForm.privacy === val ? C.text : C.border2}`, borderRadius: "999px", padding: "10px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", color: circleForm.privacy === val ? C.bg : C.text, textTransform: "uppercase" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: 1.55 }}>
              {circleForm.privacy === "public" ? "Anyone with the invite code can join." : "Invite only — you share the code."}
            </div>
          </div>
          {/* Competition metric */}
          <div>
            <label style={lbl}>Competition metric</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              {([
                ["dollar", "$ Dollar P&L"],
                ["r",      "R-Multiple"],
                ["winrate","Win Rate"],
                ["trades", "Most Trades"],
                ["avgr",   "Avg R"],
              ] as const).map(([val, label]) => (
                <button key={val} onClick={() => setCircleForm((f: any) => ({ ...f, metric: val }))}
                  style={{ background: (circleForm.metric || "dollar") === val ? C.text : "transparent", border: `1px solid ${(circleForm.metric || "dollar") === val ? C.text : C.border2}`, borderRadius: "999px", padding: "7px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: (circleForm.metric || "dollar") === val ? C.bg : C.muted, textTransform: "uppercase", transition: "all 100ms" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginTop: "8px", lineHeight: 1.55 }}>
              {{
                dollar:  "Leaderboard ranks by total dollar P&L.",
                r:       "Leaderboard ranks by total R gained/lost.",
                winrate: "Leaderboard ranks by win percentage.",
                trades:  "Leaderboard ranks by number of trades logged.",
                avgr:    "Leaderboard ranks by average R per trade.",
              }[circleForm.metric as string] || "Leaderboard ranks by total dollar P&L."}
            </div>
          </div>
          <button onClick={createCircle} disabled={isCreatingCircle || !circleForm.name.trim()} style={{ ...pillPrimary(!!circleForm.name.trim() && !isCreatingCircle), marginTop: "8px" }}>
            {isCreatingCircle ? "Creating…" : "Create circle →"}
          </button>
        </div>
      )}

      {/* ── JOIN ── */}
      {circlesView === "join" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setCirclesView("browse")} style={{ width: 36, height: 36, borderRadius: "999px", background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4L6 10l6 6" stroke={C.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Join a circle</div>
          </div>
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontFamily: MONO, fontSize: "28px", color: C.muted, marginBottom: "20px", letterSpacing: "-0.02em" }}>⤵</div>
            <div style={{ fontFamily: DISPLAY, fontSize: "clamp(28px, 6vw, 38px)", fontWeight: 500, letterSpacing: "-0.02em", color: C.text, marginBottom: "32px", fontStyle: "italic" }}>
              Enter the code.
            </div>
            <input value={circleJoinCode} onChange={e => setCircleJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && joinCircle()}
              placeholder="TRADR-ABCD-EFGH"
              style={{ ...inp, textAlign: "center", fontFamily: MONO, fontSize: "22px", letterSpacing: "0.14em", padding: "16px 0" }} />
            <button onClick={joinCircle} disabled={isJoiningCircle || !circleJoinCode.trim()} style={{ ...pillPrimary(!!circleJoinCode.trim() && !isJoiningCircle), marginTop: "20px" }}>
              {isJoiningCircle ? "Joining…" : "Join →"}
            </button>
            {circleMsg && <div style={{ fontFamily: BODY, fontSize: "13px", color: circleMsg.toLowerCase().includes("joined") ? C.green : C.red, marginTop: "14px" }}>{circleMsg}</div>}
          </div>
          <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.6, textAlign: "center", maxWidth: "32ch", margin: "0 auto" }}>
            Ask the circle owner for their invite link or code, then paste it above.
          </div>
        </div>
      )}

      {/* ── CIRCLE DETAIL ── */}
      {circlesView === "detail" && activeCircle && (
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(24px, 4vw, 36px)" }}>
          {/* Header bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
            <button onClick={() => { setCirclesView("browse"); setActiveCircle(null); setLeaderboard([]); }} style={{ ...pillGhost, padding: "8px 14px" }}>‹ BACK</button>
            {!activeCircle.isOwner && (
              <button onClick={() => { if (window.confirm(`Leave "${activeCircle.name}"? You can rejoin with the code.`)) leaveCircle(activeCircle.code); }}
                style={{ background: "transparent", color: C.muted, border: `0.5px solid ${C.border2}`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Leave
              </button>
            )}
          </div>

          {/* Circle hero */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "16px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "12px", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "28px", color: C.text, flexShrink: 0, border: `1px solid ${C.border2}` }}>
                {activeCircle.emoji || "◆"}
              </div>
              <div>
                <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 8vw, 48px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.95, color: C.text, marginBottom: "6px" }}>
                  {activeCircle.name}
                </h1>
                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {activeCircle.code}
                </div>
              </div>
            </div>
            {activeCircle.description && (
              <div style={{ fontFamily: BODY, fontSize: "14px", color: C.text2, lineHeight: 1.6, maxWidth: "48ch", marginBottom: "16px" }}>{activeCircle.description}</div>
            )}
            {/* Aggregate stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0", background: C.panel, borderRadius: "12px", overflow: "hidden", border: `1px solid ${C.border}` }}>
              {[
                ["MEMBERS", activeCircle.members?.length || 1],
                ["ON BOARD", leaderboard.length || "—"],
                ["TRADES", circleTotalTrades || "—"],
                ["AVG WR", leaderboard.length > 0 ? `${circleAvgWR}%` : "—"],
              ].map(([k, v], i) => (
                <div key={k as string} style={{ padding: "14px 10px", textAlign: "center", borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
                  <div style={{ fontFamily: MONO, fontSize: "8px", color: C.muted, letterSpacing: "0.12em", marginTop: "5px" }}>{k}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Weekly leader callout */}
          {leader && (
            <div style={{ background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.14em", marginBottom: "4px" }}>🏆 {METRIC_LABELS[activeCircle?.metric || "dollar"] || "$ DOLLAR P&L"}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{leader.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 700, color: C.green, letterSpacing: "-0.02em" }}>{metricDisplay(leader, activeCircle).val}</div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.08em" }}>{leader.winRate.toFixed(0)}% WR · {leader.total} trades</div>
              </div>
            </div>
          )}

          {/* Your rank callout (if on the board) */}
          {myRank > 0 && myRank > 1 && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
              <span style={{ fontFamily: MONO, fontSize: "24px", fontWeight: 700, color: C.text2, letterSpacing: "-0.02em" }}>#{myRank}</span>
              <div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "2px" }}>YOUR RANK</div>
                <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2 }}>Keep publishing to climb the board.</div>
              </div>
            </div>
          )}

          {/* Publish strip */}
          <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em" }}>YOUR STATS TO PUBLISH</div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.text2, letterSpacing: "0.1em", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "3px 10px" }}>
                RANKED BY {METRIC_LABELS[activeCircle?.metric || "dollar"] || "$ P&L"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0", marginBottom: "14px" }}>
              {[["W/L", `${wins}/${losses}`], ["WR", `${winRate}%`], hasDollarData ? ["$ P&L", `${totalPnlDollar >= 0 ? "+" : ""}$${Math.abs(totalPnlDollar).toFixed(0)}`] : ["P&L", `${pnlPos ? "+" : ""}${totalPnL}R`], ["AVG R", avgRR === "—" ? "—" : `${avgRR}R`]].map(([k, v], i) => (
                <div key={k} style={{ padding: "4px 10px", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "6px" }}>{k}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>{v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => publishToCircle(activeCircle.code)} style={{ ...pillPrimary(true), width: "100%", padding: "14px 20px" }}>PUBLISH MY STATS →</button>
          </section>

          {/* Tabs: Leaderboard / Chat / Members */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["leaderboard", "chat", "members"] as const).map(tab => (
                  <button key={tab}
                    onClick={() => { setCircleTab(tab); if (tab === "chat" && chatMessages.length === 0) loadChatMessages(activeCircle.code); }}
                    style={{ background: circleTab === tab ? C.text : "transparent", color: circleTab === tab ? C.bg : C.muted, border: `1px solid ${circleTab === tab ? C.text : C.border2}`, borderRadius: "999px", padding: "5px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {tab === "leaderboard" ? "Board" : tab === "chat" ? "Chat" : "Members"}
                  </button>
                ))}
              </div>
              {circleTab === "leaderboard" && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {(["all", "week"] as const).map(s => (
                    <button key={s} onClick={() => setLbSort(s)}
                      style={{ background: lbSort === s ? C.text2 + "22" : "transparent", border: `1px solid ${lbSort === s ? C.text2 : C.border2}`, borderRadius: "999px", padding: "4px 10px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", color: lbSort === s ? C.text : C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {s === "all" ? "ALL TIME" : "THIS WEEK"}
                    </button>
                  ))}
                  <button onClick={async () => { setLoadingLB(true); const e = await fetchCircleLeaderboard(activeCircle); setLeaderboard(e); setLoadingLB(false); }}
                    style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "11px" }}>↻</button>
                </div>
              )}
            </div>

            {/* ── LEADERBOARD ── */}
            {circleTab === "leaderboard" && (
              <div>
                {loadingLB ? (
                  <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading…</div>
                ) : leaderboard.length === 0 ? (
                  <div style={{ padding: "40px 24px", textAlign: "center", background: C.panel, borderRadius: "12px" }}>
                    <div style={{ fontFamily: MONO, fontSize: "24px", color: C.border2, marginBottom: "12px" }}>—</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontStyle: "italic", color: C.text2, marginBottom: "6px" }}>No stats published yet.</div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted }}>Be the first — hit "Publish My Stats" above.</div>
                  </div>
                ) : (
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {leaderboard.map((entry: any, i: number) => {
                      const isMe = entry.memberCode === getMyCode();
                      const md = metricDisplay(entry, activeCircle);
                      const pPos = md.raw >= 0;
                      const isFirst = i === 0;
                      const pnlCol = isFirst && pPos ? C.green : pPos ? C.text : C.red;
                      const isExpanded = expandedMember === entry.memberCode;
                      const isFollowing = (following || []).includes(entry.memberCode);
                      const medal = MEDALS[i] || null;
                      return (
                        <div key={entry.memberCode} style={{ borderBottom: `1px solid ${C.border}`, background: isFirst ? `${C.green}08` : "transparent" }}>
                          <div
                            onClick={() => setExpandedMember(isExpanded ? null : entry.memberCode)}
                            style={{ padding: "16px 0", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "14px", cursor: "pointer", paddingLeft: isExpanded ? "10px" : 0, paddingRight: isExpanded ? "10px" : 0 }}>
                            <span style={{ fontFamily: MONO, fontSize: "13px", color: isFirst ? C.green : C.muted, letterSpacing: "0.06em", minWidth: "28px" }}>
                              {medal || String(i + 1).padStart(2, "0")}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                                {isMe && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.12em", textTransform: "uppercase" }}>· YOU</span>}
                              </div>
                              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "3px", fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                <span>{entry.total} trades</span>
                                <span style={{ color: entry.winRate >= 50 ? C.green : entry.winRate > 0 ? C.red : C.muted }}>{entry.winRate.toFixed(0)}% WR</span>
                                {entry.topStrategy && <span>{stratCode(entry.topStrategy)}</span>}
                                {entry.streak?.count >= 2 && <span style={{ color: entry.streak.type === "Win" ? C.green : C.red }}>{entry.streak.count}{entry.streak.type === "Win" ? "W" : "L"}</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                              <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 700, color: pnlCol, letterSpacing: "-0.01em", lineHeight: 1 }}>{md.val}</div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.06em" }}>{md.label}</div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div style={{ padding: "0 10px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                              <div>
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "4px" }}>
                                  {entry.alias && entry.alias !== entry.memberCode ? "ALIAS · USER CODE" : "USER CODE"}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.10em", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {entry.alias && entry.alias !== entry.memberCode ? `${entry.alias} · ${entry.memberCode}` : entry.memberCode}
                                  </span>
                                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(entry.memberCode); showToast("Code copied"); }}
                                    style={{ ...pillGhost, padding: "6px 12px", fontSize: "9px" }}>COPY</button>
                                </div>
                              </div>
                              {!isMe && (
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button onClick={(e) => { e.stopPropagation(); if (isFollowing) { unfollowUser(entry.memberCode); } else { followUser(entry.memberCode); } }}
                                    style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "8px 18px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>
                                    {isFollowing ? "✓ Following" : "+ Follow"}
                                  </button>
                                  {activeCircle?.isOwner && (
                                    <button onClick={async (e) => { e.stopPropagation(); await kickMember(activeCircle.code, entry.memberCode); setLeaderboard(prev => prev.filter(r => r.memberCode !== entry.memberCode)); setExpandedMember(null); }}
                                      style={{ background: "transparent", color: C.red, border: `1px solid ${C.red}44`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                                      KICK
                                    </button>
                                  )}
                                </div>
                              )}
                              {entry.handle && openProfile && (
                                <button onClick={(e) => { e.stopPropagation(); openProfile(entry.handle); }}
                                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", padding: 0, textDecoration: "underline" }}>View Profile →</button>
                              )}
                              {entry.updatedAt && (
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.10em", textTransform: "uppercase" }}>
                                  Last published · {new Date(entry.updatedAt).toLocaleString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── CHAT ── */}
            {circleTab === "chat" && (() => {
              const myId = profile?.uid;
              return (
                <div>
                  <div style={{ borderTop: `1px solid ${C.border}`, minHeight: "260px", maxHeight: "420px", overflowY: "auto", paddingTop: "8px" }}>
                    {chatLoading
                      ? <div style={{ padding: "40px 0", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>Loading…</div>
                      : chatMessages.length === 0
                        ? <div style={{ padding: "48px 0", textAlign: "center" }}>
                            <div style={{ fontFamily: MONO, fontSize: "22px", color: C.border2, marginBottom: "10px", letterSpacing: "0.14em" }}>· · ·</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontStyle: "italic", color: C.text2, marginBottom: "6px" }}>No messages yet.</div>
                            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted }}>Be the first to say something.</div>
                          </div>
                        : chatMessages.map((msg: any) => {
                            const isMe = msg.sender_id === myId;
                            return (
                              <div key={msg.id} style={{ padding: "10px 0", display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", gap: "10px", alignItems: "flex-end" }}>
                                {!isMe && (
                                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "10px", color: C.muted, flexShrink: 0, border: `1px solid ${C.border}` }}>
                                    {(msg.sender_name || "?")[0].toUpperCase()}
                                  </div>
                                )}
                                <div style={{ maxWidth: "75%" }}>
                                  {!isMe && <div onClick={() => openProfile && msg.sender_handle && openProfile(msg.sender_handle)} style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.08em", marginBottom: "4px", cursor: openProfile && msg.sender_handle ? "pointer" : "default" }}>{msg.sender_name}{msg.sender_handle ? ` @${msg.sender_handle}` : ""}</div>}
                                  <div style={{ background: isMe ? C.text : C.panel, color: isMe ? C.bg : C.text, borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontFamily: BODY, fontSize: "14px", lineHeight: 1.5, wordBreak: "break-word", border: isMe ? "none" : `1px solid ${C.border}` }}>{msg.text}</div>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "4px", display: "flex", gap: "10px", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "center" }}>
                                    <span>{fmtMsgTime(msg.created_at)}</span>
                                    {isMe && <button onClick={() => deleteChatMessage(msg.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", padding: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Delete</button>}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                    }
                    <div ref={chatBottomRef} />
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", paddingTop: "14px", borderTop: `1px solid ${C.border}`, marginTop: "4px" }}>
                    <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(activeCircle.code, myId); } }}
                      placeholder="Message the circle…" rows={2}
                      style={{ ...inp, flex: 1, resize: "none", lineHeight: 1.5, fontFamily: BODY, fontSize: "14px" }} />
                    <button onClick={() => sendChatMessage(activeCircle.code, myId)}
                      disabled={!chatInput.trim() || chatSending}
                      style={{ ...pillPrimary(!!chatInput.trim() && !chatSending), width: "auto", padding: "10px 18px", opacity: chatSending ? 0.6 : 1, flexShrink: 0 }}>
                      {chatSending ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── MEMBERS ── */}
            {circleTab === "members" && (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {(activeCircle.members || []).length === 0 ? (
                  <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>No member data available.</div>
                ) : (activeCircle.members || []).map((m: any, idx: number) => {
                  const isMe = m.code === getMyCode();
                  const isFollowing = (following || []).includes(m.code);
                  const lbEntry = leaderboard.find((e: any) => e.memberCode === m.code);
                  return (
                    <div key={m.code || idx} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: "18px", flexShrink: 0, border: `1px solid ${C.border}` }}>
                        {m.avatar ? (m.avatar.length <= 8 && !m.avatar.startsWith("http") && !m.avatar.startsWith("data:") ? m.avatar : "👤") : "👤"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{m.name || "Trader"}</span>
                          {isMe && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.12em" }}>· YOU</span>}
                          {m.code === activeCircle.createdBy || m.isOwner ? <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>OWNER</span> : null}
                        </div>
                        {m.alias && <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{m.alias}</div>}
                        {lbEntry && <div style={{ fontFamily: MONO, fontSize: "10px", color: lbEntry.totalPnL >= 0 ? C.green : C.red, letterSpacing: "0.06em", marginTop: "2px" }}>{lbEntry.totalPnL >= 0 ? "+" : ""}{lbEntry.totalPnL.toFixed(1)}R · {lbEntry.winRate.toFixed(0)}% WR</div>}
                      </div>
                      {!isMe && (
                        <button onClick={() => isFollowing ? unfollowUser(m.code) : followUser(m.code)}
                          style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>
                          {isFollowing ? "\u2713" : "+Follow"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Invite strip */}
          <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", marginBottom: "12px" }}>INVITE TO CIRCLE</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ flex: 1, borderBottom: `1px solid ${C.border2}`, padding: "12px 0", fontFamily: MONO, fontSize: "16px", color: C.text, letterSpacing: "0.14em" }}>{activeCircle.code}</div>
              <button onClick={() => { navigator.clipboard?.writeText(activeCircle.code); showToast("Code copied"); }}
                style={{ ...pillGhost, padding: "8px 16px" }}>CODE</button>
              <button onClick={() => { navigator.clipboard?.writeText(`https://tradrjournal.xyz/?join=${activeCircle.code}`); showToast("Link copied"); }}
                style={{ ...pillGhost, padding: "8px 16px" }}>LINK</button>
              <button onClick={() => shareInviteLink(activeCircle)}
                style={{ ...pillPrimary(true), width: "auto", padding: "8px 16px" }}>SHARE</button>
            </div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.5 }}>
              LINK copies a join URL \u00b7 SHARE sends a ready-made invite.
            </div>
          </section>
        </div>
      )}
    </div>
  ); // TradingCircles render
}
