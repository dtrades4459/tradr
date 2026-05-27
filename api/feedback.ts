// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Feedback API
//
// POST { feedback, name, handle }
// → Supabase-backed rate limit (5 req / 60 s per IP) — survives cold starts
// → Forwards message to Telegram bot
//
// Required Vercel environment variables:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   SUPABASE_URL               same value as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role key
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import { checkRateLimit, getClientIp } from "./lib/rateLimit.js";
import { getUserIdFromJwt } from "./lib/supabaseAdmin.js";

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

function escapeMd(s: string): string {
  // Escape Telegram Markdown v1 special chars: _ * ` [
  return String(s).replace(/[_*`[]/g, "\\$&");
}

export default async function handler(req: any, res: any) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserIdFromJwt(req.headers["authorization"] as string);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const ip = getClientIp(req);
  const allowed = await checkRateLimit("feedback", ip, { limit: 5, windowMs: 60_000 });
  if (!allowed) return res.status(429).json({ error: "Too many requests" });

  const { feedback, name, handle } = req.body || {};
  if (!feedback?.trim()) return res.status(400).json({ error: "Feedback is required" });

  const token = process.env.TELEGRAM_BOT_TOKEN;
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
    const tgRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      }
    );
    if (!tgRes.ok) {
      const err = await tgRes.json();
      console.error("[feedback] Telegram error:", err);
      return res.status(500).json({ error: "Failed to send" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[feedback]", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
