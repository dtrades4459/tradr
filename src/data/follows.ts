// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Follows data layer
//
// One-way follow graph backing the friends/feed loop. Two rows per follow,
// both owned by the follower so neither write touches a row owned by anyone
// else. This was the fix for the RLS bug where the second follower's UPDATE
// against a shared `tradr_followers_<target>` row was rejected.
//
// Row layout in shared_kv:
//   tradr_follow_<follower>_<target>     — enumerates my "following"
//   tradr_follower_<target>_<follower>   — enumerates target's "followers"
//                                          (still owned by the follower)
//
// Friends = mutual follows (I follow them AND they follow me).
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "../lib/supabase";

export interface FollowEdge {
  follower: string;
  target: string;
  at: string;
}

export const followKeys = {
  followPrefix: (follower: string) => `tradr_follow_${follower}_`,
  follow: (follower: string, target: string) => `tradr_follow_${follower}_${target}`,
  followerPrefix: (target: string) => `tradr_follower_${target}_`,
  follower: (target: string, follower: string) => `tradr_follower_${target}_${follower}`,
  // Legacy single-row keys — read-only fallback during migration window.
  legacyFollowing: (myCode: string) => `tradr_following_${myCode}`,
  legacyFollowers: (myCode: string) => `tradr_followers_${myCode}`,
};

function store() {
  return (window as any).storage as {
    get: (key: string, shared?: boolean) => Promise<{ value: string } | null>;
    set: (key: string, value: string, shared?: boolean) => Promise<void>;
    del: (key: string, shared?: boolean) => Promise<void>;
    delete: (key: string, shared?: boolean) => Promise<void>;
    listByPrefix: (prefix: string) => Promise<Array<{ key: string; value: string }>>;
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface FollowGraph {
  following: string[];
  followers: string[];
}

export async function readFollowGraph(myCode: string): Promise<FollowGraph> {
  try {
    const [followRows, followerRows, legacyFg, legacyFr] = await Promise.all([
      store().listByPrefix(followKeys.followPrefix(myCode)),
      store().listByPrefix(followKeys.followerPrefix(myCode)),
      store().get(followKeys.legacyFollowing(myCode), true),
      store().get(followKeys.legacyFollowers(myCode), true),
    ]);

    const followingSet = new Set<string>();
    const followersSet = new Set<string>();

    for (const row of followRows || []) {
      const target = String(row.key).slice(followKeys.followPrefix(myCode).length);
      if (target) followingSet.add(target);
    }
    for (const row of followerRows || []) {
      const follower = String(row.key).slice(followKeys.followerPrefix(myCode).length);
      if (follower) followersSet.add(follower);
    }

    if (legacyFg) {
      try { (JSON.parse(legacyFg.value) || []).forEach((c: string) => followingSet.add(c)); }
      catch (e) { console.error("[TRADR][follows.readFollowGraph][legacyFg]", e); }
    }
    if (legacyFr) {
      try { (JSON.parse(legacyFr.value) || []).forEach((c: string) => followersSet.add(c)); }
      catch (e) { console.error("[TRADR][follows.readFollowGraph][legacyFr]", e); }
    }

    return {
      following: Array.from(followingSet),
      followers: Array.from(followersSet),
    };
  } catch (e) {
    console.error("[TRADR][follows.readFollowGraph]", myCode, e);
    return { following: [], followers: [] };
  }
}

// One-shot migration. Reads any legacy `tradr_following_<myCode>` row,
// materializes each entry as a per-row edge (both sides, owned by us), and
// drops the legacy row. Safe because the legacy row is owned by us.
export async function migrateLegacyFollows(myCode: string): Promise<void> {
  try {
    const legacyFg = await store().get(followKeys.legacyFollowing(myCode), true);
    if (!legacyFg) return;
    const legacy: string[] = (() => {
      try { return JSON.parse(legacyFg.value) || []; }
      catch { return []; }
    })();
    await Promise.all(legacy.map(async (target) => {
      if (!target || target === myCode) return;
      const edge: FollowEdge = { follower: myCode, target, at: new Date().toISOString() };
      try { await store().set(followKeys.follow(myCode, target), JSON.stringify(edge), true); }
      catch (e) { console.error("[TRADR][follows.migrateLegacyFollows][follow]", target, e); }
      try { await store().set(followKeys.follower(target, myCode), JSON.stringify(edge), true); }
      catch (e) { console.error("[TRADR][follows.migrateLegacyFollows][follower]", target, e); }
    }));
    try { await store().del(followKeys.legacyFollowing(myCode), true); }
    catch (e) { console.error("[TRADR][follows.migrateLegacyFollows][delete]", e); }
  } catch (e) {
    console.error("[TRADR][follows.migrateLegacyFollows]", myCode, e);
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function followUser(input: { myCode: string; target: string }): Promise<void> {
  const target = input.target.trim().toUpperCase();
  if (!target || target === input.myCode) return;
  const edge: FollowEdge = { follower: input.myCode, target, at: new Date().toISOString() };
  try { await store().set(followKeys.follow(input.myCode, target), JSON.stringify(edge), true); }
  catch (e) { console.error("[TRADR][follows.followUser][follow]", target, e); }
  try { await store().set(followKeys.follower(target, input.myCode), JSON.stringify(edge), true); }
  catch (e) { console.error("[TRADR][follows.followUser][follower]", target, e); }
}

export async function unfollowUser(input: { myCode: string; target: string }): Promise<void> {
  const target = input.target.trim().toUpperCase();
  if (!target) return;
  // We own both edges, so RLS lets us delete them.
  try { await store().del(followKeys.follow(input.myCode, target), true); }
  catch (e) { console.error("[TRADR][follows.unfollowUser][follow]", target, e); }
  try { await store().del(followKeys.follower(target, input.myCode), true); }
  catch (e) { console.error("[TRADR][follows.unfollowUser][follower]", target, e); }
}

export function mutualFriends(graph: FollowGraph): string[] {
  const followerSet = new Set(graph.followers);
  return graph.following.filter((c) => followerSet.has(c));
}

// ── Realtime ────────────────────────────────────────────────────────────────
// Fires when someone follows or unfollows me, OR when I add/remove a follow
// from another tab. Caller decides whether to refresh local state.

export function subscribeToFollows(myCode: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`follows-${myCode}`)
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "shared_kv" },
      (payload: any) => {
        const row = (payload.new || payload.old) as { key?: string } | undefined;
        const key = row?.key;
        if (!key) return;
        // Care about either side of the edge.
        if (
          key.startsWith(followKeys.followPrefix(myCode)) ||
          key.startsWith(followKeys.followerPrefix(myCode))
        ) {
          onChange();
        }
      }
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); } catch { /* noop */ }
  };
}
