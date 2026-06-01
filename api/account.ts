// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · /api/account?action=reset-password | beta-unlock | join-waitlist | feedback | delete
//
// Merges reset-password.ts + feedback.ts + delete-account.ts into one function
// to stay within the Vercel Hobby 12-function limit.
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { checkRateLimit, getClientIp } from "./lib/rateLimit.js";
import { getAdminClient, getUserIdFromJwt } from "./lib/supabaseAdmin.js";
import { sendEmail, waitlistConfirmHtml } from "./lib/email.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown>; query: Record<string, string | string[] | undefined> };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void; setHeader(k: string, v: string): void };

const APP_URL          = process.env.APP_URL ?? "https://kodatrade.co.uk";
const USERNAME_DOMAIN  = "users.kodatrade.co.uk";

const ALLOWED_ORIGINS = new Set([
  APP_URL,
  APP_URL.replace("://", "://www."),
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: Req, res: Res) {
  const origin  = (req.headers["origin"] as string | undefined) ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function escapeMd(s: string): string {
  return String(s).replace(/[_*`[]/g, "\\$&");
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: reset-password
// ══════════════════════════════════════════════════════════════════════════════

async function handleResetPassword(req: Req, res: Res) {
  const ip      = getClientIp(req);
  const allowed = await checkRateLimit("reset_password", ip, { limit: 5, windowMs: 600_000 });
  if (!allowed) return res.status(429).json({ error: "Too many requests — try again later" });

  const { username } = req.body as { username?: string };
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  const u              = username.toLowerCase().trim();
  const syntheticEmail = `${u}@${USERNAME_DOMAIN}`;

  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authUser, error: lookupErr } = await admin
    .schema("auth")
    .from("users")
    .select("id, email, raw_user_meta_data")
    .eq("email", syntheticEmail)
    .maybeSingle();

  if (lookupErr) {
    console.error("[account/reset-password] user lookup:", lookupErr);
    return res.status(500).json({ error: "Internal error" });
  }

  if (!authUser) {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 200));
    return res.status(200).json({ ok: true });
  }

  const recoveryEmail: string = authUser.raw_user_meta_data?.recovery_email ?? "";

  let resetLink = "";
  try {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type:    "recovery",
      email:   syntheticEmail,
      options: { redirectTo: APP_URL },
    });
    if (linkErr) throw linkErr;
    resetLink = data?.properties?.action_link ?? "";
  } catch (e) {
    console.error("[account/reset-password] generateLink:", e);
    return res.status(500).json({ error: "Failed to generate reset link" });
  }

  if (!resetLink) return res.status(500).json({ error: "No reset link generated" });

  const resendKey = process.env.RESEND_API_KEY;
  if (recoveryEmail && resendKey && resendKey.length > 0) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        signal:  controller.signal,
        body: JSON.stringify({
          from:    "Kōda <noreply@kodatrade.co.uk>",
          to:      [recoveryEmail],
          subject: "Reset your Kōda password",
          html: [
            `<div style="font-family:ui-monospace,monospace;max-width:480px;margin:0 auto;padding:32px 24px;background:#0C0C0B;color:#EDEDE8;">`,
            `<p style="font-size:11px;color:#8A8A82;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:24px;">Kōda · Password Reset</p>`,
            `<p style="font-size:15px;line-height:1.6;margin-bottom:24px;">`,
            `Hi <strong>@${u}</strong>,<br><br>`,
            `Someone (probably you) requested a password reset. Click the link below to set a new password. The link expires in 1 hour.`,
            `</p>`,
            `<a href="${resetLink}" style="display:inline-block;background:#EDEDE8;color:#0C0C0B;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600;">Reset password →</a>`,
            `<p style="font-size:12px;color:#55554F;margin-top:32px;line-height:1.6;">`,
            `If you didn't request this, you can safely ignore this email. Your password won't change unless you click the link above.`,
            `</p>`,
            `</div>`,
          ].join(""),
        }),
      });
    } catch (e) {
      console.error("[account/reset-password] Resend:", e);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const text = [
      "🔑 *Password Reset Request*", "",
      `👤 @${u}`,
      recoveryEmail
        ? `📧 Emailed via Resend to: ${recoveryEmail}`
        : "⚠️ No recovery email — forward link manually",
      "", "⏰ Link expires in 1 hour",
      recoveryEmail
        ? "(link delivered to user via Resend — not logged here)"
        : "⚠️ Generate a new link manually: Supabase Dashboard → Auth → Users → find @" + u + " → Send recovery email",
    ].join("\n");

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    }).catch(e => console.error("[account/reset-password] Telegram:", e));
  }

  return res.status(200).json({ ok: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: beta-unlock
// ══════════════════════════════════════════════════════════════════════════════

async function handleBetaUnlock(req: Req, res: Res) {
  const betaPassword = process.env.BETA_PASSWORD;
  if (!betaPassword) return res.status(200).json({ ok: true });

  const ip = getClientIp(req);
  const ok = await checkRateLimit("beta_unlock", ip, { limit: 10, windowMs: 15 * 60_000 });
  if (!ok) return res.status(429).json({ error: "Too many attempts — try again later" });

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") return res.status(400).json({ error: "code required" });

  const bufA  = Buffer.from(code.trim().toLowerCase());
  const bufB  = Buffer.from(betaPassword.trim().toLowerCase());
  const match = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  return match ? res.status(200).json({ ok: true }) : res.status(401).json({ error: "Invalid code" });
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: join-waitlist
// ══════════════════════════════════════════════════════════════════════════════

async function handleJoinWaitlist(req: Req, res: Res) {
  const ip = getClientIp(req);
  const ok = await checkRateLimit("waitlist", ip, { limit: 5, windowMs: 15 * 60_000 });
  if (!ok) return res.status(429).json({ error: "Too many requests — try again later" });

  const { email } = req.body as { email?: string };
  const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const normalised = email.trim().toLowerCase();
  const admin      = getAdminClient();

  const { data: inserted, error: insertErr } = await admin
    .from("waitlist").insert({ email: normalised }).select("id").single();

  let position: number;
  let existing = false;

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: row, error: lookupErr } = await admin
        .from("waitlist").select("id").eq("email", normalised).single();
      if (lookupErr || !row) return res.status(500).json({ error: "Internal error" });
      position = row.id;
      existing = true;
    } else {
      console.error("[account/join-waitlist] insert:", insertErr);
      return res.status(500).json({ error: "Internal error" });
    }
  } else {
    position = inserted.id;
  }

  if (!existing) {
    try {
      await sendEmail({
        to:      normalised,
        subject: "You're on the Kōda waitlist",
        html:    waitlistConfirmHtml({ position }),
      });
    } catch (e) { console.error("[account/join-waitlist] Resend:", e); }

    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          chat_id:    chatId,
          text:       `📋 *New waitlist signup*\n\n📧 ${normalised}\n🔢 Position #${position}`,
          parse_mode: "Markdown",
        }),
      }).catch(e => console.error("[account/join-waitlist] Telegram:", e));
    }
  }

  return res.status(existing ? 409 : 200).json({ ok: true, position, ...(existing && { existing: true }) });
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: feedback
// ══════════════════════════════════════════════════════════════════════════════

