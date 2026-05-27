// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · profile data layer (v2)
//
// One row per user against public.profiles. Replaces koda_profile in user_kv
// AND koda_profile_pub_<handle> in shared_kv (split across is_public flag).
//
// NOT WIRED INTO Koda.tsx YET. Safe to ship.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "../lib/supabase";
import { log } from "../lib/log";

export interface Profile {
  userId: string;
  handle: string;             // citext — unique
  name: string;
  avatar: string;
  bio: string;
  broker: string;
  timezone: string;
  memberCode: string;
  isPublic: boolean;
  publicTrades: boolean;
  onboarded: boolean;
  prefs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function fromRow(r: any): Profile {
  return {
    userId: r.user_id,
    handle: String(r.handle ?? ""),
    name: r.name ?? "",
    avatar: r.avatar ?? "",
    bio: r.bio ?? "",
    broker: r.broker ?? "",
    timezone: r.timezone ?? "UTC",
    memberCode: r.member_code ?? "",
    isPublic: Boolean(r.is_public),
    publicTrades: Boolean(r.public_trades),
    onboarded: Boolean(r.onboarded),
    prefs: r.prefs ?? {},
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

function toRow(p: Partial<Profile> & { userId: string }): Record<string, unknown> {
  return {
    user_id: p.userId,
    handle: p.handle?.toLowerCase().replace(/^@/, ""),
    name: p.name ?? "",
    avatar: p.avatar ?? "",
    bio: p.bio ?? "",
    broker: p.broker ?? "",
    timezone: p.timezone ?? "UTC",
    member_code: p.memberCode ?? "",
    is_public: p.isPublic ?? false,
    public_trades: p.publicTrades ?? false,
    onboarded: p.onboarded ?? false,
    prefs: p.prefs ?? {},
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    log.error("profile.getProfile", error, { userId });
    return null;
  }
  return data ? fromRow(data) : null;
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const norm = handle.toLowerCase().replace(/^@/, "");
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("handle", norm)
    .eq("is_public", true)
    .maybeSingle();
  if (error) {
    log.error("profile.getProfileByHandle", error, { handle: norm });
    return null;
  }
  return data ? fromRow(data) : null;
}

export async function upsertProfile(p: Partial<Profile> & { userId: string }): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(toRow(p), { onConflict: "user_id" })
    .select()
    .single();
  if (error) {
    log.error("profile.upsertProfile", error, { userId: p.userId });
    return null;
  }
  return fromRow(data);
}
