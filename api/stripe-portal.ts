// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Stripe Customer Portal
//
// POST { stripeCustomerId }
// → Verifies the caller's Supabase JWT (Authorization: Bearer <token>)
// → Confirms the caller owns the given stripeCustomerId (via user_kv lookup)
// → Creates a Billing Portal session
// → Returns { url }
//
// Lets Pro users manage or cancel their subscription.
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL               same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role key
//   APP_URL                    https://tradrjournal.xyz
//
// IMPORTANT: Enable the Customer Portal in Stripe Dashboard → Billing → Portal.
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const APP_URL = process.env.APP_URL ?? "https://tradrjournal.xyz";

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "https://tradrjournal.xyz",
  "https://www.tradrjournal.xyz",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: any, res: any) {
  const origin = req.headers["origin"] ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://tradrjournal.xyz";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Service-role client — bypasses RLS for server-side reads
function supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── JWT verification helper ───────────────────────────────────────────────────
async function verifyToken(req: any): Promise<{ id: string; email?: string }> {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw Object.assign(new Error("Missing auth token"), { status: 401 });

  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  return user;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ── Auth: verify the caller is who they say they are ─────────────────────
    let authedUser: { id: string; email?: string };
    try {
      authedUser = await verifyToken(req);
    } catch (e: any) {
      return res.status(e.status ?? 401).json({ error: e.message });
    }

    const { stripeCustomerId, returnPath } = req.body as { stripeCustomerId: string; returnPath?: string };
    if (!stripeCustomerId) return res.status(400).json({ error: "stripeCustomerId required" });

    // Guard: confirm the authenticated user owns this Stripe customer ID
    const db = supabaseAdmin();
    const { data: kvRow } = await db
      .from("user_kv")
      .select("value")
      .eq("user_id", authedUser.id)
      .eq("key", "koda_stripe_customer")
      .maybeSingle();

    let storedCustomerId = "";
    if (kvRow?.value) {
      try { storedCustomerId = JSON.parse(kvRow.value).customerId ?? ""; } catch { /* ignore */ }
    }

    if (storedCustomerId !== stripeCustomerId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    const s = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });
    // Validate returnPath is a relative path (no protocol, starts with /) to prevent open redirect
    const safeReturn = returnPath && /^\/[^/]/.test(returnPath) && !returnPath.includes("://")
      ? returnPath
      : "/";
    const session = await s.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: APP_URL + safeReturn,
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    console.error("[stripe-portal]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}
