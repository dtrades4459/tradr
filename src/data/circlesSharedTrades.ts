// src/data/circlesSharedTrades.ts
import { supabase } from "../lib/supabase";
import { log } from "../lib/log";
import type { SharedTrade, Trade, Profile } from "../types";

export async function shareTrade(
  circleCode: string,
  author: Pick<Profile, "name" | "handle" | "avatar" | "code">,
  trade: Trade
): Promise<"ok" | "duplicate" | "error"> {
  const side = trade.direction === "short" ? "short" : "long";
  const rawOutcome = (trade.outcome || "").toLowerCase();
  const outcome = (["win", "loss", "be"].includes(rawOutcome) ? rawOutcome : "loss") as "win" | "loss" | "be";
  if (!author.code) {
    log.error("circlesSharedTrades.shareTrade", new Error("author.code is required"), { circleCode });
    return "error";
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("circle_shared_trades").insert({
    circle_code: circleCode,
    author_code: author.code ?? "",
    author_uid: user?.id ?? null,
    author_name: author.name,
    author_handle: author.handle,
    author_avatar: author.avatar,
    trade_id: String(trade.id),
    pair: trade.pair,
    side,
    outcome,
    pnl: parseFloat(trade.pnlDollar || trade.pnl || "0") || 0,
    rr: trade.rr ? parseFloat(trade.rr) || null : null,
    strategy: trade.strategy || null,
    notes: trade.notes || null,
    screenshot: trade.screenshot || null,
    date: trade.date,
  });
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  log.error("circlesSharedTrades.shareTrade", error, { circleCode });
  return "error";
}

export async function fetchSharedTrades(
  circleCode: string,
  limit = 50,
  before?: string
): Promise<SharedTrade[]> {
  let q = supabase
    .from("circle_shared_trades")
    .select("*")
    .eq("circle_code", circleCode)
    .order("shared_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("shared_at", before);
  const { data, error } = await q;
  if (error) { log.error("circlesSharedTrades.fetchSharedTrades", error, { circleCode }); return []; }
  return (data ?? []).map(rowToSharedTrade);
}

export async function reactToSharedTrade(
  tradeId: string,
  emoji: string,
  memberCode: string
): Promise<void> {
  const { error } = await supabase.rpc("toggle_trade_reaction", {
    p_trade_id: tradeId,
    p_emoji: emoji,
    p_member_code: memberCode,
  });
  if (error) log.error("circlesSharedTrades.reactToSharedTrade", error, { tradeId, emoji });
}

export function rowToSharedTrade(row: Record<string, unknown>): SharedTrade {
  return {
    id: row.id as string,
    circleCode: row.circle_code as string,
    authorCode: row.author_code as string,
    authorName: row.author_name as string,
    authorHandle: row.author_handle as string,
    authorAvatar: row.author_avatar as string,
    tradeId: row.trade_id as string,
    pair: row.pair as string,
    side: row.side as "long" | "short",
    outcome: row.outcome as "win" | "loss" | "be",
    pnl: row.pnl as number,
    rr: (row.rr as number | null) ?? null,
    strategy: (row.strategy as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    screenshot: (row.screenshot as string | null) ?? null,
    date: row.date as string,
    sharedAt: row.shared_at as string,
    reactions: (row.reactions ?? {}) as Record<string, string[]>,
  };
}