async function handleFeedback(req: Req, res: Res) {
  const userId = await getUserIdFromJwt(req.headers["authorization"] as string);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const ip      = getClientIp(req);
  const allowed = await checkRateLimit("feedback", ip, { limit: 5, windowMs: 60_000 });
  if (!allowed) return res.status(429).json({ error: "Too many requests" });

  const { feedback, name, handle } = req.body || {};
  if (!feedback?.trim()) return res.status(400).json({ error: "Feedback is required" });

  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return res.status(500).json({ error: "Telegram not configured" });

  const who = [name ? escapeMd(name) : null, handle ? `@${escapeMd(handle.replace(/^@/, ""))}` : null]
    .filter(Boolean).join(" · ") || "Anonymous";

  const text = [
    "📬 *New Kōda OS Feedback*", "",
    `👤 ${who}`, "",
    `💬 ${escapeMd(feedback.trim())}`, "",
    `🕐 ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" })}`,
  ].join("\n");

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!tgRes.ok) {
      const err = await tgRes.json();
      console.error("[account/feedback] Telegram error:", err);
      return res.status(500).json({ error: "Failed to send" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[account/feedback]", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Action: delete
// ══════════════════════════════════════════════════════════════════════════════

async function cancelStripeSubscriptionIfAny(db: ReturnType<typeof getAdminClient>, userId: string) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return;

  const { data: kv } = await db
    .from("user_kv").select("value")
    .eq("user_id", userId).eq("key", "koda_stripe_customer").maybeSingle();

  if (!kv?.value) return;

  let parsed: { subscriptionId?: string; customerId?: string };
  try {
    parsed = typeof kv.value === "string" ? JSON.parse(kv.value) : kv.value;
  } catch { return; }

  if (!parsed.subscriptionId) return;

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    await stripe.subscriptions.cancel(parsed.subscriptionId);
  } catch (e) {
    console.warn("[account/delete] Stripe cancel failed:", (e as Error).message);
  }
}

async function handleDelete(req: Req, res: Res) {
  const userId = await getUserIdFromJwt(req.headers["authorization"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorised" });

  const db = getAdminClient();

  await cancelStripeSubscriptionIfAny(db, userId);

  let handle = "";
  try {
    const { data } = await db
      .from("user_kv").select("value")
      .eq("user_id", userId).eq("key", "koda_profile").maybeSingle();
    if (data?.value) {
      const profile = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      handle = (profile.handle ?? "").replace(/^@/, "").toLowerCase();
    }
  } catch { /* best-effort */ }

  const results: Record<string, string> = {};
  const tableDeletes = [
    { name: "broker_connections", table: "broker_connections", col: "user_id" },
    { name: "sync_events",        table: "sync_events",        col: "user_id" },
    { name: "trades",             table: "trades",              col: "user_id" },
    { name: "profiles",           table: "profiles",            col: "user_id" },
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
    await db.from("shared_kv").delete().eq("owner_id", userId);
    results["shared_kv_owned"] = "ok";
  } catch (e) {
    results["shared_kv_owned"] = `err: ${(e as Error).message}`;
  }

  try {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) {
      console.error("[account/delete] auth.users delete failed:", error.message, "results:", results);
      return res.status(500).json({ error: "Auth user deletion failed", details: results });
    }
  } catch (e) {
    console.error("[account/delete] auth.users delete threw:", (e as Error).message, "results:", results);
    return res.status(500).json({ error: "Auth user deletion failed" });
  }

  console.log("[account/delete] uid=" + userId + " purged:", results);
  res.json({ ok: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// Router
// ══════════════════════════════════════════════════════════════════════════════

export default async function handler(req: Req, res: Res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = req.query?.action as string | undefined;

  if (action === "reset-password") return handleResetPassword(req, res);
  if (action === "beta-unlock")    return handleBetaUnlock(req, res);
  if (action === "join-waitlist")  return handleJoinWaitlist(req, res);
  if (action === "feedback")       return handleFeedback(req, res);
  if (action === "delete")         return handleDelete(req, res);

  return res.status(400).json({ error: "?action= required: reset-password | beta-unlock | join-waitlist | feedback | delete" });
}
