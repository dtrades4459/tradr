export const config = { runtime: "nodejs" };

// Simple in-memory rate limiter (resets on cold start, good enough for serverless)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // max 5 requests
const RATE_WINDOW = 60_000; // per 60 seconds

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { feedback, name, handle } = req.body || {};

  if (!feedback?.trim()) {
    return res.status(400).json({ error: "Feedback is required" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: "Telegram not configured" });
  }

  const who = [name, handle ? `@${handle.replace(/^@/, "")}` : null]
    .filter(Boolean)
    .join(" · ") || "Anonymous";

  const text = [
    "📬 *New TRADR Feedback*",
    "",
    `👤 ${who}`,
    "",
    `💬 ${feedback.trim()}`,
    "",
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
      console.error("Telegram error:", err);
      return res.status(500).json({ error: "Failed to send" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
