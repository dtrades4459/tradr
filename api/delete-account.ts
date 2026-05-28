// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · POST /api/delete-account
//
// Permanently deletes a user and ALL their data. Service-role only — the
// browser cannot do this work because it doesn't have permission to drop rows
// in public.trades, broker_connections, sync_events, or to delete auth.users.
//
// Flow (best-effort, order matters):
//   1. Verify the caller's JWT — must be the user they're deleting
//   2. Cancel any active Stripe subscription (so they stop being billed)
//   3. Delete broker_connections (encrypted tokens — privacy + security)
//   4. Delete sync_events (audit log of broker syncs — personal data)
//   5. Delete public.trades (v2 trade history including auto-synced fills)
//   6. Delete public.profiles (v2 profile if newProfile flag was used)
//   7. Delete all user_kv rows for this user (legacy KV: profile, trades, etc.)
//   8. Delete shared_kv rows the user owns (public profile, feed, handle)
//   9. Delete the auth.users row (final — invalidates the JWT)
//
// Each step swallows its own error so a failure in one table doesn't strand
// data in others. The auth.users delete is the only one that must succeed —
// if it doesn't, the user can sign back in and try again.
//
// Required Vercel environment variables:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_SECRET_KEY  (optional — only needed if user has an active sub)
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { getAdminClient, getUserIdFromJwt } from "./lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};
type Res = {
  status(n: number): Res;
  json(d: unknown): Res;
  end(): void;
  setHeader(k: string, v: string): void;
};

const APP_URL = process.env.APP_URL ?? "https://tradrjournal.xyz";
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  APP_URL.replace("://", "://www."),
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: Req, res: Res) {
  const origin = (req.headers["origin"] as string | undefined) ?? "";
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : APP_URL);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function cancelStripeSubscriptionIfAny(db: ReturnType<typeof getAdminClient>, userId: string) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return; // Stripe not configured — skip

  const { data: kv } = await db
    .from("user_kv")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "koda_stripe_customer")
    .maybeSingle();

  if (!kv?.value) return;

  let parsed: { subscriptionId?: string; customerId?: string };
  try {
    parsed = typeof kv.value === "string" ? JSON.parse(kv.value) : kv.value;
  } catch {
    return;
  }

  if (!parsed.subscriptionId) return;

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    await stripe.subscriptions.cancel(parsed.subscriptionId);
  } catch (e) {
    // Already cancelled / not found / network — swallow so the rest of the
    // delete proceeds. The user wants to be gone; Stripe state we can reconcile
    // later if needed.
    console.warn("[delete-account] Stripe cancel failed:", (e as Error).message);
  }
}

export default async function handler(req: Req, res: Res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserIdFromJwt(req.headers["authorization"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorised" });

  const db = getAdminClient();

  // 1. Cancel any active Stripe subscription (best-effort)
  await cancelStripeSubscriptionIfAny(db, userId);

  // 2. Look up user handle so we can wipe their shared_kv public profile row.
  let handle = "";
  try {
    const { data } = await db
      .from("user_kv")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "koda_profile")
      .maybeSingle();
    if (data?.value) {
      const profile = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      handle = (profile.handle ?? "").replace(/^@/, "").toLowerCase();
    }
  } catch {
    // best-effort
  }

  // 3. Delete from each table — each step swallows its own error.
  const results: Record<string, string> = {};
  const tableDeletes: { name: string; table: string; col: string }[] = [
    { name: "broker_connections", table: "broker_connections", col: "user_id" },
    { name: "sync_events",        table: "sync_events",        col: "user_id" },
    { name: "trades",             table: "trades",              col: "user_id" },
    { name: "profiles",           table: "profiles",            col: "id"      },
    { name: "user_kv",            table: "user_kv",             col: "user_id" },
  ];

  for (const { name, table, col } of tableDeletes) {
    try {
      const { error } = await db.from(table).delete().eq(col, userId);
      results[name] = error ? `err: ${error.message}` : "ok";
    } catch (e) {
      results[name] = `err: ${(e as Error).message}`;
    }
  }

  // 4. Shared_kv public-profile + feed + handle index (best-effort)
  if (handle) {
    try {
      await db.from("shared_kv").delete().eq("key", `koda_profile_pub_${handle}`);
      await db.from("shared_kv").delete().eq("key", `koda_handle_${handle}`);
      results["shared_kv_handle"] = "ok";
    } catch (e) {
      results["shared_kv_handle"] = `err: ${(e as Error).message}`;
    }
  }
  try {
    // Feed key uses the user's circle-member code, derived from uid. Best-effort
    // delete any row keyed by that pattern. owner_id is the cleanest signal.
    await db.from("shared_kv").delete().eq("owner_id", userId);
    results["shared_kv_owned"] = "ok";
  } catch (e) {
    results["shared_kv_owned"] = `err: ${(e as Error).message}`;
  }

  // 5. Finally, delete the auth.users row. This invalidates all JWTs and is
  // the only step we surface as a failure to the client.
  try {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) {
      console.error("[delete-account] auth.users delete failed:", error.message, "results:", results);
      return res.status(500).json({ error: "Auth user deletion failed", details: results });
    }
  } catch (e) {
    console.error("[delete-account] auth.users delete threw:", (e as Error).message, "results:", results);
    return res.status(500).json({ error: "Auth user deletion failed" });
  }

  console.log("[delete-account] uid=" + userId + " purged:", results);
  res.json({ ok: true });
}
