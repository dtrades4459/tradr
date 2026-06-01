// api/telegram.ts — Telegram bot webhook
// Commands (admin only):
//   /announce <message>  — push to all subscribers
//   /test                — send test push to all subscribers
//   /help                — show command list
export const config = { runtime: "nodejs" };

type VercelRequest  = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
type VercelResponse = { status(n: number): VercelResponse; json(d: unknown): VercelResponse; end(): void };

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const ADMIN_TELEGRAM_ID = 7587404723;

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

async function tgSend(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN2}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function broadcast(title: string, body: string): Promise<{ sent: number; total: number }> {
  const { data: subs } = await supabase
    .from("notification_subscriptions")
    .select("endpoint, p256dh, auth_key");

  if (!subs?.length) return { sent: 0, total: 0 };

  const results = await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dh: string; auth_key: string }) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title, body, icon: "/icon-192.png" })
      )
    )
  );

  const gone = subs.filter((_: unknown, i: number) => {
    const r = results[i];
    return r.status === "rejected" && [410, 404].includes((r.reason as { statusCode?: number })?.statusCode ?? 0);
  });
  if (gone.length) {
    await Promise.allSettled(
      gone.map((sub: { endpoint: string }) =>
        supabase.from("notification_subscriptions").delete().eq("endpoint", sub.endpoint)
      )
    );
  }

  return { sent: results.filter(r => r.status === "fulfilled").length, total: subs.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(401).end();

  const update = req.body as {
    message?: { from?: { id: number }; chat: { id: number }; text?: string };
  };
  const msg = update.message;
  if (!msg?.text || msg.from?.id !== ADMIN_TELEGRAM_ID) return res.status(200).json({ ok: true });

  const text = msg.text.trim();
  const chatId = msg.chat.id;

  if (text.startsWith("/announce ")) {
    const announcement = text.slice("/announce ".length).trim();
    if (!announcement) {
      await tgSend(chatId, "⚠️ Usage: /announce Your message here");
      return res.status(200).json({ ok: true });
    }
    await supabase.from("announcements").update({ is_active: false }).eq("is_active", true);
    await supabase.from("announcements").insert({ message: announcement, is_active: true });
    const { sent, total } = await broadcast("Kōda", announcement);
    await tgSend(chatId, `✅ Sent to ${sent}/${total} subscribers + shown in-app:\n"${announcement}"`);
    return res.status(200).json({ ok: true });
  }

  if (text === "/test") {
    const { sent, total } = await broadcast("Kōda", "Test notification from Kōda.");
    await tgSend(chatId, `✅ Test sent to ${sent}/${total} subscribers.`);
    return res.status(200).json({ ok: true });
  }

  if (text === "/help" || text.startsWith("/start")) {
    await tgSend(chatId,
      "<b>Kōda Admin Bot</b>\n\n" +
      "/announce <i>message</i> — push to all subscribers\n" +
      "/test — send test push to all\n" +
      "/help — show this"
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
