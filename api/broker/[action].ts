// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · POST /api/broker/connect  &  POST /api/broker/disconnect
//
// Single dynamic route — Vercel passes the path segment as req.query.action.
// Replaces the two separate connect.ts / disconnect.ts files to stay under
// the Hobby plan's 12-function limit.
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import { getAdminClient, getUserIdFromJwt } from "../lib/supabaseAdmin.js";
import { encrypt } from "../lib/cryptoUtils.js";
import { checkRateLimit, getClientIp } from "../lib/rateLimit.js";

type VercelRequest  = { method?: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown>; query: Record<string, string | string[] | undefined> };
type VercelResponse = { status(n: number): VercelResponse; json(d: unknown): VercelResponse; end(): void; setHeader(k: string, v: string): void };

const DEMO_BASE = "https://demo.tradovateapi.com/v1";
const LIVE_BASE  = "https://live.tradovateapi.com/v1";

const APP_URL = process.env.APP_URL ?? "https://kodatrade.co.uk";
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  APP_URL.replace("://", "://www."),
  "http://localhost:5173",
  "http://localhost:4173",
]);

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers["origin"] as string) ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function handleConnect(req: VercelRequest, res: VercelResponse, userId: string) {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit("broker_connect", ip, { limit: 5, windowMs: 600_000 });
  if (!allowed) return res.status(429).json({ error: "Too many connection attempts — try again in 10 minutes" });

  const { broker = "tradovate", env = "demo", username, password } = req.body as Record<string, string>;
  if (!username?.trim() || !password?.trim()) return res.status(400).json({ error: "username and password are required" });
  if (!["demo", "live"].includes(env)) return res.status(400).json({ error: "env must be 'demo' or 'live'" });

  const base       = env === "live" ? LIVE_BASE : DEMO_BASE;
  const appId      = process.env.TRADOVATE_APP_ID;
  const appVersion = process.env.TRADOVATE_APP_VERSION;
  const cid        = process.env.TRADOVATE_CID ? parseInt(process.env.TRADOVATE_CID, 10) : undefined;
  const sec        = process.env.TRADOVATE_SEC;

  if (!appId || !appVersion || !cid || !sec) return res.status(503).json({ error: "Broker API credentials not configured" });

  let authData: Record<string, unknown>;
  try {
    const authRes = await fetch(`${base}/auth/accesstokenrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password, appId, appVersion, cid, sec }),
    });
    authData = await authRes.json() as Record<string, unknown>;
    if (!authRes.ok || authData?.p === "PasswordInvalid" || !authData?.accessToken) {
      return res.status(401).json({ error: (authData?.errorText as string) ?? "Invalid credentials" });
    }
  } catch (err: unknown) {
    console.error("[broker/connect] Tradovate auth error:", err);
    return res.status(502).json({ error: "Failed to reach broker API" });
  }

  let accessTokenEnc: string, refreshTokenEnc: string;
  try {
    accessTokenEnc  = encrypt(authData.accessToken as string);
    refreshTokenEnc = encrypt((authData.mdAccessToken ?? authData.accessToken) as string);
  } catch (err: unknown) {
    console.error("[broker/connect] Encryption error:", err);
    return res.status(500).json({ error: "Token encryption failed" });
  }

  const tokenExpiresAt = authData.expirationTime
    ? new Date(authData.expirationTime as string).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();

  let accountId = "", accountName = "";
  try {
    const acctRes = await fetch(`${base}/account/list`, {
      headers: { Authorization: `Bearer ${authData.accessToken as string}`, "Content-Type": "application/json" },
    });
    const accounts = (await acctRes.json()) as Array<Record<string, unknown>>;
    const acct = accounts?.[0];
    if (acct) { accountId = String(acct.id ?? ""); accountName = (acct.name ?? acct.nickname ?? "") as string; }
  } catch { /* cosmetic — don't fail */ }

  const admin = getAdminClient();
  const { error: upsertErr } = await admin.from("broker_connections").upsert({
    user_id: userId, broker, env, account_id: accountId, account_name: accountName,
    access_token_enc: accessTokenEnc, refresh_token_enc: refreshTokenEnc,
    token_expires_at: tokenExpiresAt, sync_status: "connected", sync_error: null,
  }, { onConflict: "user_id,broker,env" });

  if (upsertErr) { console.error("[broker/connect] DB upsert error:", upsertErr); return res.status(500).json({ error: "Failed to save connection" }); }

  return res.status(200).json({ ok: true, accountName, env });
}

async function handleDisconnect(req: VercelRequest, res: VercelResponse, userId: string) {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit("broker_disconnect", ip, { limit: 10, windowMs: 600_000 });
  if (!allowed) return res.status(429).json({ error: "Too many requests" });

  const { broker = "tradovate", env = "demo" } = req.body as Record<string, string>;

  const admin = getAdminClient();
  const { error } = await admin.from("broker_connections").delete()
    .eq("user_id", userId).eq("broker", broker).eq("env", env);

  if (error) { console.error("[broker/disconnect] DB error:", error); return res.status(500).json({ error: "Failed to disconnect" }); }

  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserIdFromJwt(req.headers["authorization"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const action = req.query.action as string;
  if (action === "connect") return handleConnect(req, res, userId);
  if (action === "disconnect") return handleDisconnect(req, res, userId);
  return res.status(404).json({ error: "Unknown action" });
}
