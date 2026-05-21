// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · POST /api/broker/connect
//
// Authenticates the user with Tradovate, encrypts the tokens, and upserts a
// row in public.broker_connections.
//
// Body: { broker: "tradovate", env: "demo"|"live", username, password, appId, cid, sec }
// Auth: Supabase JWT in Authorization header
//
// Rate limit: 5 connect attempts per 10 minutes per IP — brute-force guard.
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import { getAdminClient, getUserIdFromJwt } from "../lib/supabaseAdmin";
import { encrypt } from "../lib/cryptoUtils";
import { checkRateLimit, getClientIp } from "../lib/rateLimit";

const DEMO_BASE = "https://demo.tradovateapi.com/v1";
const LIVE_BASE = "https://live.tradovateapi.com/v1";

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

export default async function handler(req: any, res: any) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const userId = await getUserIdFromJwt(req.headers["authorization"]);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  // ── Rate limit: 5 attempts per 10 min per IP ────────────────────────────────
  const ip = getClientIp(req);
  const allowed = await checkRateLimit("broker_connect", ip, { limit: 5, windowMs: 600_000 });
  if (!allowed) {
    return res.status(429).json({ error: "Too many connection attempts — try again in 10 minutes" });
  }

  // ── Validate body ───────────────────────────────────────────────────────────
  const { broker = "tradovate", env = "demo", username, password } = req.body || {};
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: "username and password are required" });
  }
  if (!["demo", "live"].includes(env)) {
    return res.status(400).json({ error: "env must be 'demo' or 'live'" });
  }

  const base = env === "live" ? LIVE_BASE : DEMO_BASE;
  const appId      = process.env.TRADOVATE_APP_ID;
  const appVersion = process.env.TRADOVATE_APP_VERSION;
  const cid        = process.env.TRADOVATE_CID ? parseInt(process.env.TRADOVATE_CID, 10) : undefined;
  const sec        = process.env.TRADOVATE_SEC;

  if (!appId || !appVersion || !cid || !sec) {
    return res.status(503).json({ error: "Broker API credentials not configured" });
  }

  // ── Authenticate with Tradovate ─────────────────────────────────────────────
  let authData: any;
  try {
    const authRes = await fetch(`${base}/auth/accesstokenrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, password, appId, appVersion, cid, sec }),
    });
    authData = await authRes.json();
    if (!authRes.ok || authData?.p === "PasswordInvalid" || !authData?.accessToken) {
      return res.status(401).json({ error: authData?.errorText ?? "Invalid credentials" });
    }
  } catch (err: any) {
    console.error("[broker/connect] Tradovate auth error:", err);
    return res.status(502).json({ error: "Failed to reach broker API" });
  }

  // ── Encrypt tokens ──────────────────────────────────────────────────────────
  // encrypt() reads TRADR_ENCRYPTION_KEY from process.env internally and throws
  // if it is missing or malformed — no need to read it here.
  let accessTokenEnc: string, refreshTokenEnc: string;
  try {
    accessTokenEnc  = encrypt(authData.accessToken);
    refreshTokenEnc = encrypt(authData.mdAccessToken ?? authData.accessToken);
  } catch (err: any) {
    console.error("[broker/connect] Encryption error:", err);
    return res.status(500).json({ error: "Token encryption failed" });
  }

  const tokenExpiresAt = authData.expirationTime
    ? new Date(authData.expirationTime).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h default

  // ── Fetch account details for display name ──────────────────────────────────
  let accountId = "";
  let accountName = "";
  try {
    const acctRes = await fetch(`${base}/account/list`, {
      headers: { Authorization: `Bearer ${authData.accessToken}`, "Content-Type": "application/json" },
    });
    const accounts = (await acctRes.json()) as any[];
    const acct = accounts?.[0];
    if (acct) {
      accountId   = String(acct.id ?? "");
      accountName = acct.name ?? acct.nickname ?? "";
    }
  } catch { /* account name is cosmetic — don't fail if it errors */ }

  // ── Upsert broker connection ─────────────────────────────────────────────────
  const admin = getAdminClient();
  const { error: upsertErr } = await admin
    .from("broker_connections")
    .upsert({
      user_id:             userId,
      broker,
      env,
      account_id:          accountId,
      account_name:        accountName,
      access_token_enc:    accessTokenEnc,
      refresh_token_enc:   refreshTokenEnc,
      token_expires_at:    tokenExpiresAt,
      sync_status:         "connected",
      sync_error:          null,
    }, { onConflict: "user_id,broker,env" });

  if (upsertErr) {
    console.error("[broker/connect] DB upsert error:", upsertErr);
    return res.status(500).json({ error: "Failed to save connection" });
  }

  return res.status(200).json({ ok: true, accountName, env });
}
