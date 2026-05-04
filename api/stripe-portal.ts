// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Stripe Customer Portal
//
// POST { stripeCustomerId }
// → Creates a Billing Portal session
// → Returns { url }
//
// Lets Pro users manage or cancel their subscription.
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY
//   APP_URL
//
// IMPORTANT: Enable the Customer Portal in Stripe Dashboard → Billing → Portal.
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";

export const config = { runtime: "nodejs" };

const APP_URL = process.env.APP_URL ?? "https://tradrjournal.xyz";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { stripeCustomerId } = req.body as { stripeCustomerId: string };
    if (!stripeCustomerId) return res.status(400).json({ error: "stripeCustomerId required" });

    const s = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-11-20.acacia" as any });
    const session = await s.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: APP_URL,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe-portal]", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
}
