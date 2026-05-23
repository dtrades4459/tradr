// src/data/circlesChallenges.ts
import { supabase } from "../lib/supabase";
import { log } from "../lib/log";
import type { CircleChallenge, ChallengeResult } from "../types";

export async function createChallenge(
  circleCode: string,
  title: string,
  metric: CircleChallenge["metric"],
  endsAt: Date,
  createdBy: string
): Promise<CircleChallenge | null> {
  const { data, error } = await supabase
    .from("circle_challenges")
    .insert({ circle_code: circleCode, title, metric, ends_at: endsAt.toISOString(), created_by: createdBy, status: "active" })
    .select()
    .single();
  if (error) { log.error("circlesChallenges.createChallenge", error, { circleCode }); return null; }
  return rowToChallenge(data);
}

export async function fetchActiveChallenge(circleCode: string): Promise<CircleChallenge | null> {
  const { data, error } = await supabase
    .from("circle_challenges")
    .select("*")
    .eq("circle_code", circleCode)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { log.error("circlesChallenges.fetchActiveChallenge", error, { circleCode }); return null; }
  return data ? rowToChallenge(data) : null;
}

export async function fetchTrophies(circleCode: string): Promise<ChallengeResult[]> {
  const { data, error } = await supabase
    .from("circle_challenge_results")
    .select("*, challenge:challenge_id(title, metric, ends_at)")
    .eq("circle_code", circleCode)
    .order("snapshot_at", { ascending: false });
  if (error) { log.error("circlesChallenges.fetchTrophies", error, { circleCode }); return []; }
  return (data ?? []).map(rowToResult);
}

export async function fetchActiveChallengesToComplete(): Promise<CircleChallenge[]> {
  const { data, error } = await supabase
    .from("circle_challenges")
    .select("*")
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString());
  if (error) { log.error("circlesChallenges.fetchActiveChallengesToComplete", error); return []; }
  return (data ?? []).map(rowToChallenge);
}

function rowToChallenge(row: Record<string, unknown>): CircleChallenge {
  return {
    id: row.id as string,
    circleCode: row.circle_code as string,
    title: row.title as string,
    metric: row.metric as CircleChallenge["metric"],
    startedAt: row.started_at as string,
    endsAt: row.ends_at as string,
    createdBy: row.created_by as string,
    status: row.status as "active" | "completed",
  };
}

function rowToResult(row: Record<string, unknown>): ChallengeResult {
  const ch = row.challenge as Record<string, unknown> | null;
  return {
    id: row.id as string,
    challengeId: row.challenge_id as string,
    circleCode: row.circle_code as string,
    winnerCode: row.winner_code as string,
    winnerName: row.winner_name as string,
    winnerHandle: row.winner_handle as string,
    winningValue: row.winning_value as number,
    snapshotAt: row.snapshot_at as string,
    challenge: ch ? { title: ch.title as string, metric: ch.metric as CircleChallenge["metric"], endsAt: ch.ends_at as string } : undefined,
  };
}
