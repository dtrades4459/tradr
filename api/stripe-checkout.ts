// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Stripe Checkout API
//
// POST { userId, email, stripeCustomerId? }
// → Verifies the caller's Supabase JWT (Authorization: Bearer <token>)
// → Finds or creates a Stripe customer
// → Creates a hosted Checkout Session for the Pro monthly plan
// → Returns { url, customerId }
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY          sk_live_... or sk_test_...
//   STRIPE_PRICE_ID            price_... (Pro $24.99/month recurring)
//   SUPABASE_URL               same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role key
//   APP_URL                    https://tradrjournal.xyz
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

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion });
}

// Service-role client — used for reads/writes that bypass RLS (webhook, server-side only)
function supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── JWT verification helper ───────────────────────────────────────────────────
// Extracts the Bearer token from the Authorization header and verifies it with
// Supabase. Returns the authenticated user, or throws with a 401-friendly message.
async function verifyToken(req: any): Promise<{ id: string; email?: string }> {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw Object.assign(new Error("Missing auth token"), { status: 401 });

  // Use the anon key client to verify the JWT — getUser validates signature server-side
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

    const { userId, email, stripeCustomerId } = req.body as {
      userId: string;
      email: string;
      stripeCustomerId?: string;
    };

    if (!userId || !email) {
      return res.status(400).json({ error: "userId and email are required" });
    }

    // Guard: the authenticated user must match the requested userId
    if (authedUser.id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const s = stripe();
    const db = supabaseAdmin();

    // Find or create Stripe customer
    let customerId = stripeCustomerId ?? "";

    if (!customerId) {
      // Check if we already stored one in Supabase
      const { data: kvRow } = await db
        .from("user_kv")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "tradr_stripe_customer")
        .maybeSingle();

      if (kvRow?.value) {
        try { customerId = JSON.parse(kvRow.value).customerId ?? ""; } catch { /* ignore JSON parse error */ }
      }
    }

    if (!customerId) {
      const customer = await s.customers.create({ email, metadata: { userId } });
      customerId = customer.id;
      await db.from("user_kv").upsert({
        user_id: userId,
        key: "tradr_stripe_customer",
        value: JSON.stringify({ customerId }),
      }, { onConflict: "user_id,key" });
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({ error: "STRIPE_PRICE_ID not configured" });
    }

    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}?upgraded=1&cid=${customerId}`,
      cancel_url: `${APP_URL}?cancelled=1`,
      client_reference_id: userId,
      subscription_data: { metadata: { userId } },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, customerId });
  } catch (err: unknown) {
    console.error("[stripe-checkout]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}
