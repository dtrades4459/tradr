// api/cron/weekly-recap.ts
// Runs Sunday 20:00 UTC — sends weekly recap email to each user with trades this week.

export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { sendEmail, weeklyRecapHtml } from "../lib/email.js";

type VercelRequest  = { method?: string; headers: Record<string, string | string[] | undefined>; query: Record<string, string | string[] | undefined> };
type VercelResponse = { status(n: number): VercelResponse; json(d: unknown): VercelResponse; end(): void };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface KodaProfile {
  email?: string;
  name?: string;
  email_weekly_recap?: boolean;
}

interface TradeRecord {
  date: string;
  outcome?: string;
  rr?: number;
  setup?: string;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Get the ISO week label (e.g. "Week 22")
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 7 : now.getDay())); // Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekLabel = `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Query all users who have weekly recap enabled (default true)
  const { data: profiles, error } = await supabase
    .from("user_kv")
    .select("user_id, value")
    .eq("key", "koda_profile")
    .not("value->>email", "is", null);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const row of profiles ?? []) {
    const profile = row.value as KodaProfile;
    if (profile.email_weekly_recap === false) continue;
    if (!profile.email) continue;

    // Get this user's trades from the past 7 days
    const since = startOfWeek.toISOString().slice(0, 10);
    const { data: trades } = await supabase
      .from("user_kv")
      .select("value")
      .eq("user_id", row.user_id)
      .eq("key", "koda_trades")
      .maybeSingle();

    const allTrades: TradeRecord[] = Array.isArray(trades?.value) ? (trades.value as TradeRecord[]) : [];
    const weekTrades = allTrades.filter((t) => t.date >= since);
    if (weekTrades.length === 0) continue;

    const wins = weekTrades.filter((t) => t.outcome === "win").length;
    const winRate = Math.round((wins / weekTrades.length) * 100);
    const netR = weekTrades.reduce((s: number, t) => s + (t.rr ?? 0), 0);

    // Best setup by frequency
    const setupCounts: Record<string, number> = {};
    weekTrades.forEach((t) => { if (t.setup) setupCounts[t.setup] = (setupCounts[t.setup] ?? 0) + 1; });
    const bestSetup = Object.entries(setupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    try {
      await sendEmail({
        to: profile.email,
        subject: `Your Kōda recap: ${netR >= 0 ? "+" : ""}${netR.toFixed(1)}R this week`,
        html: weeklyRecapHtml({
          name: profile.name?.split(" ")[0] ?? "Trader",
          netR: parseFloat(netR.toFixed(1)),
          winRate,
          bestSetup,
          tradeCount: weekTrades.length,
          weekLabel,
        }),
      });
      sent++;
    } catch (e) {
      console.error("Email send failed for user", row.user_id, e);
    }
  }

  return res.status(200).json({ sent });
}
