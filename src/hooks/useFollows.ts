// ═══════════════════════════════════════════════════════════════════════════════
// useFollows — follow-graph state + sync for TRADR
//
// Owns:  following[], followers[], followerProfiles[]
//        followUser(), unfollowUser()
//        syncFollows useEffect (per-row KV + v2 flag merge + Realtime sub)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { storage } from "../lib/storage";
import { log } from "../lib/log";
import { isFlagOn } from "../lib/flags";
import {
  subscribeToFollows,
  followUserV2,
  unfollowUserV2,
  readFollowGraphV2,
  migrateLegacyFollows,
} from "../data/follows";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FollowerProfile {
  code: string;
  name: string;
  handle: string;
}

interface UseFollowsParams {
  /** True while the initial data load is still in flight — defers sync until false. */
  loading: boolean;
  /**
   * Supabase auth user ID — pass `user?.id` rather than the full User object
   * so the hook's effect dep stays stable.
   */
  userId: string | undefined;
  /** Returns the current user's short trading code. */
  getMyCode: () => string;
  /** Profile uid — used as the v2 write key. */
  uid: string | undefined;
  /** Toast callback. */
  showToast: (msg: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFollows({ loading, userId, getMyCode, uid, showToast }: UseFollowsParams) {
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [followerProfiles, setFollowerProfiles] = useState<FollowerProfile[]>([]);

  // ── Stable refs — avoids stale-closure issues in the interval / Realtime sub ─
  const syncFollowsRef = useRef<() => void>(() => {});
  const getMyCodeRef = useRef(getMyCode);
  getMyCodeRef.current = getMyCode;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // ── Sync effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (!uid) return;

    let alive = true;

    async function syncFollows() {
      const mc = getMyCodeRef.current();
      try {
        // Canonical source: per-row edges. Each follow writes TWO rows,
        // both owned by the follower, so RLS never blocks a second writer.
        const [followRows, followerRows] = await Promise.all([
          storage.listByPrefix(`tradr_follow_${mc}_`),
          storage.listByPrefix(`tradr_follower_${mc}_`),
        ]);
        if (!alive) return;

        const followingSet = new Set<string>();
        const followersSet = new Set<string>();

        for (const row of (followRows || [])) {
          const target = String(row.key).slice(`tradr_follow_${mc}_`.length);
          if (target) followingSet.add(target);
        }

        const profiles: FollowerProfile[] = [];
        for (const row of (followerRows || [])) {
          const follower = String(row.key).slice(`tradr_follower_${mc}_`.length);
          if (follower) {
            followersSet.add(follower);
            try {
              const edge = JSON.parse(row.value || "{}");
              profiles.push({ code: follower, name: edge.name || follower, handle: edge.handle || "" });
            } catch {
              profiles.push({ code: follower, name: follower, handle: "" });
            }
          }
        }

        // V2 merge: read from public.follows when flag is on.
        const currentUserId = userIdRef.current;
        if (isFlagOn("newFollows") && currentUserId) {
          try {
            const v2Graph = await readFollowGraphV2(currentUserId);
            v2Graph.following.forEach((c: string) => followingSet.add(c));
            v2Graph.followers.forEach((c: string) => followersSet.add(c));
          } catch (e) {
            log.error("useFollows.v2", e);
          }
        }

        setFollowing(Array.from(followingSet));
        setFollowers(Array.from(followersSet));
        setFollowerProfiles(profiles);
      } catch { /* network blip — keep previous state */ }
    }

    syncFollowsRef.current = syncFollows;
    syncFollowsRef.current();

    migrateLegacyFollows(getMyCodeRef.current()).catch(() => {});

    const unsub = subscribeToFollows(getMyCodeRef.current(), () => syncFollowsRef.current());
    const id = setInterval(() => syncFollowsRef.current(), 120_000);

    return () => {
      alive = false;
      clearInterval(id);
      try { unsub(); } catch { /* ignore */ }
    };
  }, [loading, uid]); // getMyCode + userId accessed via refs — stable dep array

  // ── Follow / unfollow mutations ──────────────────────────────────────────────

  async function followUser(code: string) {
    const target = code.trim().toUpperCase();
    if (!target) return;
    const mc = getMyCodeRef.current();
    if (target === mc) { showToast("That's you"); return; }
    if (following.includes(target)) return;

    setFollowing(prev => [...prev, target]);

    const edge = { follower: mc, target, at: new Date().toISOString() };
    try { await storage.set(`tradr_follow_${mc}_${target}`, JSON.stringify(edge), true); } catch { /* ignore */ }
    try { await storage.set(`tradr_follower_${target}_${mc}`, JSON.stringify(edge), true); } catch { /* ignore */ }
    if (isFlagOn("newFollows") && uid) {
      followUserV2(uid, target).catch(e => log.error("followUser.v2", e));
    }
    showToast("Following");
  }

  async function unfollowUser(code: string) {
    const target = code.trim().toUpperCase();
    if (!target) return;
    const mc = getMyCodeRef.current();

    setFollowing(prev => prev.filter(c => c !== target));

    try { await storage.delete(`tradr_follow_${mc}_${target}`, true); } catch { /* ignore */ }
    try { await storage.delete(`tradr_follower_${target}_${mc}`, true); } catch { /* ignore */ }
    if (isFlagOn("newFollows") && uid) {
      unfollowUserV2(uid, target).catch(e => log.error("unfollowUser.v2", e));
    }
    showToast("Unfollowed");
  }

  return { following, followers, followerProfiles, followUser, unfollowUser };
}
