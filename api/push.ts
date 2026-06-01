// api/push.ts — merged push endpoint; ?action=subscribe | ?action=send
export const config = { runtime: "nodejs" };

type VercelRequest  = { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
type VercelResponse = { status(n: number): VercelResponse; json(d: unknown): VercelResponse; end(): void };

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Service-role client — used for all DB access and JWT verification
// (auth.getUser(token) works with the service role key)
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function handleSubscribe(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.slice(7));
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
  if (!endpoint || typeof endpoint !== "string" || endpoint.length > 512 || !endpoint.startsWith("https://"))
    return res.status(400).json({ error: "Invalid endpoint" });
  if (!keys?.p256dh || !keys?.auth) return res.status(400).json({ error: "Invalid subscription" });

  const { error } = await supabase.from("notification_subscriptions").upsert({
    user_id: user.id, endpoint, p256dh: keys.p256dh, auth_key: keys.auth,
  }, { onConflict: "user_id,endpoint" });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

async function handleSend(req: VercelRequest, res: VercelResponse) {
  const secret = req.headers["x-cron-secret"] as string | undefined;
  if (!secret || secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const { userId, title, body } = req.body as { userId: string; title: string; body: string };
  if (!userId || !title) return res.status(400).json({ error: "Missing fields" });

  const { data: subs } = await supabase
    .from("notification_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (subs?.length) {
    await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title, body, icon: "/icon-192.png" })
      )
    ));
  }

  return res.status(200).json({ ok: true });
}

async function handleNotifyCircle(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.slice(7));
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { circleCode, senderName, messagePreview } = req.body as {
    circleCode: string; senderName: string; messagePreview: string;
  };
  if (!circleCode || typeof circleCode !== "string" || circleCode.length > 64)
    return res.status(400).json({ error: "Invalid circleCode" });

  const prefix = `koda_circle_member_${circleCode}_`;
  const { data: memberRows } = await supabase
    .from("shared_kv")
    .select("owner_id")
    .like("key", `${prefix}%`);

  if (!memberRows?.length) return res.status(200).json({ ok: true, sent: 0 });

  const recipientUids = memberRows
    .map((r: { owner_id: string }) => r.owner_id)
    .filter((uid: string) => uid && uid !== user.id);

  if (!recipientUids.length) return res.status(200).json({ ok: true, sent: 0 });

  const { data: subs } = await supabase
    .from("notification_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .in("user_id", recipientUids);

  if (!subs?.length) return res.status(200).json({ ok: true, sent: 0 });

  const title = senderName || "New message";
  const preview = messagePreview
    ? (messagePreview.length > 80 ? messagePreview.slice(0, 77) + "…" : messagePreview)
    : "New message in your circle";

  await Promise.allSettled(subs.map((sub: { endpoint: string; p256dh: string; auth_key: string }) =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({ title, body: preview, icon: "/icon-192.png" })
    )
  ));

  return res.status(200).json({ ok: true, sent: subs.length });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const action = new URL(req.url ?? "/", "http://localhost").searchParams.get("action");

  if (action === "subscribe") return handleSubscribe(req, res);
  if (action === "send") return handleSend(req, res);
  if (action === "notify-circle") return handleNotifyCircle(req, res);
  return res.status(400).json({ error: "Unknown action" });
}
