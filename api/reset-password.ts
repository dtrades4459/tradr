// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Password Reset API
//
// POST { username }
// → Finds the user by synthetic email (O(1) via auth.users query)
// → Generates a Supabase recovery link (admin API)
// → If user has a recovery_email: sends the link via Resend
// → If no recovery_email: falls back to Telegram so you can help manually
// → Returns { ok: true, hasRecoveryEmail: boolean }
//
// Required Vercel environment variables:
//   SUPABASE_URL               same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role key
//   APP_URL                    https://tradrjournal.xyz
//   RESEND_API_KEY             from resend.com — free tier is plenty for beta
//   TELEGRAM_BOT_TOKEN         fallback for users without a recovery email
//   TELEGRAM_CHAT_ID           same
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp } from "./lib/rateLimit.js";

export const config = { runtime: "nodejs" };

const APP_URL = process.env.APP_URL ?? "https://kodatrade.co.uk";
const USERNAME_DOMAIN = "users.tradr.app";

// ── CORS ────────────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  APP_URL.replace("://", "://www."),
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: any, res: any) {
  const origin = req.headers["origin"] ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: any, res: any) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Rate limit: 5 requests per 10 minutes per IP ────────────────────────────
  const ip = getClientIp(req);
  const allowed = await checkRateLimit("reset_password", ip, { limit: 5, windowMs: 600_000 });
  if (!allowed) return res.status(429).json({ error: "Too many requests — try again later" });

  const { username } = req.body as { username?: string };
  if (!username?.trim()) return res.status(400).json({ error: "username required" });

  const u = username.toLowerCase().trim();
  const syntheticEmail = `${u}@${USERNAME_DOMAIN}`;

  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Find user by synthetic email — O(1) direct query against auth.users.
  //    Supabase Admin JS SDK has no getUserByEmail; querying the auth schema
  //    directly via service role is the recommended approach per Supabase docs.
  const { data: authUser, error: lookupErr } = await admin
    .schema("auth")
    .from("users")
    .select("id, email, raw_user_meta_data")
    .eq("email", syntheticEmail)
    .maybeSingle();

  if (lookupErr) {
    console.error("[reset-password] user lookup:", lookupErr);
    return res.status(500).json({ error: "Internal error" });
  }

  // Constant-time response: delay the fast path to match the slow path duration,
  // preventing a timing oracle on username existence.
  if (!authUser) {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 200));
    return res.status(200).json({ ok: true, hasRecoveryEmail: false });
  }

  const recoveryEmail: string = authUser.raw_user_meta_data?.recovery_email ?? "";

  // 2. Generate Supabase recovery link
  let resetLink = "";
  try {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: syntheticEmail,
      options: { redirectTo: APP_URL },
    });
    if (linkErr) throw linkErr;
    resetLink = data?.properties?.action_link ?? "";
  } catch (e) {
    console.error("[reset-password] generateLink:", e);
    return res.status(500).json({ error: "Failed to generate reset link" });
  }

  if (!resetLink) return res.status(500).json({ error: "No reset link generated" });

  // 3a. Email the link directly via Resend if the user has a recovery email
  const resendKey = process.env.RESEND_API_KEY;
  if (recoveryEmail && resendKey && resendKey.length > 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          from: "Kōda <noreply@kodatrade.co.uk>",
          to: [recoveryEmail],
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
      console.error("[reset-password] Resend:", e);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 3b. Always also notify via Telegram so you have a record
  //     (and as the sole channel for users with no recovery email)
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const text = [
      "🔑 *Password Reset Request*",
      "",
      `👤 @${u}`,
      recoveryEmail
        ? `📧 Emailed via Resend to: ${recoveryEmail}`
        : "⚠️ No recovery email — forward link manually",
      "",
      "⏰ Link expires in 1 hour",
      recoveryEmail
        ? "(link delivered to user via Resend — not logged here)"
        : "⚠️ Generate a new link manually: Supabase Dashboard → Auth → Users → find @" + u + " → Send recovery email",
    ].join("\n");

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    }).catch(e => console.error("[reset-password] Telegram:", e));
  }

  return res.status(200).json({ ok: true, hasRecoveryEmail: !!recoveryEmail });
}
