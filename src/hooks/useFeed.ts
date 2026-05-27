// ═══════════════════════════════════════════════════════════════════════════════
// useFeed — friend feed state + actions for Kōda
//
// Owns:  friends[]          — legacy code-based friend list (KV)
//        friendFeed[]       — inbound trade items from following/friends
//        myFeedReactions    — local reaction de-dup set
//        showAddFriend      — UI toggle for the add-friend panel
//        friendCodeInput / friendMsg — legacy code-add UI
//        followHandleInput / followHandleMsg / followHandleLoading — @handle follow UI
//
// Actions: saveFriends, addFriend, removeFriend
//          publishFeed, refreshFeed, reactToFeed
//          followByHandle
//
// Effects:
//   • Loads koda_friends + koda_feed from storage once on !loading
//   • Auto-publishes my feed (debounced 1 s) whenever trades change
//   • Auto-refreshes inbound feed every 2 min
//
// Deps: follows (following[]) + followUser come from useFollows.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { storage } from "../lib/storage";
import { log } from "../lib/log";
import type { Trade, Profile } from "../types";

// ── Local utility (mirrors normaliseHandle in Koda.tsx) ─────────────────────

function normaliseHandle(h: string): string {
  return h.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedItem {
  authorCode:   string;
  authorName:   string;
  authorHandle: string;
  authorAvatar: string;
  tradeId:      number;
  pair:         string;
  date:         string;
  outcome:      string;
  pnl:          string;
  rr:           string;
  strategy:     string;
  setup:        string;
  notes:        string;
  session:      string;
  reactions:    Record<string, unknown>;
  comments:     number;
  publishedAt:  string;
}

export interface LegacyFriend {
  code:    string;
  name:    string;
  addedAt: string;
}

interface UseFeedParams {
  /** True while the initial loadAll is in flight — defers all effects. */
  loading: boolean;
  /** Current user's trades — used to build the published feed. */
  trades: Trade[];
  /** Current user's profile — name / handle / avatar stamped into feed items. */
  profile: Profile;
  /** Codes this user follows — from useFollows. Used in refreshFeed. */
  following: string[];
  /** Call followUser from useFollows to actually write the follow edge. */
  followUser: (code: string) => void | Promise<void>;
  /** Returns the current user's short trading code. */
  getMyCode: () => string;
  /** Resolves an @handle → { code, name } from shared_kv. */
  resolveHandle: (h: string) => Promise<{ code: string; name: string } | null>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFeed({
  loading,
  trades,
  profile,
  following,
  followUser,
  getMyCode,
  resolveHandle,
}: UseFeedParams) {
  // ── State ────────────────────────────────────────────────────────────────────
  const [friends, setFriends]             = useState<LegacyFriend[]>([]);
  const [friendFeed, setFriendFeed]       = useState<FeedItem[]>([]);
  const [myFeedReactions, setMyFeedReactions] = useState<Set<string>>(new Set());
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [friendMsg, setFriendMsg]         = useState("");
  const [followHandleInput, setFollowHandleInput]   = useState("");
  const [followHandleMsg, setFollowHandleMsg]       = useState("");
  const [followHandleLoading, setFollowHandleLoading] = useState(false);

  // ── Stable refs (avoid stale closures in effects) ─────────────────────────
  const getMyCodeRef   = useRef(getMyCode);
  getMyCodeRef.current = getMyCode;
  const profileRef     = useRef(profile);
  profileRef.current   = profile;
  const followingRef   = useRef(following);
  followingRef.current = following;
  const friendsRef     = useRef(friends);
  friendsRef.current   = friends;
  const tradesRef      = useRef(trades);
  tradesRef.current    = trades;

  // ── Initial load from storage (fires once when loadAll completes) ─────────
  useEffect(() => {
    if (loading) return;
    storage.get("koda_friends")
      .then(r => {
        if (r?.value) {
          try { setFriends(JSON.parse(r.value)); } catch (e) { log.error("useFeed.load.friends", e); }
        }
      })
      .catch(e => log.error("useFeed.load.friends", e));

    storage.get("koda_feed", true)
      .then(r => {
        if (r?.value) {
          try { setFriendFeed(JSON.parse(r.value)); } catch (e) { log.error("useFeed.load.feed", e); }
        }
      })
      .catch(e => log.error("useFeed.load.feed", e));
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feed actions ──────────────────────────────────────────────────────────

  async function publishFeed() {
    const mc    = getMyCodeRef.current();
    const p     = profileRef.current;
    const ts    = tradesRef.current;
    const items = ts.slice(0, 10).map(t => ({
      authorCode:   mc,
      authorName:   p.name    || "Trader",
      authorHandle: p.handle  || "@trader",
      authorAvatar: p.avatar  || "",
      tradeId:      t.id,
      pair:         t.pair,
      date:         t.date,
      outcome:      t.outcome,
      pnl:          t.pnl,
      rr:           t.rr,
      strategy:     t.strategy,
      setup:        t.setup,
      notes:        t.notes,
      session:      t.session,
      reactions:    t.reactions || {},
      comments:     (t.comments || []).length,
      publishedAt:  new Date().toISOString(),
    }));
    await storage.set(`koda_feed_${mc}`, JSON.stringify(items), true);
  }

  async function refreshFeed() {
    const items: FeedItem[] = [];
    const allCodes = new Set([
      ...followingRef.current,
      ...friendsRef.current.map(f => f.code),
    ]);
    for (const code of allCodes) {
      try {
        const r = await storage.get(`koda_feed_${code}`, true);
        if (r) { const d = JSON.parse(r.value); items.push(...d); }
      } catch { /* network blip — skip */ }
    }
    items.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
    setFriendFeed(items);
    await storage.set("koda_feed", JSON.stringify(items));
  }

  function reactToFeed(ac: string, tid: number, reaction: string) {
    const key          = `${ac}_${tid}_${reaction}`;
    const alreadyReacted = myFeedReactions.has(key);
    setMyFeedReactions(prev => {
      const next = new Set(prev);
      if (alreadyReacted) { next.delete(key); } else { next.add(key); }
      return next;
    });
    setFriendFeed(p => (p as any[]).map((item: any) => {
      if (item.authorCode !== ac || item.tradeId !== tid) return item;
      const r   = { ...item.reactions };
      const cur = typeof r[reaction] === "number" ? r[reaction] : (Array.isArray(r[reaction]) ? r[reaction].length : 0);
      r[reaction] = alreadyReacted ? Math.max(0, cur - 1) : cur + 1;
      return { ...item, reactions: r };
    }));
  }

  // ── Friends (legacy code-based system) ───────────────────────────────────

  async function saveFriends(u: LegacyFriend[]) {
    setFriends(u);
    await storage.set("koda_friends", JSON.stringify(u));
  }

  async function addFriend() {
    const code = friendCodeInput.trim().toUpperCase();
    if (!code) return;
    if (friends.find(f => f.code === code)) {
      setFriendMsg("Already added.");
      setTimeout(() => setFriendMsg(""), 2000);
      return;
    }
    const u: LegacyFriend[] = [
      ...friends,
      { code, name: code.split("-")[0], addedAt: new Date().toISOString() },
    ];
    await saveFriends(u);
    setFriendCodeInput("");
    setFriendMsg("Friend added.");
    setTimeout(() => setFriendMsg(""), 2500);
  }

  async function removeFriend(code: string) {
    await saveFriends(friends.filter(f => f.code !== code));
  }

  // ── Follow by @handle ─────────────────────────────────────────────────────

  async function followByHandle() {
    const raw = followHandleInput.trim();
    if (!raw) return;
    setFollowHandleLoading(true);
    setFollowHandleMsg("");
    try {
      const resolved = await resolveHandle(raw);
      if (!resolved) {
        setFollowHandleMsg("User not found. Check the username.");
        setTimeout(() => setFollowHandleMsg(""), 3000);
        return;
      }
      if (resolved.code === getMyCodeRef.current()) {
        setFollowHandleMsg("That's you.");
        setTimeout(() => setFollowHandleMsg(""), 2000);
        return;
      }
      await followUser(resolved.code);
      setFollowHandleInput("");
      setFollowHandleMsg(`Now following @${normaliseHandle(raw)}.`);
      setTimeout(() => setFollowHandleMsg(""), 2500);
    } finally {
      setFollowHandleLoading(false);
    }
  }

  // ── Auto-publish my feed (debounced 1 s) ─────────────────────────────────
  const publishRef = useRef(publishFeed);
  publishRef.current = publishFeed;
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => { publishRef.current(); }, 1000);
    return () => clearTimeout(t);
  }, [trades, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-refresh inbound feed (every 2 min) ───────────────────────────────
  const refreshRef = useRef(refreshFeed);
  refreshRef.current = refreshFeed;
  useEffect(() => {
    if (loading || !friends.length) return;
    const id = setInterval(() => { refreshRef.current(); }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [loading, friends]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    // State
    friends,
    friendFeed,
    myFeedReactions,
    showAddFriend,
    setShowAddFriend,
    // Legacy friend system
    friendCodeInput,
    setFriendCodeInput,
    friendMsg,
    addFriend,
    removeFriend,
    saveFriends,
    // @handle follow
    followHandleInput,
    setFollowHandleInput,
    followHandleMsg,
    followHandleLoading,
    followByHandle,
    // Feed actions
    publishFeed,
    refreshFeed,
    reactToFeed,
  };
}
