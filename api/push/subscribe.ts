// api/push/subscribe.ts
export const config = { runtime: "nodejs" };

type VercelRequest  = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
type VercelResponse = { status(n: number): VercelResponse; json(d: unknown): VercelResponse; end(): void; setHeader(k: string, v: string): void };
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });

  const { data: { user }, error: authErr } = await createClient(
    process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!
  ).auth.getUser(auth.slice(7));
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
