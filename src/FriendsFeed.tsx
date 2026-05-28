import { type CSSProperties, useState } from "react";
import { AvatarCircle, MONO, BODY, DISPLAY } from "./shared";

const REACTIONS = ["FIRE", "GEM", "UP", "TARGET", "PAIN", "MIND"] as const;
type Reaction = (typeof REACTIONS)[number];

const REACTION_EMOJI: Record<Reaction, string> = {
  FIRE: "🔥", GEM: "💎", UP: "👍", TARGET: "🎯", PAIN: "💀", MIND: "🤯",
};

interface FeedItem {
  authorCode: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  tradeId: string;
  pair?: string;
  direction?: string;
  outcome?: string;
  pnl?: string;
  rr?: string;
  strategy?: string;
  notes?: string;
  date?: string;
  reactions?: Record<string, number | string[]>;
}

interface FriendProfile {
  code: string;
  name?: string;
  handle?: string;
  avatar?: string;
}

interface FriendsFeedProps {
  friends: FriendProfile[];
  friendFeed: FeedItem[];
  showAddFriend: boolean;
  setShowAddFriend: (v: boolean) => void;
  followHandleInput: string;
  setFollowHandleInput: (v: string) => void;
  followHandleMsg: string;
  followHandleLoading: boolean;
  followByHandle: () => void;
  unfollowUser: (code: string) => void;
  following: string[];
  followers: string[];
  followerProfiles: FriendProfile[];
  publishFeed: () => Promise<void>;
  refreshFeed: () => Promise<void>;
  reactToFeed: (authorCode: string, tradeId: string, rx: string) => void;
  myFeedReactions?: Set<string>;
  profile: { name?: string; handle?: string; avatar?: string } | null;
  C: Record<string, string>;
  inp: CSSProperties;
  pillPrimary: (active: boolean) => CSSProperties;
  openProfile?: (handle: string) => void;
}

