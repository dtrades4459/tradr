export const config = { runtime: "nodejs20.x" };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
