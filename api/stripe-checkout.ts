// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Stripe Checkout API
//
// POST { userId, email, stripeCustomerId? }
// → Finds or creates a Stripe customer
// → Creates a hosted Checkout Session for the Pro monthly plan
// → Returns { url, customerId }
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY          sk_live_... or sk_test_...
//   STRIPE_PRICE_ID            price_... (Pro £5.99/month recurring)
//   SUPABASE_URL               same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role key
//   APP_URL                    https://tradrjournal.xyz
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

const APP_URL = process.env.APP_URL ?? "https://tradrjournal.xyz";

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-11-20.acacia" as any });
}

function supabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, email, stripeCustomerId } = req.body as {
      userId: string;
      email: string;
      stripeCustomerId?: string;
    };

    if (!userId || !email) {
      return res.status(400).json({ error: "userId and email are required" });
    }

    const s = stripe();
    const db = supabase();

    // Find or create Stripe customer
    let customerId = stripeCustomerId ?? "";

    if (!customerId) {
      // Check if we already stored one in Supabase
      const { data: kvRow } = await db
        .from("user_kv")
        .select("value")
        .eq("uid", userId)
        .eq("key", "tradr_stripe_customer")
        .maybeSingle();

      if (kvRow?.value) {
        try { customerId = JSON.parse(kvRow.value).customerId ?? ""; } catch {}
      }
    }

    if (!customerId) {
      const customer = await s.customers.create({ email, metadata: { userId } });
      customerId = customer.id;
      await db.from("user_kv").upsert({
        uid: userId,
        key: "tradr_stripe_customer",
        value: JSON.stringify({ customerId }),
      });
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
  } catch (err: any) {
    console.error("[stripe-checkout]", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
}
