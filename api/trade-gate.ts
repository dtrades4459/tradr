// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · POST /api/trade-gate
//
// Server-side enforcement of the 20-trade limit for free-tier users.
// Reads plan from JWT app_metadata (server-verified, not forgeable from client).
// Counts live rows in public.trades for the user.
//
// Returns:
//   { allowed: true }                                 — user may save
//   { allowed: false, reason: "trade_limit", count }  — limit reached
//
// Required Vercel env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import { getUserIdFromJwt, getAdminClient } from "./lib/supabaseAdmin.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void; setHeader(k: string, v: string): void };

const FREE_TRADE_LIMIT = 20;

const ALLOWED_ORIGINS = new Set([
  "https://tradrjournal.xyz",
  "https://www.tradrjournal.xyz",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: Req, res: Res) {
  const origin = (req.headers["origin"] as string | undefined) ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://tradrjournal.xyz";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: Req, res: Res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserIdFromJwt(req.headers["authorization"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const admin = getAdminClient();

  // Read plan from server-verified JWT app_metadata — immune to client-side manipulation
  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) return res.status(401).json({ error: "User not found" });

  const plan = (authData.user.app_metadata?.plan ?? "free") as string;
  if (plan === "pro" || plan === "elite") {
    return res.status(200).json({ allowed: true });
  }

  // Count rows server-side — client can't manipulate this
  const { count, error: countErr } = await admin
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countErr) {
    console.error("[trade-gate] count error:", countErr);
    return res.status(500).json({ error: "Internal error" });
  }

  const tradeCount = count ?? 0;
  if (tradeCount >= FREE_TRADE_LIMIT) {
    return res.status(200).json({ allowed: false, reason: "trade_limit", count: tradeCount });
  }

  return res.status(200).json({ allowed: true, count: tradeCount });
}
