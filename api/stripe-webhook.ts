// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Stripe Webhook
//
// Verifies Stripe signature, then:
//   checkout.session.completed       → plan = "pro"; stores subscription_id + customer_id
//   customer.subscription.updated    → re-evaluates active/cancelled state
//   customer.subscription.deleted    → plan = "free"
//   invoice.paid                     → sends receipt email via Resend
//   invoice.payment_failed           → logs only (Stripe handles retries)
//
// Plan is written to TWO places on every event so plan gating is server-enforced:
//   1. user_kv koda_profile blob  — persisted source of truth, synced to client
//   2. Supabase auth app_metadata  — embedded in the JWT so serverless functions
//      can verify plan from the Bearer token without a DB round-trip
//
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET    whsec_... from Stripe Dashboard → Webhooks
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// IMPORTANT: Add this endpoint in Stripe Dashboard → Webhooks:
//   URL: https://tradrjournal.xyz/api/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted, invoice.paid, invoice.payment_failed
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, receiptHtml } from "./lib/email.js";

// Must disable body parsing — Stripe needs the raw body to verify the signature
export const config = { runtime: "nodejs", api: { bodyParser: false } };

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2024-11-20.acacia" as any });
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

async function setUserPlan(
  userId: string,
  plan: "free" | "pro",
  extras?: { subscriptionId?: string; customerId?: string }
) {
  const db = getSupabase();

  // ── 1. Update koda_profile KV blob ─────────────────────────────────────────
  const { data } = await db
    .from("user_kv")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "koda_profile")
    .maybeSingle();

  if (!data?.value) {
    console.warn("[webhook] No profile for userId:", userId);
    // Still stamp app_metadata so the JWT reflects the plan even if the KV row
    // hasn't been created yet (edge case: purchase before onboarding completes).
  } else {
    let profile: Record<string, unknown>;
    try { profile = JSON.parse(data.value); } catch { profile = {}; }
    profile.plan = plan;
    await db.from("user_kv").upsert(
      { user_id: userId, key: "koda_profile", value: JSON.stringify(profile) },
      { onConflict: "user_id,key" }
    );
  }

  // ── 2. Store subscription + customer IDs in user_kv ─────────────────────────
  if (extras?.subscriptionId || extras?.customerId) {
    const { data: stripeKv } = await db
      .from("user_kv")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "koda_stripe_customer")
      .maybeSingle();

    let existing: Record<string, string> = {};
    if (stripeKv?.value) {
      try { existing = JSON.parse(stripeKv.value); } catch { /* ignore */ }
    }
    const updated = {
      ...existing,
      ...(extras.customerId ? { customerId: extras.customerId } : {}),
      ...(extras.subscriptionId ? { subscriptionId: extras.subscriptionId } : {}),
    };
    await db.from("user_kv").upsert(
      { user_id: userId, key: "koda_stripe_customer", value: JSON.stringify(updated) },
      { onConflict: "user_id,key" }
    );
  }

  // ── 3. Stamp plan into auth app_metadata (server-enforced JWT claim) ─────────
  const { error: metaErr } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { plan },
  });
  if (metaErr) {
    console.error("[webhook] app_metadata update failed:", metaErr.message);
  }

  console.log(`[webhook] plan=${plan} set for userId=${userId}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  // ── Env preflight ─────────────────────────────────────────────────────────
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[webhook] STRIPE_SECRET_KEY not configured");
    return res.status(500).json({ error: "Stripe not configured" });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const sig = req.headers["stripe-signature"] as string;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });

  let event: Stripe.Event;
  try {
    const body = await rawBody(req);
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[webhook] Bad signature:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const uid = s.client_reference_id ?? (s.metadata?.userId ?? "");
      if (!uid) {
        console.error("[webhook] checkout.session.completed: missing userId — session:", s.id, "customer:", s.customer);
      } else {
        await setUserPlan(uid, "pro", {
          subscriptionId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
          customerId: typeof s.customer === "string" ? s.customer : s.customer?.id,
        });
      }

    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.userId ?? "";
      if (!uid) {
        console.error("[webhook] customer.subscription.updated: missing userId — sub:", sub.id, "status:", sub.status);
      } else {
        const plan = ["active", "trialing", "past_due"].includes(sub.status) ? "pro" : "free";
        await setUserPlan(uid, plan, { subscriptionId: sub.id });
      }

    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.userId ?? "";
      if (!uid) {
        console.error("[webhook] customer.subscription.deleted: missing userId — sub:", sub.id);
      } else {
        await setUserPlan(uid, "free", { subscriptionId: sub.id });
      }

    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const db = getSupabase();

      // Look up user by Stripe customer ID
      const { data: kvRow } = await db
        .from("user_kv")
        .select("user_id, value")
        .eq("key", "koda_stripe_customer")
        .eq("value->>customerId", customerId)
        .maybeSingle();

      if (kvRow) {
        const { data: profileRow } = await db
          .from("user_kv")
          .select("value")
          .eq("user_id", kvRow.user_id)
          .eq("key", "koda_profile")
          .maybeSingle();

        const profile = profileRow?.value as { email?: string; name?: string; plan?: string } | undefined;
        if (profile?.email) {
          const amount = `$${(invoice.amount_paid / 100).toFixed(2)}`;
          const date = new Date(invoice.created * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          const plan = profile.plan === "elite" ? "Elite" : "Pro";
          await sendEmail({
            to: profile.email,
            subject: `Receipt from Kōda — ${amount}`,
            html: receiptHtml({ name: profile.name?.split(" ")[0] ?? "Trader", plan, amount, date }),
          });
        }
      }

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