export function FriendsFeed({
  friends, friendFeed, showAddFriend, setShowAddFriend,
  followHandleInput, setFollowHandleInput, followHandleMsg, followHandleLoading,
  followByHandle, unfollowUser, following, followers, followerProfiles,
  publishFeed, refreshFeed, reactToFeed, myFeedReactions, profile,
  C, inp, pillPrimary, openProfile,
}: FriendsFeedProps) {
  const [tab, setTab] = useState<"feed" | "people">("feed");

  const followingCount = following?.length ?? 0;
  const followerCount = followerProfiles?.length ?? 0;
  const live = C.live ?? "oklch(0.84 0.14 175)";
  const orb1 = C.orb1 ?? "oklch(0.55 0.22 252)";
  const orb2 = C.orb2 ?? "oklch(0.45 0.20 268)";
  const cardBg = `color-mix(in srgb, ${C.text} 3%, transparent)`;

  const tabBtn = (id: "feed" | "people", label: string) => (
    <button key={id} onClick={() => setTab(id)} style={{
      background: "none", border: "none", padding: "0 0 6px 0", cursor: "pointer",
      fontFamily: MONO, fontSize: "11px", letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      color: tab === id ? C.text : C.muted,
      borderBottom: tab === id ? `1px solid ${C.text}` : "1px solid transparent",
    }}>{label}</button>
  );

  return (
    <div style={{ position: "relative" }}>
      {/* Orb bloom */}
      <div style={{
        position: "absolute", top: 80, left: -80, width: 320, height: 320,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(circle, ${orb1} 0%, transparent 65%)`,
        filter: "blur(70px)",
        opacity: C.bg?.startsWith("#0") || C.bg?.startsWith("#1") ? 0.4 : 0.25,
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: "4px" }}>
          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: "6px" }}>
            Friends · Live
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              What your <span style={{ fontWeight: 600 }}>circle</span> is trading
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, marginTop: "4px" }}>
              {tab === "feed" && friends.length > 0 && (
                <button onClick={async () => { await publishFeed(); await refreshFeed(); }}
                  style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "999px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, cursor: "pointer" }}>
                  &#8635;
                </button>
              )}
              <button onClick={() => setShowAddFriend(!showAddFriend)}
                style={{
                  background: showAddFriend ? C.text : "transparent",
                  color: showAddFriend ? C.bg : C.text,
                  border: `1px solid ${C.border2}`,
                  borderRadius: "999px", padding: "6px 14px", cursor: "pointer",
                  fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                }}>
                {showAddFriend ? "Close" : "+ Follow"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "14px" }}>
            {tabBtn("feed", "Feed")}
            {tabBtn("people", `People${followingCount ? ` · ${followingCount}` : ""}`)}
          </div>
        </div>

        {/* Follow panel */}
        {showAddFriend && (
          <div style={{
            margin: "16px 0", padding: "18px",
            border: `1px solid ${C.border2}`, borderRadius: "22px",
            display: "flex", flexDirection: "column", gap: "16px",
            background: C.surfaceGlass ?? "rgba(28,28,34,0.55)",
            backdropFilter: "blur(20px) saturate(140%)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.16em", marginBottom: "3px", textTransform: "uppercase" as const }}>
                  YOUR HANDLE
                </div>
                <div style={{ fontFamily: MONO, fontSize: "14px", color: C.text, letterSpacing: "0.04em" }}>
                  @{profile?.handle || "—"}
                </div>
              </div>
              <button onClick={async () => { await publishFeed(); }}
                style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: C.muted }}>
                Publish feed
              </button>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.16em", marginBottom: "8px", textTransform: "uppercase" as const }}>
                FOLLOW BY USERNAME
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={followHandleInput}
                  onChange={e => setFollowHandleInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !followHandleLoading && followByHandle()}
                  placeholder="@username"
                  style={{ ...inp, flex: 1, margin: 0 }}
                  disabled={followHandleLoading}
                />
                <button
                  onClick={followByHandle}
                  disabled={!followHandleInput.trim() || followHandleLoading}
                  style={{ ...pillPrimary(!!followHandleInput.trim() && !followHandleLoading), width: "auto", padding: "10px 18px", opacity: followHandleLoading ? 0.6 : 1 }}>
                  {followHandleLoading ? "…" : "Follow"}
                </button>
              </div>
              {followHandleMsg && (
                <div style={{
                  fontFamily: BODY, fontSize: "12px", marginTop: "8px",
                  color: followHandleMsg.includes("not found") || followHandleMsg.includes("That's you") ? C.red : C.green,
                }}>
                  {followHandleMsg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* FEED tab */}
        {tab === "feed" && (
          <div style={{ marginTop: "20px" }}>
            {friendFeed.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                {followingCount === 0 ? (
                  <>
                    <div style={{ fontSize: "32px", marginBottom: "14px" }}>&#128101;</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 500, color: C.text, marginBottom: "6px", letterSpacing: "-0.01em" }}>
                      Follow traders to get started
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, maxWidth: "260px", margin: "0 auto 20px" }}>
                      Their trades and stats appear here in real time.
                    </div>
                    <button onClick={() => setShowAddFriend(true)}
                      style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
                      + Follow someone
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "28px", marginBottom: "12px" }}>&#128237;</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.muted, marginBottom: "6px" }}>
                      Feed is empty
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6 }}>
                      The traders you follow haven&apos;t published recently.
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div>
                {/* Story strip */}
                {following?.length > 0 && (
                  <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "18px", marginBottom: "4px", scrollbarWidth: "none" }}>
                    {/* You */}
                    <div style={{ flexShrink: 0, textAlign: "center" }}>
                      <div style={{
                        width: "56px", height: "56px", borderRadius: "999px", padding: "2px",
                        background: `conic-gradient(from 200deg, ${live}, ${C.accent}, ${orb2}, ${live})`,
                      }}>
                        <div style={{
                          width: "100%", height: "100%", borderRadius: "999px",
                          border: `2px solid ${C.bg}`, overflow: "hidden",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <AvatarCircle name={profile?.name} avatar={profile?.avatar} size={48} C={C} />
                        </div>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: "9px", color: live, marginTop: "5px", fontWeight: 600, letterSpacing: "0.06em" }}>
                        Live
                      </div>
                    </div>
                    {following.map((code, idx) => {
                      const f = friends.find(x => x.code === code) ?? { code, name: code, handle: "" } as FriendProfile;
                      const hue = 200 + idx * 30;
                      return (
                        <div key={code}
                          onClick={() => openProfile && f.handle && openProfile(f.handle)}
                          style={{ flexShrink: 0, textAlign: "center", cursor: openProfile && f.handle ? "pointer" : "default" }}>
                          <div style={{
                            width: "56px", height: "56px", borderRadius: "999px", padding: "2px",
                            background: `linear-gradient(135deg, oklch(0.7 0.16 ${hue}), oklch(0.5 0.18 ${hue + 60}))`,
                          }}>
                            <div style={{
                              width: "100%", height: "100%", borderRadius: "999px",
                              border: `2px solid ${C.bg}`, overflow: "hidden",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <AvatarCircle name={f.name} avatar={f.avatar} size={48} C={C} />
                            </div>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "5px", maxWidth: "56px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.handle ? f.handle.replace(/^@/, "") : (f.name || "").split(" ")[0] || code.slice(0, 6)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Feed posts */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {friendFeed.map((item, i) => {
                    const pnl = parseFloat(item.pnl ?? "0");
                    const isWin = item.outcome === "Win";
                    const isLoss = item.outcome === "Loss";
                    const outcomeClr = isWin ? C.green : isLoss ? C.red : C.muted;
                    const side = item.direction === "Long" ? "LONG" : item.direction === "Short" ? "SHORT" : null;
                    const initials = (item.authorName ?? "?").slice(0, 2).toUpperCase();
                    return (
                      <div key={`${item.authorCode}-${item.tradeId}-${i}`}
                        style={{ borderRadius: "22px", padding: "16px", background: C.panel, border: `1px solid ${C.border}` }}>

                        {/* Author row */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            onClick={() => openProfile && item.authorHandle && openProfile(item.authorHandle)}
                            style={{
                              cursor: openProfile && item.authorHandle ? "pointer" : "default",
                              width: "36px", height: "36px", borderRadius: "999px",
                              background: `linear-gradient(135deg, ${orb1}, ${orb2})`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fff", fontFamily: DISPLAY, fontWeight: 600, fontSize: "11px",
                              flexShrink: 0, overflow: "hidden",
                            }}>
                            {item.authorAvatar && (item.authorAvatar.startsWith("data:") || item.authorAvatar.startsWith("http"))
                              ? <img src={item.authorAvatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" loading="lazy" />
                              : (item.authorAvatar && item.authorAvatar.length <= 4 ? item.authorAvatar : initials)
                            }
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>
                              {item.authorName ?? "Trader"}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "1px" }}>
                              {item.authorHandle ? `@${item.authorHandle}` : "@trader"} · {item.date}
                            </div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                            <circle cx="5" cy="10" r="1.5" fill={C.muted} />
                            <circle cx="10" cy="10" r="1.5" fill={C.muted} />
                            <circle cx="15" cy="10" r="1.5" fill={C.muted} />
                          </svg>
                        </div>

                        {/* Trade card */}
                        <div style={{
                          marginTop: "12px", padding: "14px", borderRadius: "16px",
                          background: cardBg, border: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", gap: "12px",
                        }}>
                          <div style={{
                            width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
                            background: isWin
                              ? `color-mix(in oklch, ${C.green} 14%, transparent)`
                              : isLoss
                              ? `color-mix(in oklch, ${C.red} 14%, transparent)`
                              : "rgba(128,128,128,0.08)",
                            color: outcomeClr,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: MONO, fontWeight: 600, fontSize: "12px",
                            border: `1px solid ${C.border2}`,
                          }}>
                            {(item.pair ?? "—").slice(0, 3).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>
                                {item.pair ?? "—"}
                              </span>
                              {side && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: "4px",
                                  fontSize: "9px", letterSpacing: "0.10em",
                                  fontFamily: MONO, fontWeight: 700,
                                  background: side === "LONG"
                                    ? `color-mix(in oklch, ${C.green} 14%, transparent)`
                                    : `color-mix(in oklch, ${C.red} 14%, transparent)`,
                                  color: side === "LONG" ? C.green : C.red,
                                }}>{side}</span>
                              )}
                            </div>
                            {item.strategy && (
                              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "3px" }}>
                                {item.strategy}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            {item.pnl && (
                              <>
                                <div style={{ fontFamily: MONO, fontSize: "14px", fontWeight: 600, color: outcomeClr, fontVariantNumeric: "tabular-nums" }}>
                                  {pnl >= 0 ? "+" : ""}{item.pnl}R
                                </div>
                                {item.rr && (
                                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                                    {item.rr}R setup
                                  </div>
                                )}
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
                            const raw = (item.reactions ?? {})[rx];
                            const count = typeof raw === "number" ? raw : (Array.isArray(raw) ? raw.length : 0);
                            const iMine = myFeedReactions?.has(`${item.authorCode}_${item.tradeId}_${rx}`);
                            if (!iMine && count === 0) return null;
                            return (
                              <button key={rx}
                                onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                                style={{
                                  display: "flex", alignItems: "center", gap: "5px",
                                  padding: "4px 9px", borderRadius: "999px",
                                  background: C.accentSoft ?? "rgba(100,150,255,0.1)",
                                  border: `1px solid ${C.border2}`,
                                  fontFamily: MONO, fontSize: "10px", fontWeight: 600,
                                  color: iMine ? C.accent : C.muted,
                                  letterSpacing: "0.08em", cursor: "pointer",
                                }}>
                                {REACTION_EMOJI[rx]} · {count}
                              </button>
                            );
                          })}
                          {!REACTIONS.some(rx => myFeedReactions?.has(`${item.authorCode}_${item.tradeId}_${rx}`)) && (
                            <div style={{ display: "flex", gap: "4px" }}>
                              {REACTIONS.map(rx => (
                                <button key={rx}
                                  onClick={() => reactToFeed(item.authorCode, item.tradeId, rx)}
                                  style={{
                                    width: "28px", height: "28px", borderRadius: "999px",
                                    background: cardBg, border: `1px solid ${C.border}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "12px", cursor: "pointer",
                                  }}>
                                  {REACTION_EMOJI[rx]}
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const o = item.outcome === "Win" ? "WIN" : item.outcome === "Loss" ? "LOSS" : "BE";
                              const p = item.pnl ? ` ${parseFloat(item.pnl) >= 0 ? "+" : ""}${item.pnl}R` : "";
                              window.open(
                                `https://x.com/intent/post?text=${encodeURIComponent(`${o} ${item.pair ?? ""}${p}${item.rr ? " | " + item.rr + "R" : ""} — #Kōda\nhttps://kodatrade.co.uk`)}`,
                                "_blank", "noopener",
                              );
                            }}
                            style={{ marginLeft: "auto", width: "30px", height: "30px", borderRadius: "999px", background: cardBg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                              <path d="M3 5h8a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H7l-3 2v-2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" stroke={C.muted} strokeWidth="1.2" fill="none" />
                            </svg>
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
          <div style={{ marginTop: "20px" }}>
            {followingCount === 0 && followerCount === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "12px" }}>&#128269;</div>
                <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 500, color: C.muted, marginBottom: "6px" }}>
                  Nobody yet
                </div>
                <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, marginBottom: "18px" }}>
                  Share your handle with other traders to build your network.
                </div>
                <button onClick={() => setShowAddFriend(true)}
                  style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "10px 22px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
                  + Follow someone
                </button>
              </div>
            ) : (
              <div>
                {followingCount > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: "12px" }}>
                      Following · {followingCount}
                    </div>
                    <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                      {following.map((code, idx) => {
                        const f = friends.find(x => x.code === code) ?? { code, name: code, handle: "" } as FriendProfile;
                        const followsBack = followers?.includes(code);
                        return (
                          <div key={code} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: idx < following.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <div
                              onClick={() => openProfile && f.handle && openProfile(f.handle)}
                              style={{ cursor: openProfile && f.handle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                              <AvatarCircle name={f.name} avatar={f.avatar} size={36} C={C} />
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>{f.name || code}</span>
                                  {followsBack && (
                                    <span style={{ fontFamily: MONO, fontSize: "8px", color: C.green, letterSpacing: "0.08em", border: `1px solid ${C.green}44`, borderRadius: "4px", padding: "1px 5px" }}>
                                      MUTUAL
                                    </span>
                                  )}
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
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: "12px" }}>
                      Followers · {followerCount}
                    </div>
                    <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                      {followerProfiles.map((f, idx) => {
                        const iFollow = following?.includes(f.code);
                        return (
                          <div key={f.code} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: idx < followerProfiles.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <div
                              onClick={() => openProfile && f.handle && openProfile(f.handle)}
                              style={{ cursor: openProfile && f.handle ? "pointer" : "default", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                              <AvatarCircle name={f.name} avatar={f.avatar} size={36} C={C} />
                              <div>
                                <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>
                                  {f.name || f.code}
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                                  {f.handle ? `@${f.handle}` : f.code?.slice(0, 12)}
                                </div>
                              </div>
                            </div>
                            {iFollow ? (
                              <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.08em" }}>
                                MUTUAL
                              </span>
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
    </div>
  );
}
