// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Follows data layer
//
// One-way follow graph backing the friends/feed loop. Two rows per follow,
// both owned by the follower so neither write touches a row owned by anyone
// else. This was the fix for the RLS bug where the second follower's UPDATE
// against a shared `koda_followers_<target>` row was rejected.
//
// Row layout in shared_kv:
//   koda_follow_<follower>_<target>     — enumerates my "following"
//   koda_follower_<target>_<follower>   — enumerates target's "followers"
//                                          (still owned by the follower)
//
// Friends = mutual follows (I follow them AND they follow me).
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "../lib/supabase";
import { storage } from "../lib/storage";
import { log } from "../lib/log";

export interface FollowEdge {
  follower: string;
  target: string;
  at: string;
}

export const followKeys = {
  followPrefix: (follower: string) => `koda_follow_${follower}_`,
  follow: (follower: string, target: string) => `koda_follow_${follower}_${target}`,
  followerPrefix: (target: string) => `koda_follower_${target}_`,
  follower: (target: string, follower: string) => `koda_follower_${target}_${follower}`,
};


// ── Reads ───────────────────────────────────────────────────────────────────

export interface FollowGraph {
  following: string[];
  followers: string[];
}

export async function readFollowGraph(myCode: string): Promise<FollowGraph> {
  try {
    const [followRows, followerRows] = await Promise.all([
      storage.listByPrefix(followKeys.followPrefix(myCode)),
      storage.listByPrefix(followKeys.followerPrefix(myCode)),
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

    return {
      following: Array.from(followingSet),
      followers: Array.from(followersSet),
    };
  } catch (e) {
    log.error("follows.readFollowGraph", e, { myCode });
    return { following: [], followers: [] };
  }
}

// One-shot migration. Reads any legacy `koda_following_<myCode>` row,
// materializes each entry as a per-row edge (both sides, owned by us), and
// drops the legacy row. Safe because the legacy row is owned by us.
export async function migrateLegacyFollows(myCode: string): Promise<void> {
  try {
    const legacyFg = await storage.get(`koda_following_${myCode}`, true);
    if (!legacyFg) return;
    const legacy: string[] = (() => {
      try { return JSON.parse(legacyFg.value) || []; }
      catch { return []; }
    })();
    await Promise.all(legacy.map(async (target) => {
      if (!target || target === myCode) return;
      const edge: FollowEdge = { follower: myCode, target, at: new Date().toISOString() };
      try { await storage.set(followKeys.follow(myCode, target), JSON.stringify(edge), true); }
      catch (e) { log.error("follows.migrateLegacyFollows.follow", e, { target }); }
      try { await storage.set(followKeys.follower(target, myCode), JSON.stringify(edge), true); }
      catch (e) { log.error("follows.migrateLegacyFollows.follower", e, { target }); }
    }));
    try { await storage.del(`koda_following_${myCode}`, true); }
    catch (e) { log.error("follows.migrateLegacyFollows.delete", e); }
  } catch (e) {
    log.error("follows.migrateLegacyFollows", e, { myCode });
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function followUser(input: { myCode: string; target: string }): Promise<void> {
  const target = input.target.trim().toUpperCase();
  if (!target || target === input.myCode) return;
  const edge: FollowEdge = { follower: input.myCode, target, at: new Date().toISOString() };
  try { await storage.set(followKeys.follow(input.myCode, target), JSON.stringify(edge), true); }
  catch (e) { log.error("follows.followUser.follow", e, { target }); }
  try { await storage.set(followKeys.follower(target, input.myCode), JSON.stringify(edge), true); }
  catch (e) { log.error("follows.followUser.follower", e, { target }); }
}

export async function unfollowUser(input: { myCode: string; target: string }): Promise<void> {
  const target = input.target.trim().toUpperCase();
  if (!target) return;
  // We own both edges, so RLS lets us delete them.
  try { await storage.del(followKeys.follow(input.myCode, target), true); }
  catch (e) { log.error("follows.unfollowUser.follow", e, { target }); }
  try { await storage.del(followKeys.follower(target, input.myCode), true); }
  catch (e) { log.error("follows.unfollowUser.follower", e, { target }); }
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

// ─── V2 FOLLOWS (public.follows table) ───────────────────────────────────────
// These functions are only called when isFlagOn("newFollows") is true.
// They shadow the KV functions above — dual-write keeps both in sync.

/** Resolve a member code → auth user UUID via public.profiles. */
async function uidForCode(code: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("member_code", code.trim().toUpperCase())
      .maybeSingle();
    return (data as any)?.user_id ?? null;
  } catch (e) {
    log.error("follows.uidForCode", e, { code });
    return null;
  }
}

/** Insert a follow edge into public.follows (no-op on conflict). */
export async function followUserV2(myUid: string, targetCode: string): Promise<void> {
  const targetUid = await uidForCode(targetCode);
  if (!targetUid) return; // target not in v2 yet — skip silently
  try {
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: myUid, target_id: targetUid }, { onConflict: "follower_id,target_id", ignoreDuplicates: true });
    if (error) log.error("follows.followUserV2", error, { targetCode });
  } catch (e) {
    log.error("follows.followUserV2", e, { targetCode });
  }
}

/** Delete a follow edge from public.follows. */
export async function unfollowUserV2(myUid: string, targetCode: string): Promise<void> {
  const targetUid = await uidForCode(targetCode);
  if (!targetUid) return;
  try {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", myUid)
      .eq("target_id", targetUid);
    if (error) log.error("follows.unfollowUserV2", error, { targetCode });
  } catch (e) {
    log.error("follows.unfollowUserV2", e, { targetCode });
  }
}

export interface FollowGraphV2 {
  following: string[]; // member_codes I follow
  followers: string[]; // member_codes following me
}

/**
 * Read following + followers from public.follows, returning member_codes.
 * Falls back gracefully if the table doesn't exist yet.
 */
export async function readFollowGraphV2(myUid: string): Promise<FollowGraphV2> {
  try {
    const [fwdRes, bwdRes] = await Promise.all([
      // Who I follow: join profiles on target_id to get their codes
      supabase
        .from("follows")
        .select("profiles!follows_target_id_fkey(member_code)")
        .eq("follower_id", myUid),
      // Who follows me: join profiles on follower_id to get their codes
      supabase
        .from("follows")
        .select("profiles!follows_follower_id_fkey(member_code)")
        .eq("target_id", myUid),
    ]);

    const following: string[] = (fwdRes.data ?? [])
      .map((r: any) => r.profiles?.member_code)
      .filter(Boolean);

    const followers: string[] = (bwdRes.data ?? [])
      .map((r: any) => r.profiles?.member_code)
      .filter(Boolean);

    return { following, followers };
  } catch (e) {
    log.error("follows.readFollowGraphV2", e, { myUid });
    return { following: [], followers: [] };
  }
}

