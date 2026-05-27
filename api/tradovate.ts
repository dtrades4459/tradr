// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Tradovate API proxy
//
// Routes all Tradovate calls server-side so:
//   - App ID / CID / secret stay in Vercel env vars (never shipped to client)
//   - CORS is handled here, not by Tradovate
//   - Token refresh can happen transparently
//
// Vercel env vars required:
//   TRADOVATE_APP_ID       — name you registered in the Tradovate dev portal
//   TRADOVATE_APP_VERSION  — e.g. "1.0"
//   TRADOVATE_CID          — numeric client ID from dev portal
//   TRADOVATE_SEC          — client secret from dev portal
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import { getUserIdFromJwt } from "./lib/supabaseAdmin.js";

const DEMO_BASE = "https://demo.tradovateapi.com/v1";
const LIVE_BASE = "https://live.tradovateapi.com/v1";

function base(env: string) {
  return env === "live" ? LIVE_BASE : DEMO_BASE;
}

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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function proxy(
  url: string,
  method: "GET" | "POST",
  token?: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

export default async function handler(req: any, res: any) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // All actions require an authenticated TRADR session
  const userId = await getUserIdFromJwt(req.headers["authorization"] as string);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const action = req.query.action as string | undefined;
  const env    = (req.query.env as string | undefined) || "demo";
  const b      = base(env);

  const appId      = process.env.TRADOVATE_APP_ID      ?? "";
  const appVersion = process.env.TRADOVATE_APP_VERSION ?? "";
  const cid        = parseInt(process.env.TRADOVATE_CID ?? "", 10);
  const sec        = process.env.TRADOVATE_SEC         ?? "";

  // ── auth ─────────────────────────────────────────────────────────────────
  if (action === "auth") {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST required" });
    const { name, password } = req.body ?? {};
    if (!name || !password)
      return res.status(400).json({ error: "name and password required" });
    if (!appId || !appVersion || !cid || !sec)
      return res.status(500).json({ error: "Tradovate app credentials not configured (TRADOVATE_APP_ID / TRADOVATE_APP_VERSION / TRADOVATE_CID / TRADOVATE_SEC)" });
    const { status, data } = await proxy(
      `${b}/auth/accesstokenrequest`,
      "POST",
      undefined,
      { name, password, appId, appVersion, cid, sec }
    );
    const d = data as any;
    if (status !== 200 || d?.errorText)
      return res.status(401).json({ error: d?.errorText ?? "Auth failed" });
    return res.status(200).json(data);
  }

  // ── refresh ───────────────────────────────────────────────────────────────
  if (action === "refresh") {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST required" });
    const { token } = req.body ?? {};
    if (!token) return res.status(400).json({ error: "token required" });
    const { status, data } = await proxy(`${b}/auth/renewaccesstoken`, "POST", token);
    return res.status(status).json(data);
  }

  // ── authenticated endpoints ───────────────────────────────────────────────
  // Tradovate token is passed in x-tradovate-token — Authorization is the TRADR JWT (verified above)
  const token = (req.headers["x-tradovate-token"] as string | undefined) ?? "";
  if (!token) return res.status(401).json({ error: "No Tradovate access token" });

  if (action === "accounts") {
    const { status, data } = await proxy(`${b}/account/list`, "GET", token);
    return res.status(status).json(data);
  }

  if (action === "positions") {
    const { status, data } = await proxy(`${b}/position/list`, "GET", token);
    return res.status(status).json(data);
  }

  if (action === "fills") {
    const { status, data } = await proxy(`${b}/fill/list`, "GET", token);
    return res.status(status).json(data);
  }

  if (action === "cashbalance") {
    const accountId = req.query.accountId as string | undefined;
    if (!accountId) return res.status(400).json({ error: "accountId required" });
    const { status, data } = await proxy(
      `${b}/cashBalance/getCashBalanceHistory?accountId=${accountId}`,
      "GET",
      token
    );
    return res.status(status).json(data);
  }

  if (action === "contracts") {
    const ids = req.query.ids as string | undefined;
    if (!ids) return res.status(400).json({ error: "ids required" });
    const { status, data } = await proxy(`${b}/contract/ldeps?masterids=${ids}`, "GET", token);
    return res.status(status).json(data);
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
