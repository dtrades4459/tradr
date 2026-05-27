// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Circles data layer
//
// Circles are the USP. This module is the single funnel for every circle
// read/write, so the per-row ownership pattern is enforced by the API surface
// rather than by convention — you can't accidentally re-introduce the RLS bug
// that broke Jason's updates against Dylon's circle row.
//
// Row layout in shared_kv:
//   koda_circle_<CODE>                        — metadata, owned by creator
//   koda_circle_member_<CODE>_<memberCode>    — membership, owned by each member
//   koda_circle_entry_<CODE>_<memberCode>     — leaderboard stats, owned by each member
//
// Every write goes through a row whose owner_id = auth.uid(), so RLS
// `auth.uid() = owner_id` always holds. Members enumerate via listByPrefix.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "../lib/supabase";
import { storage } from "../lib/storage";
import { log } from "../lib/log";

// ── Types ───────────────────────────────────────────────────────────────────

export interface MemberRecord {
  name: string;
  handle: string;
  avatar: string;
  code: string;
  joinedAt: string;
}

export interface CircleMeta {
  id: number;
  code: string;
  name: string;
  description: string;
  strategy: string;
  privacy: "public" | "private";
  createdBy: string;
  createdAt: string;
}

export interface Circle extends CircleMeta {
  members: MemberRecord[];
  isOwner: boolean;
}

export interface LeaderboardEntry {
  memberCode: string;
  name: string;
  handle: string;
  avatar: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  totalPnL: number;
  avgRR: number;
  streak: { type: "win" | "loss"; count: number } | null;
  topStrategy: string | null;
  updatedAt: string | null;
}

// ── Key helpers (single source of truth for row naming) ─────────────────────

export const circleKeys = {
  meta: (code: string) => `koda_circle_${code}`,
  memberPrefix: (code: string) => `koda_circle_member_${code}_`,
  member: (code: string, memberCode: string) => `koda_circle_member_${code}_${memberCode}`,
  entryPrefix: (code: string) => `koda_circle_entry_${code}_`,
  entry: (code: string, memberCode: string) => `koda_circle_entry_${code}_${memberCode}`,
  myCirclesCache: () => `koda_circles`,
};


// ── Reads ───────────────────────────────────────────────────────────────────

export async function readCircleMeta(code: string): Promise<CircleMeta | null> {
  try {
    const res = await storage.get(circleKeys.meta(code), true);
    if (!res) return null;
    return JSON.parse(res.value);
  } catch (e) {
    log.error("circles.readCircleMeta", e, { code });
    return null;
  }
}

export async function readCircleMembers(code: string, fallback: MemberRecord[] = []): Promise<MemberRecord[]> {
  try {
    const rows = await storage.listByPrefix(circleKeys.memberPrefix(code));
    if (!rows.length) return fallback;
    const out: MemberRecord[] = [];
    for (const r of rows) {
      try { out.push(JSON.parse(r.value)); } catch { /* skip malformed */ }
    }
    return out.length ? out : fallback;
  } catch (e) {
    log.error("circles.readCircleMembers", e, { code });
    return fallback;
  }
}

export async function readLeaderboard(circle: Pick<Circle, "code" | "members">): Promise<LeaderboardEntry[]> {
  // Always refresh members first — a new member may have joined since the
  // cached circle object was last set on this client.
  const members = await readCircleMembers(circle.code, circle.members || []);
  // Fetch all member entries in parallel (was a sequential for..of — O(n) round trips).
  const rows = await Promise.all(
    members.map(m =>
      storage.get(circleKeys.entry(circle.code, m.code), true).catch(e => {
        log.error("circles.readLeaderboard", e, { code: circle.code, memberCode: m.code });
        return null;
      })
    )
  );
  const entries: LeaderboardEntry[] = rows.map((r, i) => {
    if (!r) return blankEntry(members[i]);
    try { return JSON.parse(r.value) as LeaderboardEntry; }
    catch { return blankEntry(members[i]); }
  });
  entries.sort((a, b) => b.totalPnL - a.totalPnL);
  return entries;
}

function blankEntry(m: MemberRecord): LeaderboardEntry {
  return {
    memberCode: m.code, name: m.name, handle: m.handle, avatar: m.avatar,
    wins: 0, losses: 0, total: 0, winRate: 0, totalPnL: 0, avgRR: 0,
    streak: null, topStrategy: null, updatedAt: null,
  };
}

