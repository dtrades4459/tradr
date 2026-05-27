// api/cron/complete-challenges.ts
// ── Vercel cron: runs every 5 min, closes expired challenges ──────────────────
// GET (scheduled): requires header x-cron-secret: <CRON_SECRET>

export const config = { runtime: "nodejs" };

import { getAdminClient, getUserIdFromJwt } from "../lib/supabaseAdmin.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void; setHeader(k: string, v: string): void };

const METRIC_LABELS: Record<string, string> = {
  dollar: "$ P&L", r: "R-multiple", winrate: "Win Rate", trades: "Trades", avgr: "Avg R",
};

function formatValue(metric: string, value: number): string {
  if (metric === "dollar") return `${value >= 0 ? "+" : ""}$${Math.abs(value).toFixed(0)}`;
  if (metric === "winrate") return `${value.toFixed(1)}%`;
  if (metric === "trades") return `${Math.round(value)}`;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function getMetricValue(entry: Record<string, number>, metric: string): number {
  if (metric === "dollar")  return entry.totalPnLDollar ?? entry.totalPnL ?? 0;
  if (metric === "r")       return entry.totalPnL ?? 0;
  if (metric === "winrate") return entry.winRate ?? 0;
  if (metric === "trades")  return entry.total ?? 0;
  if (metric === "avgr")    return entry.avgRR ?? 0;
  return 0;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "https://tradrjournal.xyz");
  res.setHeader("Vary", "Origin");

  // Cron calls use GET with the secret header
  if (req.method === "GET") {
    const secret = req.headers["x-cron-secret"];
    if (!secret || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else if (req.method === "POST") {
    // POST requires a valid Supabase JWT (manual trigger from authenticated UI)
    const userId = await getUserIdFromJwt(req.headers["authorization"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = getAdminClient();

  // 1. Find all active challenges that have expired
  const { data: expired, error: expErr } = await admin
    .from("circle_challenges")
    .select("*")
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString());

  if (expErr) {
    console.error("[complete-challenges] fetch error:", expErr);
    return res.status(500).json({ error: "fetch failed" });
  }
  if (!expired || expired.length === 0) {
    return res.status(200).json({ completed: 0 });
  }

  let completed = 0;

  for (const challenge of expired) {
    try {
      // 2. Get leaderboard entries for the circle from shared_kv
      const { data: entries } = await admin
        .from("shared_kv")
        .select("key, value")
        .like("key", `koda_circle_entry_${challenge.circle_code}_%`);

      if (!entries || entries.length === 0) {
        // No participants — just close it
        await admin.from("circle_challenges").update({ status: "completed" }).eq("id", challenge.id);
        completed++;
        continue;
      }

      // 3. Parse entries and find winner by metric
      // shared_kv.value is JSONB — Supabase returns it already parsed as an object.
      // Handle both cases: JSONB object (already parsed) and text string (fallback).
      const parsed = entries
        .map((e: { key: string; value: unknown }) => {
          if (e.value === null || e.value === undefined) return null;
          if (typeof e.value === "object") return e.value;
          if (typeof e.value === "string") {
            try { return JSON.parse(e.value); } catch { return null; }
          }
          return null;
        })
        .filter(Boolean) as Record<string, number>[];

      if (parsed.length === 0) {
        await admin.from("circle_challenges").update({ status: "completed" }).eq("id", challenge.id);
        completed++;
        continue;
      }

      let winner = parsed[0];
      let winnerVal = getMetricValue(winner, challenge.metric);
      for (const entry of parsed.slice(1)) {
        const val = getMetricValue(entry, challenge.metric);
        if (val > winnerVal) { winner = entry; winnerVal = val; }
      }

      // 4. Write result
      await admin.from("circle_challenge_results").insert({
        challenge_id: challenge.id,
        circle_code: challenge.circle_code,
        winner_code: winner.memberCode ?? "",
        winner_name: winner.name ?? "",
        winner_handle: winner.handle ?? "",
        winning_value: winnerVal,
      });

      // 5. Mark challenge completed
      await admin.from("circle_challenges").update({ status: "completed" }).eq("id", challenge.id);

      // 6. Post auto-message to circle chat
      const handle = winner.handle ? `@${winner.handle}` : (winner.name ?? "Unknown");
      const metricLabel = METRIC_LABELS[challenge.metric] ?? challenge.metric;
      const valStr = formatValue(challenge.metric, winnerVal);
      await admin.from("circle_messages").insert({
        circle_code: challenge.circle_code,
        sender_name: "Kōda",
        sender_handle: "koda",
        text: `🏆 Challenge over — ${handle} wins "${challenge.title}" · ${metricLabel}: ${valStr}`,
      });

      completed++;
    } catch (err) {
      console.error(`[complete-challenges] failed for challenge ${challenge.id}:`, err);
    }
  }

  return res.status(200).json({ completed });
}
