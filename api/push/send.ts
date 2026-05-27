// api/push/send.ts — send a push to a specific user (called internally)
export const config = { runtime: "nodejs" };

type VercelRequest  = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
type VercelResponse = { status(n: number): VercelResponse; json(d: unknown): VercelResponse; end(): void };
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function sendPushToUser(userId: string, payload: { title: string; body: string; icon?: string }) {
  const { data: subs } = await supabase
    .from("notification_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (!subs?.length) return;

  await Promise.allSettled(subs.map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({ ...payload, icon: payload.icon ?? "/icon-192.png" })
    )
  ));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { userId, title, body } = req.body as { userId: string; title: string; body: string };
  if (!userId || !title) return res.status(400).json({ error: "Missing fields" });
  await sendPushToUser(userId, { title, body });
  return res.status(200).json({ ok: true });
}
