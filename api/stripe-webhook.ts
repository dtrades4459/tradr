// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Stripe Webhook
//
// Verifies Stripe signature, then:
//   checkout.session.completed     → sets profile.plan = "pro"
//   customer.subscription.deleted  → sets profile.plan = "free"
//   invoice.payment_failed         → logs only (Stripe handles retries)
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET    whsec_... from Stripe Dashboard → Webhooks
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// IMPORTANT: Add this endpoint in Stripe Dashboard → Webhooks:
//   URL: https://tradrjournal.xyz/api/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Must disable body parsing — Stripe needs the raw body to verify the signature
export const config = { runtime: "nodejs", api: { bodyParser: false } };

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-11-20.acacia" as any });
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function rawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function setUserPlan(userId: string, plan: "free" | "pro") {
  const db = getSupabase();
  const { data } = await db
    .from("user_kv")
    .select("value")
    .eq("uid", userId)
    .eq("key", "tradr_profile")
    .maybeSingle();

  if (!data?.value) {
    console.warn("[webhook] No profile for userId:", userId);
    return;
  }

  const profile = JSON.parse(data.value);
  profile.plan = plan;

  await db.from("user_kv").upsert({
    uid: userId,
    key: "tradr_profile",
    value: JSON.stringify(profile),
  });
  console.log(`[webhook] plan=${plan} set for userId=${userId}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"] as string;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });

  let event: Stripe.Event;
  try {
    const body = await rawBody(req);
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("[webhook] Bad signature:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const uid = s.client_reference_id ?? (s.metadata?.userId ?? "");
      if (uid) await setUserPlan(uid, "pro");
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.userId ?? "";
      if (uid) await setUserPlan(uid, "free");
    } else if (event.type === "invoice.payment_failed") {
      const inv = event.data.object as Stripe.Invoice;
      console.warn("[webhook] Payment failed, customer:", (inv as any).customer);
    }
  } catch (err: any) {
    console.error("[webhook] Handler error:", err);
    return res.status(500).json({ error: "Handler error" });
  }

  res.json({ received: true });
}