// ── Writes (always per-row, always owned by the caller) ─────────────────────

export async function createCircle(input: {
  name: string;
  description?: string;
  strategy?: string;
  privacy?: "public" | "private";
  me: MemberRecord;
}): Promise<Circle> {
  const { me } = input;
  const code = input.name.replace(/\s+/g, "").toUpperCase().slice(0, 6)
    + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const meta: CircleMeta = {
    id: Date.now(),
    code,
    name: input.name.trim(),
    description: (input.description || "").trim(),
    strategy: input.strategy || "",
    privacy: input.privacy || "public",
    createdBy: me.name,
    createdAt: new Date().toISOString(),
  };
  // Two writes, both owned by the creator:
  //   - the circle meta row
  //   - the creator's own member row
  await storage.set(circleKeys.meta(code), JSON.stringify(meta), true);
  await storage.set(circleKeys.member(code, me.code), JSON.stringify(me), true);
  return { ...meta, members: [me], isOwner: true };
}

export async function joinCircle(input: {
  code: string;
  me: MemberRecord;
}): Promise<Circle | null> {
  const code = input.code.trim().toUpperCase();
  const meta = await readCircleMeta(code);
  if (!meta) return null;
  // Write ONLY my own member row. Do not mutate the creator's circle row.
  await storage.set(circleKeys.member(code, input.me.code), JSON.stringify(input.me), true);
  const members = await readCircleMembers(code, [input.me]);
  return { ...meta, members, isOwner: false };
}

export async function leaveCircle(input: { code: string; myCode: string }): Promise<void> {
  // Only delete my OWN member row. RLS would block deleting anyone else's.
  try {
    await storage.del(circleKeys.member(input.code, input.myCode), true);
  } catch (e) {
    log.error("circles.leaveCircle", e, { code: input.code, myCode: input.myCode });
  }
}

export async function ensureMyMemberRow(input: { code: string; me: MemberRecord }): Promise<void> {
  // Idempotent — safe to call on every circle sync. Fixes legacy circles
  // that only had members[] inlined on the creator's meta row.
  try {
    await storage.set(circleKeys.member(input.code, input.me.code), JSON.stringify(input.me), true);
  } catch (e) {
    log.error("circles.ensureMyMemberRow", e, { code: input.code });
  }
}

export async function publishLeaderboardEntry(input: {
  code: string;
  entry: LeaderboardEntry;
}): Promise<void> {
  try {
    await storage.set(circleKeys.entry(input.code, input.entry.memberCode), JSON.stringify(input.entry), true);
  } catch (e) {
    log.error("circles.publishLeaderboardEntry", e, { code: input.code });
    throw e;
  }
}

// ── Realtime ────────────────────────────────────────────────────────────────
// Subscribe to shared_kv changes for a specific circle. Fires on any INSERT
// /UPDATE/DELETE whose key starts with koda_circle_<CODE> — that covers
// meta, member rows, and leaderboard entries. The caller supplies a refresh
// callback; this module stays dumb about React state.

export type CircleChange = {
  key: string;
  kind: "meta" | "member" | "entry" | "other";
  event: "INSERT" | "UPDATE" | "DELETE";
};

export function subscribeToCircle(code: string, onChange: (c: CircleChange) => void): () => void {
  const channel = supabase
    .channel(`circle-${code}`)
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "shared_kv" },
      (payload: any) => {
        const row = (payload.new || payload.old) as { key?: string } | undefined;
        const key = row?.key;
        if (!key) return;
        if (!key.startsWith(`koda_circle_`)) return;
        // Only fire if the row belongs to THIS circle.
        const belongs =
          key === circleKeys.meta(code) ||
          key.startsWith(circleKeys.memberPrefix(code)) ||
          key.startsWith(circleKeys.entryPrefix(code));
        if (!belongs) return;
        let kind: CircleChange["kind"] = "other";
        if (key === circleKeys.meta(code)) kind = "meta";
        else if (key.startsWith(circleKeys.memberPrefix(code))) kind = "member";
        else if (key.startsWith(circleKeys.entryPrefix(code))) kind = "entry";
        onChange({ key, kind, event: payload.eventType });
      }
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); } catch { /* noop */ }
  };
}
