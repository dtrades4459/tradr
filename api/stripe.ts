// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · /api/stripe?action=checkout | portal | webhook
//
// Merges stripe-checkout.ts + stripe-portal.ts + stripe-webhook.ts into one
// function to stay within the Vercel Hobby 12-function limit.
//
// bodyParser MUST be false so the webhook branch can read the raw body for
// Stripe signature verification. checkout/portal branches parse JSON manually.
//
// IMPORTANT: Update Stripe Dashboard → Webhooks URL to:
//   https://kodatrade.co.uk/api/stripe?action=webhook
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs", api: { bodyParser: false } };

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, receiptHtml } from "./lib/email.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown>; query: Record<string, string | string[] | undefined>; on(event: string, cb: (chunk: Buffer) => void): Req };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void; setHeader(k: string, v: string): void };

const APP_URL = process.env.APP_URL ?? "https://kodatrade.co.uk";

const ALLOWED_ORIGINS = new Set([
  APP_URL,
  APP_URL.replace("://", "://www."),
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: Req, res: Res) {
  const origin = (req.headers["origin"] as string | undefined) ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
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
  const auth  = (req.headers["authorization"] as string | undefined) ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw Object.assign(new Error("Missing auth token"), { status: 401 });
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  return user;
}

async function readBuffer(req: Req): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Promo code map ────────────────────────────────────────────────────────────

const PROMO_CODE_MAP: Record<string, string | undefined> = {
  K0DA:     process.env.STRIPE_PROMO_CODE_ID_K0DA,
  FOUNDERS: process.env.STRIPE_PROMO_CODE_ID_FOUNDERS,
  BETA_26:  process.env.STRIPE_PROMO_CODE_ID_BETA,
};

// ── Webhook: write user plan to KV + app_metadata ────────────────────────────

async function setUserPlan(
  userId: string,
  plan: "free" | "pro",
  extras?: { subscriptionId?: string; customerId?: string }
) {
  const db = supabaseAdmin();

  const { data } = await db
    .from("user_kv")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "koda_profile")
    .maybeSingle();

  if (!data?.value) {
    console.warn("[stripe/webhook] No profile for userId:", userId);
  } else {
    let profile: Record<string, unknown>;
    try { profile = JSON.parse(data.value); } catch { profile = {}; }
    profile.plan = plan;
    await db.from("user_kv").upsert(
      { user_id: userId, key: "koda_profile", value: JSON.stringify(profile) },
      { onConflict: "user_id,key" }
    );
  }

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
      ...(extras.customerId    ? { customerId:    extras.customerId    } : {}),
      ...(extras.subscriptionId ? { subscriptionId: extras.subscriptionId } : {}),
    };
    await db.from("user_kv").upsert(
      { user_id: userId, key: "koda_stripe_customer", value: JSON.stringify(updated) },
      { onConflict: "user_id,key" }
    );
  }

  const { error: metaErr } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { plan },
  });
  if (metaErr) console.error("[stripe/webhook] app_metadata update failed:", metaErr.message);

  console.log(`[stripe/webhook] plan=${plan} set for userId=${userId}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: checkout
// ══════════════════════════════════════════════════════════════════════════════

async function handleCheckout(req: Req, res: Res, body: Record<string, unknown>) {
  try {
    const monthlyPriceId = (process.env.STRIPE_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRICE_ID ?? "") as string;
    const annualPriceId  = (process.env.STRIPE_PRICE_ID_ANNUAL  ?? "") as string;
    if (!monthlyPriceId) return res.status(500).json({ error: "STRIPE_PRICE_ID_MONTHLY not configured" });

    let authedUser: { id: string; email?: string };
    try {
      authedUser = await verifyToken(req);
    } catch (e: unknown) {
      const status  = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : 401;
      const message = e instanceof Error ? e.message : "Auth failed";
      return res.status(status).json({ error: message });
    }

    const { userId, email, billing = "monthly", stripeCustomerId, promoCode } = body as {
      userId: string; email: string; billing?: "monthly" | "annual";
      stripeCustomerId?: string; promoCode?: string;
    };

    if (!userId || !email) return res.status(400).json({ error: "userId and email are required" });
    if (authedUser.id !== userId) return res.status(403).json({ error: "Forbidden" });

    if (billing === "annual" && !annualPriceId) {
      return res.status(500).json({ error: "STRIPE_PRICE_ID_ANNUAL not configured" });
    }
    const priceId = billing === "annual" ? annualPriceId : monthlyPriceId;

    const s  = getStripe();
    const db = supabaseAdmin();

    let customerId = (stripeCustomerId as string) ?? "";
    if (!customerId) {
      const { data: kvRow } = await db
        .from("user_kv").select("value")
        .eq("user_id", userId).eq("key", "koda_stripe_customer").maybeSingle();
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

    let discounts: { promotion_code: string }[] | undefined;
    let allowPromoCodes = true;
    if (promoCode) {
      const normalized  = (promoCode as string).trim().toUpperCase();
      const stripePromoId = PROMO_CODE_MAP[normalized];
      if (stripePromoId) {
        discounts = [{ promotion_code: stripePromoId }];
        allowPromoCodes = false;
        db.from("user_kv").upsert(
          {
            user_id: userId, key: "koda_promo_applied",
            value: JSON.stringify({ promoCode: normalized, planSelected: billing, appliedAt: new Date().toISOString() }),
          },
          { onConflict: "user_id,key" }
        ).then(() => {}, () => {});
      }
    }

    const session = await s.checkout.sessions.create({
      mode:                 "subscription",
      customer:             customerId,
      payment_method_types: ["card"],
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${APP_URL}?upgraded=1&cid=${customerId}`,
      cancel_url:           `${APP_URL}?paywall=1`,
      client_reference_id:  userId,
      subscription_data:    { metadata: { userId } },
      ...(discounts ? { discounts } : { allow_promotion_codes: allowPromoCodes }),
    });

    res.json({ url: session.url, customerId });
  } catch (err: unknown) {
    console.error("[stripe/checkout]", err);
    const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: portal
// ══════════════════════════════════════════════════════════════════════════════

async function handlePortal(req: Req, res: Res, body: Record<string, unknown>) {
  try {
    let authedUser: { id: string; email?: string };
    try {
      authedUser = await verifyToken(req);
    } catch (e: unknown) {
      const status  = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : 401;
      const message = e instanceof Error ? e.message : "Auth failed";
      return res.status(status).json({ error: message });
    }

    const { stripeCustomerId, returnPath } = body as { stripeCustomerId: string; returnPath?: string };
    if (!stripeCustomerId) return res.status(400).json({ error: "stripeCustomerId required" });

    const db = supabaseAdmin();
    const { data: kvRow } = await db
      .from("user_kv").select("value")
      .eq("user_id", authedUser.id).eq("key", "koda_stripe_customer").maybeSingle();

    let storedCustomerId = "";
    if (kvRow?.value) {
      try { storedCustomerId = JSON.parse(kvRow.value).customerId ?? ""; } catch { /* ignore */ }
    }

    if (storedCustomerId !== stripeCustomerId) return res.status(403).json({ error: "Forbidden" });

    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    const s         = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });
    const safeReturn = returnPath && /^\/[^/]/.test(returnPath as string) && !(returnPath as string).includes("://")
      ? returnPath as string : "/";
    const session = await s.billingPortal.sessions.create({
      customer:   stripeCustomerId,
      return_url: APP_URL + safeReturn,
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    console.error("[stripe/portal]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: webhook
// ══════════════════════════════════════════════════════════════════════════════

async function handleWebhook(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[stripe/webhook] STRIPE_SECRET_KEY not configured");
    return res.status(500).json({ error: "Stripe not configured" });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const sig = req.headers["stripe-signature"] as string;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });

  let event: Stripe.Event;
  try {
    const body = await readBuffer(req);
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] Bad signature:", msg);
    return res.status(400).json({ error: `Webhook error: ${msg}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s   = event.data.object as Stripe.Checkout.Session;
      const uid = s.client_reference_id ?? (s.metadata?.userId ?? "");
      if (!uid) {
        console.error("[stripe/webhook] checkout.session.completed: missing userId — session:", s.id);
      } else {
        await setUserPlan(uid, "pro", {
          subscriptionId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
          customerId:     typeof s.customer === "string"     ? s.customer     : s.customer?.id,
        });
      }

    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.userId ?? "";
      if (!uid) {
        console.error("[stripe/webhook] customer.subscription.updated: missing userId — sub:", sub.id);
      } else {
        const plan = ["active", "trialing", "past_due"].includes(sub.status) ? "pro" : "free";
        await setUserPlan(uid, plan as "pro" | "free", { subscriptionId: sub.id });
      }

    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.userId ?? "";
      if (!uid) {
        console.error("[stripe/webhook] customer.subscription.deleted: missing userId — sub:", sub.id);
      } else {
        await setUserPlan(uid, "free", { subscriptionId: sub.id });
      }

    } else if (event.type === "invoice.paid") {
      const invoice    = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const db         = supabaseAdmin();

      const { data: kvRow } = await db
        .from("user_kv").select("user_id, value")
        .eq("key", "koda_stripe_customer")
        .eq("value->>customerId", customerId)
        .maybeSingle();

      if (kvRow) {
        const { data: profileRow } = await db
          .from("user_kv").select("value")
          .eq("user_id", kvRow.user_id).eq("key", "koda_profile").maybeSingle();

        const profile = profileRow?.value as { email?: string; name?: string; plan?: string } | undefined;
        if (profile?.email) {
          const currencySymbol = ({ gbp: "£", usd: "$", eur: "€", aud: "A$", cad: "C$" } as Record<string, string>)[(invoice.currency ?? "gbp").toLowerCase()] ?? (invoice.currency ?? "").toUpperCase() + " ";
          const amount = `${currencySymbol}${(invoice.amount_paid / 100).toFixed(2)}`;
          const date   = new Date(invoice.created * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          const plan   = profile.plan === "elite" ? "Elite" : "Pro";
          await sendEmail({
            to:      profile.email,
            subject: `Receipt from Kōda — ${amount}`,
            html:    receiptHtml({ name: profile.name?.split(" ")[0] ?? "Trader", plan, amount, date }),
          });
        }
      }

    } else if (event.type === "invoice.payment_failed") {
      const inv = event.data.object as Stripe.Invoice;
      console.warn("[stripe/webhook] Payment failed, customer:", (inv as any).customer);
    }
  } catch (err: unknown) {
    console.error("[stripe/webhook] Handler error:", err);
    return res.status(500).json({ error: "Handler error" });
  }

  res.json({ received: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// Router
// ══════════════════════════════════════════════════════════════════════════════

export default async function handler(req: Req, res: Res) {
  const action = req.query?.action as string | undefined;

  // Webhook: Stripe calls this directly — no CORS needed, raw body required
  if (action === "webhook") return handleWebhook(req, res);

  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Parse body manually (bodyParser is disabled globally for raw webhook support)
  let body: Record<string, unknown> = {};
  try {
    const raw = await readBuffer(req);
    if (raw.length > 0) body = JSON.parse(raw.toString("utf-8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (action === "checkout") return handleCheckout(req, res, body);
  if (action === "portal")   return handlePortal(req, res, body);

  return res.status(400).json({ error: "?action= required: checkout | portal | webhook" });
}
