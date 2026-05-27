// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · trades data layer (v2)
//
// One row per trade against public.trades. Replaces the JSON-blob "koda_trades"
// stored in user_kv. Hand-rolled validation — no zod dep needed.
//
// THIS FILE IS NOT WIRED INTO Koda.tsx YET. It's safe to ship — nothing
// imports it. When ready, swap saveTrades/loadAll over behind a feature flag
// (see src/lib/flags.ts).
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "../lib/supabase";
import { log } from "../lib/log";

export type Outcome = "win" | "loss" | "be";

export interface Trade {
  id: number;                 // db bigserial — same number used as React key
  clientId?: string;          // legacy Date.now() id, kept across migration
  userId: string;
  pair: string;
  side?: string;
  date: string;               // YYYY-MM-DD
  session?: string;
  strategy: string;
  setup?: string;
  outcome: Outcome;
  entryPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  pnl: number;
  rr?: number;
  notes?: string;
  screenshots: string[];      // URLs only — not base64. See storage migration plan.
  reactions: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Validation (boundary only) ──────────────────────────────────────────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback?: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function asOutcome(v: unknown): Outcome {
  return v === "win" || v === "loss" || v === "be" ? v : "be";
}

function fromRow(r: any): Trade {
  return {
    id: Number(r.id),
    clientId: r.client_id ?? undefined,
    userId: r.user_id,
    pair: asString(r.pair),
    side: r.side ?? undefined,
    date: asString(r.date),
    session: r.session ?? undefined,
    strategy: asString(r.strategy),
    setup: r.setup ?? undefined,
    outcome: asOutcome(r.outcome),
    entryPrice: asNumber(r.entry_price),
    slPrice: asNumber(r.sl_price),
    tpPrice: asNumber(r.tp_price),
    pnl: asNumber(r.pnl, 0)!,
    rr: asNumber(r.rr),
    notes: r.notes ?? undefined,
    screenshots: Array.isArray(r.screenshots) ? r.screenshots.map(String) : [],
    reactions: r.reactions || {},
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
  };
}

function toRow(t: Partial<Trade> & { userId: string }): Record<string, unknown> {
  return {
    user_id: t.userId,
    client_id: t.clientId ?? null,
    pair: t.pair,
    side: t.side ?? null,
    date: t.date,
    session: t.session ?? null,
    strategy: t.strategy ?? "",
    setup: t.setup ?? null,
    outcome: t.outcome,
    entry_price: t.entryPrice ?? null,
    sl_price: t.slPrice ?? null,
    tp_price: t.tpPrice ?? null,
    pnl: t.pnl ?? 0,
    rr: t.rr ?? null,
    notes: t.notes ?? null,
    screenshots: t.screenshots ?? [],
    reactions: t.reactions ?? {},
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listTrades(userId: string, opts?: { limit?: number }): Promise<Trade[]> {
  const limit = opts?.limit ?? 1000;
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) {
    log.error("trades.listTrades", error, { userId });
    return [];
  }
  return (data ?? []).map(fromRow);
}

export async function listPublicTrades(targetUserId: string, opts?: { limit?: number }): Promise<Trade[]> {
  const limit = opts?.limit ?? 100;
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", targetUserId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) {
    log.error("trades.listPublicTrades", error, { targetUserId });
    return [];
  }
  return (data ?? []).map(fromRow);
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function upsertTrade(t: Partial<Trade> & { userId: string; pair: string; date: string; outcome: Outcome }): Promise<Trade | null> {
  const payload = toRow(t);
  // Use client_id as the upsert key when present so re-saves are idempotent
  // and the migration script doesn't double-insert.
  const conflict = t.clientId ? { onConflict: "user_id,client_id" } : undefined;
  const { data, error } = await supabase
    .from("trades")
    .upsert(payload, conflict)
    .select()
    .single();
  if (error) {
    log.error("trades.upsertTrade", error, { userId: t.userId, clientId: t.clientId });
    return null;
  }
  return fromRow(data);
}

export async function deleteTrade(userId: string, id: number): Promise<boolean> {
  const { error } = await supabase
    .from("trades")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    log.error("trades.deleteTrade", error, { userId, id });
    return false;
  }
  return true;
}

export async function deleteTradeByClientId(userId: string, clientId: string): Promise<boolean> {
  const { error } = await supabase
    .from("trades")
    .delete()
    .eq("user_id", userId)
    .eq("client_id", clientId);
  if (error) {
    log.error("trades.deleteTradeByClientId", error, { userId, clientId });
    return false;
  }
  return true;
}
