// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Stripe Checkout API
//
// POST { userId, email, billing?, stripeCustomerId?, promoCode? }
// → Verifies the caller's Supabase JWT (Authorization: Bearer <token>)
// → Finds or creates a Stripe customer
// → Creates a hosted Checkout Session
// → Returns { url, customerId }
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY               sk_live_... or sk_test_...
//   STRIPE_PRICE_ID_MONTHLY         price_... (£24.99/month recurring)
//   STRIPE_PRICE_ID_ANNUAL          price_... (£199/year recurring)
//   STRIPE_PROMO_CODE_ID_K0DA       promo_... (Stripe promotion code object ID for K0DA)
//   STRIPE_PROMO_CODE_ID_FOUNDERS   promo_... (founders lifetime code — 100% off forever)
//   STRIPE_PROMO_CODE_ID_BETA       promo_... (beta lifetime code — 100% off forever)
//   SUPABASE_URL                    same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY       Supabase → Settings → API → service_role key
//   APP_URL                         https://tradrjournal.xyz
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

// Minimal Vercel handler types (avoids pulling in @vercel/node).
type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown>; query: Record<string, string | string[] | undefined> };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void; setHeader(k: string, v: string): void };

const APP_URL = process.env.APP_URL ?? "https://tradrjournal.xyz";

// Known promo codes — validated server-side before applying Stripe discount.
// Key = human-readable code (uppercase), value = env var that holds the Stripe promo_xxx ID.
const PROMO_CODE_MAP: Record<string, string | undefined> = {
  K0DA:     process.env.STRIPE_PROMO_CODE_ID_K0DA,
  FOUNDERS: process.env.STRIPE_PROMO_CODE_ID_FOUNDERS,
  BETA:     process.env.STRIPE_PROMO_CODE_ID_BETA,
};

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

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error("STRIPE_SECRET_KEY not configured"), { status: 500 });
  return new Stripe(key, { apiVersion: "2024-11-20.acacia" as any });
}

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function verifyToken(req: Req): Promise<{ id: string; email?: string }> {
  const auth = (req.headers["authorization"] as string | undefined) ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw Object.assign(new Error("Missing auth token"), { status: 401 });
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  return user;
}

export default async function handler(req: Req, res: Res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ── Env var preflight ────────────────────────────────────────────────────
    // Check price IDs before doing anything that has side effects.
    const monthlyPriceId = process.env.STRIPE_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRICE_ID ?? "";
    const annualPriceId  = process.env.STRIPE_PRICE_ID_ANNUAL  ?? "";
    if (!monthlyPriceId) {
      return res.status(500).json({ error: "STRIPE_PRICE_ID_MONTHLY not configured" });
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    let authedUser: { id: string; email?: string };
    try {
      authedUser = await verifyToken(req);
    } catch (e: unknown) {
      const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : 401;
      const message = e instanceof Error ? e.message : "Auth failed";
      return res.status(status).json({ error: message });
    }

    const { userId, email, billing = "monthly", stripeCustomerId, promoCode } = req.body as {
      userId: string;
      email: string;
      billing?: "monthly" | "annual";
      stripeCustomerId?: string;
      promoCode?: string;
    };

    if (!userId || !email) return res.status(400).json({ error: "userId and email are required" });
    if (authedUser.id !== userId) return res.status(403).json({ error: "Forbidden" });

    // Validate billing param
    if (billing === "annual" && !annualPriceId) {
      return res.status(500).json({ error: "STRIPE_PRICE_ID_ANNUAL not configured" });
    }
    const priceId = billing === "annual" ? annualPriceId : monthlyPriceId;

    const s = getStripe();
    const db = supabaseAdmin();

    // ── Find or create Stripe customer ───────────────────────────────────────
    let customerId = stripeCustomerId ?? "";
    if (!customerId) {
      const { data: kvRow } = await db
        .from("user_kv")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "koda_stripe_customer")
        .maybeSingle();
      if (kvRow?.value) {
        try { customerId = JSON.parse(kvRow.value).customerId ?? ""; } catch { /* ignore */ }
      }
    }
    if (!customerId) {
      const customer = await s.customers.create({ email, metadata: { userId } });
      customerId = customer.id;
      await db.from("user_kv").upsert(
        { user_id: userId, key: "koda_stripe_customer", value: JSON.stringify({ customerId }) },
        { onConflict: "user_id,key" }
      );
    }

    // ── Resolve promo code → Stripe promotion code object ID ────────────────
    let discounts: { promotion_code: string }[] | undefined;
    let allowPromoCodes = true;
    if (promoCode) {
      const normalized = promoCode.trim().toUpperCase();
      const stripePromoId = PROMO_CODE_MAP[normalized];
      if (stripePromoId) {
        discounts = [{ promotion_code: stripePromoId }];
        allowPromoCodes = false; // pre-applied — disable the Stripe field to avoid confusion

        // Log promo code usage to Supabase (fire-and-forget)
        db.from("user_kv").upsert(
          {
            user_id: userId,
            key: "koda_promo_applied",
            value: JSON.stringify({
              promoCode: normalized,
              planSelected: billing,
              appliedAt: new Date().toISOString(),
            }),
          },
          { onConflict: "user_id,key" }
        ).then(() => {}, () => {});
      }
    }

    // ── Create Checkout Session ───────────────────────────────────────────────
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}?upgraded=1&cid=${customerId}`,
      cancel_url: `${APP_URL}?paywall=1`,
      client_reference_id: userId,
      subscription_data: { metadata: { userId } },
      ...(discounts ? { discounts } : { allow_promotion_codes: allowPromoCodes }),
    });

    res.json({ url: session.url, customerId });
  } catch (err: unknown) {
    console.error("[stripe-checkout]", err);
    const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
