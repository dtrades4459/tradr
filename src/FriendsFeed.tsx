import { useState } from "react";
import { AvatarCircle, MONO, BODY, DISPLAY } from "./shared";

const REACTIONS = ["FIRE","GEM","UP","TARGET","PAIN","MIND"];

export function FriendsFeed({ friends, friendFeed, showAddFriend, setShowAddFriend, followHandleInput, setFollowHandleInput, followHandleMsg, followHandleLoading, followByHandle, unfollowUser, following, followers, followerProfiles, publishFeed, refreshFeed, reactToFeed, myFeedReactions, profile, C, inp, pillPrimary, openProfile }: any) {
  const [tab, setTab] = useState<"feed"|"people">("feed");

  const followingCount = following?.length || 0;
  const followerCount = followerProfiles?.length || 0;
  const live = (C as any).live ?? "oklch(0.84 0.14 175)";
  const orb1 = (C as any).orb1 ?? "oklch(0.55 0.22 252)";
  const orb2 = (C as any).orb2 ?? "oklch(0.45 0.20 268)";

  const tabBtn = (id: "feed"|"people", label: string) => (
    <button key={id} onClick={() => setTab(id)} style={{
      background: "none", border: "none", padding: "0 0 6px 0", cursor: "pointer",
      fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase",
      color: tab === id ? C.text : C.muted,
      borderBottom: tab === id ? `1px solid ${C.text}` : "1px solid transparent",
    }}>{label}</button>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "4px" }}>
        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "4px" }}>Friends · Live</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>
            What your <span style={{ fontWeight: 600 }}>circle</span> is trading
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
            {tab === "feed" && friends.length > 0 && (
              <button onClick={async () => { await publishFeed(); await refreshFeed(); }}
                style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "999px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, cursor: "pointer" }}>
                &#8635;
              </button>
            )}
            <button onClick={() => setShowAddFriend(!showAddFriend)}
              style={{ background: showAddFriend ? C.text : "transparent", color: showAddFriend ? C.bg : C.text, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {showAddFriend ? "Close" : "+ Follow"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
          {tabBtn("feed", "Feed")}
          {tabBtn("people", `People${followingCount ? ` · ${followingCount}` : ""}`)}
        </div>
      </div>

      {/* Follow panel */}
      {showAddFriend && (
        <div style={{ margin: "16px 0", padding: "18px", border: `1px solid ${C.border}`, borderRadius: "18px", display: "flex", flexDirection: "column", gap: "16px", background: C.panel }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "3px" }}>YOUR HANDLE</div>
              <div style={{ fontFamily: MONO, fontSize: "14px", color: C.text, letterSpacing: "0.04em" }}>@{profile?.handle || "—"}</div>
            </div>
            <button onClick={async () => { await publishFeed(); }}
              style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: C.muted }}>
              Publish feed
            </button>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "8px" }}>FOLLOW BY USERNAME</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input value={followHandleInput} onChange={e => setFollowHandleInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !followHandleLoading && followByHandle()}
                placeholder="@username" style={{ ...inp, flex: 1, margin: 0 }} disabled={followHandleLoading} />
              <button onClick={followByHandle} disabled={!followHandleInput.trim() || followHandleLoading}
                style={{ ...pillPrimary(!!followHandleInput.trim() && !followHandleLoading), width: "auto", padding: "10px 18px", opacity: followHandleLoading ? 0.6 : 1 }}>
                {followHandleLoading ? "…" : "Follow"}
              </button>
            </div>
            {followHandleMsg && (
              <div style={{ fontFamily: BODY, fontSize: "12px", color: followHandleMsg.includes("not found") || followHandleMsg.includes("That's you") ? C.red : C.green, marginTop: "8px" }}>
                {followHandleMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FEED tab */}
      {tab === "feed" && (
        <div style={{ marginTop: "16px" }}>
          {friendFeed.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              {followingCount === 0 ? (
                <>
                  <div style={{ fontSize: "32px", marginBottom: "14px" }}>&#128101;</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, marginBottom: "6px", letterSpacing: "-0.01em" }}>Follow traders to get started</div>
                  <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, maxWidth: "260px", margin: "0 auto 20px" }}>
                    Their trades and stats appear here in real time.
                  </div>
                  <button onClick={() => setShowAddFriend(true)}
                    style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    + Follow someone
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "28px", marginBottom: "12px" }}>&#128237;</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.muted, marginBottom: "6px" }}>Feed is empty</div>
                  <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>
                    The traders you follow haven't published recently.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Story strip */}
              {following?.length > 0 && (
                <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "16px", marginBottom: "8px" }}>
                  <div style={{ flexShrink: 0, textAlign: "center" }}>
                    <div style={{ width: "56px", height: "56px", borderRadius: "999px", padding: "2px", background: `conic-gradient(from 200deg, ${live}, ${C.accent}, ${orb2}, ${live})` }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "999px", border: `2px solid ${C.bg}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <AvatarCircle name={profile?.name} avatar={profile?.avatar} size={48} C={C} />
                      </div>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "9px", color: live, marginTop: "4px", fontWeight: 600, letterSpacing: "0.06em" }}>You</div>
                  </div>
                  {following.map((code: string, idx: number) => {
                    const f = friends.find((x: any) => x.code === code) || { code, name: code, handle: "" };
                    const hue = 200 + idx * 30;
                    return (
                      <div key={code} onClick={() => openProfile && f.handle && openProfile(f.handle)}
                        style={{ flexShrink: 0, textAlign: "center", cursor: "pointer" }}>
                        <div style={{ width: "56px", height: "56px", borderRadius: "999px", padding: "2px", background: `linear-gradient(135deg, oklch(0.7 0.16 ${hue}), oklch(0.5 0.18 ${hue + 60}))` }}>
                          <div style={{ width: "100%", height: "100%", borderRadius: "999px", border: `2px solid ${C.bg}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <AvatarCircle name={f.name} avatar={f.avatar} size={48} C={C} />
                          </div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "4px", maxWidth: "56px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.handle ? f.handle.replace(/^@/, "") : (f.name || "").split(" ")[0] || code.slice(0, 6)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Feed posts */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {friendFeed.map((item: any, i: number) => {
                  const pnl = parseFloat(item.pnl || "0");
                  const isWin = item.outcome === "Win";
                  const isLoss = item.outcome === "Loss";
                  const outcomeClr = isWin ? C.green : isLoss ? C.red : C.muted;
                  const side = item.direction === "Long" ? "LONG" : item.direction === "Short" ? "SHORT" : null;
                  const initials = (item.authorName || "?").slice(0, 2).toUpperCase();
                  return (
                    <div key={item.authorCode + "-" + item.tradeId + "-" + i}
                      style={{ borderRadius: "22px", padding: "16px", background: C.panel, border: `1px solid ${C.border}` }}>
                      {/* Author row */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div onClick={() => openProfile && item.authorHandle && openProfile(item.authorHandle)}
                          style={{ cursor: openProfile && item.authorHandle ? "pointer" : "default", width: "36px", height: "36px", borderRadius: "999px", background: `linear-gradient(135deg, ${orb1}, ${orb2})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: DISPLAY, fontWeight: 600, fontSize: "11px", flexShrink: 0, overflow: "hidden" }}>
                          {item.authorAvatar && (item.authorAvatar.startsWith("data:") || item.authorAvatar.startsWith("http"))
                            ? <img src={item.authorAvatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                            : (item.authorAvatar && item.authorAvatar.length <= 4 ? item.authorAvatar : initials)
                          }
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>{item.authorName || "Trader"}</div>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "1px" }}>
                            {item.authorHandle ? `@${item.authorHandle}` : "@trader"} · {item.date}
                          </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                          <circle cx="5" cy="10" r="1.5" fill={C.muted}/>
                          <circle cx="10" cy="10" r="1.5" fill={C.muted}/>
                          <circle cx="15" cy="10" r="1.5" fill={C.muted}/>
                        </svg>
                      </div>

                      {/* Trade card */}
                      <div style={{ marginTop: "12px", padding: "14px", borderRadius: "16px", background: "rgba(128,128,128,0.05)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, background: isWin ? `color-mix(in oklch, ${C.green} 14%, transparent)` : isLoss ? `color-mix(in oklch, ${C.red} 14%, transparent)` : "rgba(128,128,128,0.08)", color: outcomeClr, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 600, fontSize: "12px", border: `1px solid ${C.border2}` }}>
                          {(item.pair || "—").slice(0, 3).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>{item.pair || "—"}</span>
                            {side && (
                              <span style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "9px", letterSpacing: "0.10em", fontFamily: MONO, fontWeight: 700, background: side === "LONG" ? `color-mix(in oklch, ${C.green} 14%, transparent)` : `color-mix(in oklch, ${C.red} 14%, transparent)`, color: side === "LONG" ? C.green : C.red }}>{side}</span>
                            )}
                          </div>
                          {item.strategy && <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "3px" }}>{item.strategy}</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {item.pnl && (
                            <>
                              <div style={{ fontFamily: MONO, fontSize: "14px", fontWeight: 600, color: outcomeClr, fontVariantNumeric: "tabular-nums" }}>{pnl >= 0 ? "+" : ""}{item.pnl}R</div>
                              {item.rr && <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{item.rr}R setup</div>}
                            </>
                          )}
                        </div>
                      </div>

                      {item.notes && (
                        <div style={{ marginTop: "10px", fontFamily: BODY, fontSize: "13px", color: C.text, lineHeight: 1.45 }}>
                          {item.notes.slice(0, 200)}{item.notes.length > 200 ? "…" : ""}
                        </div>
                      )}

                      {/* Reactions */}
                      <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                        {REACTIONS.map(rx => {
                          const raw = (item.reactions || {})[rx];
                          const count = typeof raw === "number" ? raw : (Array.isArray(raw) ? raw.length : 0);
                          const iMine = myFeedReactions?.has(`${item.authorCode}_${item.tradeId}_${rx}`);
                          const show = iMine || count > 0;
                          if (!show) return null;
                          return (
                            <button key={rx} onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: (C as any).accentSoft ?? "rgba(100,150,255,0.1)", border: `1px solid ${C.border2}`, fontFamily: MONO, fontSize: "10px", fontWeight: 600, color: iMine ? C.accent : C.muted, letterSpacing: "0.08em", cursor: "pointer" }}>
                              {rx === "FIRE" ? "&#128293;" : rx === "GEM" ? "&#128142;" : rx === "UP" ? "&#128077;" : rx === "TARGET" ? "&#127919;" : rx === "PAIN" ? "&#128128;" : "&#129327;"} · {count}
                            </button>
                          );
                        })}
                        {!REACTIONS.some(rx => myFeedReactions?.has(`${item.authorCode}_${item.tradeId}_${rx}`)) && (
                          <div style={{ display: "flex", gap: "4px" }}>
                            {REACTIONS.map(rx => (
                              <button key={rx} onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                                style={{ width: "28px", height: "28px", borderRadius: "999px", background: "rgba(128,128,128,0.06)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", cursor: "pointer" }}>
                                {rx === "FIRE" ? "🔥" : rx === "GEM" ? "💎" : rx === "UP" ? "👍" : rx === "TARGET" ? "🎯" : rx === "PAIN" ? "💀" : "🤯"}
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => { const o = item.outcome === "Win" ? "WIN" : item.outcome === "Loss" ? "LOSS" : "BE"; const p = item.pnl ? ` ${parseFloat(item.pnl) >= 0 ? "+" : ""}${item.pnl}R` : ""; window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${o} ${item.pair || ""}${p}${item.rr ? " | " + item.rr + "R" : ""} — @tradrjournal\nhttps://tradrjournal.xyz`)}`, "_blank", "noopener"); }}
                          style={{ marginLeft: "auto", width: "30px", height: "30px", borderRadius: "999px", background: "rgba(128,128,128,0.06)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 5h8a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H7l-3 2v-2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" stroke={C.muted} strokeWidth="1.2" fill="none"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PEOPLE tab */}
      {tab === "people" && (
        <div style={{ marginTop: "16px" }}>
          {followingCount === 0 && followerCount === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>&#128269;</div>
              <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.muted, marginBottom: "6px" }}>Nobody yet</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, marginBottom: "18px" }}>Share your handle with other traders to build your network.</div>
              <button onClick={() => setShowAddFriend(true)}
                style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                + Follow someone
              </button>
            </div>
          ) : (
            <div>
              {followingCount > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "12px" }}>Following · {followingCount}</div>
                  <div style={{ borderRadius: "18px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                    {following.map((code: string, idx: number) => {
                      const f = friends.find((x: any) => x.code === code) || { code, name: code, handle: "" };
                      const followsBack = followers?.includes(code);
                      return (
                        <div key={code} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: idx < following.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <div onClick={() => openProfile && f.handle && openProfile(f.handle)}
                            style={{ cursor: openProfile && f.handle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                            <AvatarCircle name={f.name} avatar={f.avatar} size={36} C={C} />
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>{f.name || code}</span>
                                {followsBack && <span style={{ fontFamily: MONO, fontSize: "8px", color: C.green, letterSpacing: "0.08em", border: `1px solid ${C.green}44`, borderRadius: "4px", padding: "1px 5px" }}>MUTUAL</span>}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                                {f.handle ? `@${f.handle}` : code.slice(0, 12)}
                              </div>
                            </div>
                          </div>
                          <button onClick={() => unfollowUser(code)}
                            style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "5px 12px", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em" }}>
                            Unfollow
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {followerCount > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "12px" }}>Followers · {followerCount}</div>
                  <div style={{ borderRadius: "18px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                    {followerProfiles.map((f: any, idx: number) => {
                      const iFollow = following?.includes(f.code);
                      return (
                        <div key={f.code} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: idx < followerProfiles.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <div onClick={() => openProfile && f.handle && openProfile(f.handle)}
                            style={{ cursor: openProfile && f.handle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                            <AvatarCircle name={f.name} avatar={f.avatar} size={36} C={C} />
                            <div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>{f.name || f.code}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                                {f.handle ? `@${f.handle}` : f.code?.slice(0, 12)}
                              </div>
                            </div>
                          </div>
                          {iFollow ? (
                            <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.08em" }}>MUTUAL</span>
                          ) : (
                            <button onClick={() => { setFollowHandleInput(f.handle || f.code); followByHandle(); }}
                              style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em" }}>
                              Follow back
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
