// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · GET /api/cron/sync  (also accepts POST for manual triggers)
//
// Called by Vercel Cron every 5 minutes (see vercel.json).
// Also callable manually from the UI via POST with the user's JWT
// (syncs only that user's account immediately).
//
// SCHEDULED mode (GET, no Authorization header):
//   - Must include header:  x-cron-secret: <CRON_SECRET>
//   - Syncs ALL connected accounts in parallel (max 10 concurrent)
//
// MANUAL mode (POST, Authorization: Bearer <supabase-jwt>):
//   - Syncs only the authenticated user's connected accounts
//   - Returns results immediately so the UI can show fresh data
//
// ENV VARS (Vercel):
//   CRON_SECRET              — random secret, set in vercel.json cron headers too
//   TRADOVATE_APP_ID/VERSION/CID/SEC
//   TRADR_ENCRYPTION_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "nodejs" };

import { tryDecrypt, encrypt } from "../lib/cryptoUtils.js";
import { getAdminClient, getUserIdFromJwt } from "../lib/supabaseAdmin.js";
import { checkRateLimit, getClientIp } from "../lib/rateLimit.js";

// ── Tradovate endpoints ───────────────────────────────────────────────────────
const DEMO_BASE = "https://demo.tradovateapi.com/v1";
const LIVE_BASE = "https://live.tradovateapi.com/v1";

const CRON_ALLOWED_ORIGINS = new Set([
  "https://tradrjournal.xyz",
  "https://www.tradrjournal.xyz",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function tvBase(env: string) {
  return env === "live" ? LIVE_BASE : DEMO_BASE;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tvGet(url: string, token: string): Promise<any> {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Tradovate ${r.status} at ${url}`);
  return r.json();
}

async function refreshTradovateToken(
  refreshTokenPlain: string,
  env: string
): Promise<{ accessToken: string; expirationTime: string } | null> {
  try {
    const r = await fetch(`${tvBase(env)}/auth/renewaccesstoken`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${refreshTokenPlain}`, "Content-Type": "application/json" },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    return data?.accessToken ? data : null;
  } catch {
    return null;
  }
}

/** Resolve a list of contract IDs → symbol names in one call. */
async function resolveSymbols(
  ids: number[],
  token: string,
  base: string
): Promise<Record<number, string>> {
  if (!ids.length) return {};
  try {
    const unique = [...new Set(ids)].join(",");
    const data: any[] = await tvGet(`${base}/contract/ldeps?masterids=${unique}`, token);
    return Object.fromEntries((data ?? []).map((c: any) => [c.id, c.name ?? `#${c.id}`]));
  } catch {
    return {};
  }
}

/**
 * Pair fills into round-trip trades using FIFO queue matching.
 * Returns normalised rows ready for INSERT into public.trades.
 */
function fillsToTradeRows(fills: any[], symbols: Record<number, string>, userId: string): any[] {
  // Group by contract
  const byContract: Record<number, any[]> = {};
  for (const f of fills) {
    (byContract[f.contractId] ??= []).push(f);
  }

  const rows: any[] = [];

  for (const contractFills of Object.values(byContract)) {
    const sorted = [...contractFills].sort((a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? "")
    );

    const longQ:  { fill: any; remaining: number }[] = [];
    const shortQ: { fill: any; remaining: number }[] = [];

    for (const fill of sorted) {
      let toMatch = fill.qty ?? 1;
      const isBuy = fill.action === "Buy";

      if (isBuy) {
        // Close shorts first, then open longs
        while (toMatch > 0 && shortQ.length > 0) {
          const head    = shortQ[0];
          const matched = Math.min(toMatch, head.remaining);
          const rawPnl  = (head.fill.price - fill.price) * matched;
          rows.push(makeRow(head.fill, fill, matched, rawPnl, symbols, userId));
          head.remaining -= matched;
          toMatch        -= matched;
          if (head.remaining === 0) shortQ.shift();
        }
        if (toMatch > 0) longQ.push({ fill, remaining: toMatch });
      } else {
        // Close longs first, then open shorts
        while (toMatch > 0 && longQ.length > 0) {
          const head    = longQ[0];
          const matched = Math.min(toMatch, head.remaining);
          const rawPnl  = (fill.price - head.fill.price) * matched;
          rows.push(makeRow(head.fill, fill, matched, rawPnl, symbols, userId));
          head.remaining -= matched;
          toMatch        -= matched;
          if (head.remaining === 0) longQ.shift();
        }
        if (toMatch > 0) shortQ.push({ fill, remaining: toMatch });
      }
    }
  }

  return rows;
}

function makeRow(
  entry: any,
  exit: any,
  qty: number,
  rawPnl: number,
  symbols: Record<number, string>,
  userId: string
): any {
  const symbol  = symbols[entry.contractId] ?? `#${entry.contractId}`;
  const pnl     = parseFloat(rawPnl.toFixed(2));
  const outcome = pnl > 0 ? "win" : pnl < 0 ? "loss" : "be";
  const entryDate = (entry.timestamp ?? "").split("T")[0] || new Date().toISOString().split("T")[0];

  // external_id uniquely identifies this matched trade — entry fill ID + exit fill ID
  const externalId = `tv-${entry.id}-${exit.id}`;

  return {
    user_id:       userId,
    pair:          symbol,
    side:          entry.action === "Buy" ? "long" : "short",
    date:          entryDate,
    strategy:      "",
    outcome,
    entry_price:   entry.price ?? null,
    pnl,
    notes:         `${qty} contract${qty !== 1 ? "s" : ""} · auto-imported from Tradovate`,
    screenshots:   [],
    reactions:     {},
    // sync columns
    external_id:   externalId,
    source:        "api",
    broker:        "tradovate",
    raw_data:      { entryFill: entry, exitFill: exit, qty },
    review_status: "draft",
  };
}

// ── Core sync function for a single connection ────────────────────────────────

async function syncConnection(conn: any): Promise<{
  connectionId: string;
  tradesFound: number;
  tradesNew: number;
  error: string | null;
}> {
  const admin = getAdminClient();
  const connectionId = conn.id as string;
  const userId       = conn.user_id as string;
  const env          = conn.env ?? "live";
  const base         = tvBase(env);

  // Claim the connection atomically — only update if still in a claimable state.
  // If another cron invocation already flipped it to "syncing", skip this connection.
  const { data: claimed } = await admin
    .from("broker_connections")
    .update({ sync_status: "syncing", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .in("sync_status", ["connected", "error"])
    .select("id")
    .single();

  if (!claimed) return { connectionId, tradesFound: 0, tradesNew: 0, error: null };

  const eventStart = new Date().toISOString();

  try {
    // Decrypt access token
    let accessToken = tryDecrypt(conn.access_token_enc);
    if (!accessToken) throw new Error("Could not decrypt access token");

    // Check expiry — refresh if within 10 minutes
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    if (Date.now() > expiresAt - 10 * 60 * 1000) {
      const refreshToken = tryDecrypt(conn.refresh_token_enc);
      if (refreshToken) {
        const refreshed = await refreshTradovateToken(refreshToken, env);
        if (refreshed) {
          accessToken = refreshed.accessToken;
          const newEnc = encrypt(refreshed.accessToken);
          await admin
            .from("broker_connections")
            .update({
              access_token_enc: newEnc,
              token_expires_at: refreshed.expirationTime,
            })
            .eq("id", connectionId);
        } else if (Date.now() > expiresAt) {
          // Token is already expired and refresh failed — stop here rather than
          // sending an expired token to Tradovate and getting a cryptic 401.
          throw new Error("Access token expired and refresh failed — please reconnect your account");
        } else {
          // Token not yet expired but refresh failed — set error state rather than
          // silently proceeding with a token that may expire mid-request.
          await admin
            .from("broker_connections")
            .update({ sync_status: "error", sync_error: "Token refresh failed — please reconnect your account" })
            .eq("id", connectionId);
          throw new Error("Token refresh failed — please reconnect your account");
        }
      }
    }

    // Fetch fills. Tradovate returns all fills with no server-side date filter.
    // Cap to the most recent MAX_FILLS before applying the date filter to prevent
    // OOM/timeout in the serverless function on high-volume accounts.
    // On incremental syncs (last_sync_at is set) this cap is effectively never hit.
    const MAX_FILLS = 5_000;
    const rawFills = await tvGet(`${base}/fill/list`, accessToken);
    if (!Array.isArray(rawFills)) throw new Error("Unexpected response from Tradovate fill/list");

    const allFills = rawFills.length > MAX_FILLS
      ? rawFills.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? "")).slice(0, MAX_FILLS)
      : rawFills;

    const lastSync = conn.last_sync_at;
    const since = lastSync ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const newFills = allFills.filter(f => (f.timestamp ?? "") > since);

    const tradesFound = newFills.length;

    if (newFills.length === 0) {
      // Nothing new — update sync time and return
      await admin
        .from("broker_connections")
        .update({ sync_status: "connected", last_sync_at: new Date().toISOString(), sync_error: null })
        .eq("id", connectionId);

      await admin.from("sync_events").insert({
        user_id: userId, connection_id: connectionId, broker: "tradovate",
        started_at: eventStart, completed_at: new Date().toISOString(),
        trades_found: 0, trades_new: 0,
      });

      return { connectionId, tradesFound: 0, tradesNew: 0, error: null };
    }

    // Resolve symbols for all fills in one call
    const contractIds = [...new Set(newFills.map(f => f.contractId as number))];
    const symbols = await resolveSymbols(contractIds, accessToken, base);

    // Convert fills → trade rows
    const tradeRows = fillsToTradeRows(newFills, symbols, userId);

    let tradesNew = 0;
    if (tradeRows.length > 0) {
      // Upsert on external_id — idempotent, safe to re-run
      const { error: insertErr, data: inserted } = await admin
        .from("trades")
        .upsert(tradeRows, { onConflict: "user_id,external_id", ignoreDuplicates: true })
        .select("id");

      if (insertErr) throw new Error("DB insert failed: " + insertErr.message);
      tradesNew = inserted?.length ?? 0;
    }

    // Update connection state
    await admin
      .from("broker_connections")
      .update({
        sync_status:  "connected",
        last_sync_at: new Date().toISOString(),
        sync_error:   null,
      })
      .eq("id", connectionId);

    // Write audit event
    await admin.from("sync_events").insert({
      user_id:       userId,
      connection_id: connectionId,
      broker:        "tradovate",
      started_at:    eventStart,
      completed_at:  new Date().toISOString(),
      trades_found:  tradesFound,
      trades_new:    tradesNew,
    });

    return { connectionId, tradesFound, tradesNew, error: null };

  } catch (err: any) {
    const message = err?.message ?? "Unknown error";

    await admin
      .from("broker_connections")
      .update({ sync_status: "error", sync_error: message })
      .eq("id", connectionId);

    await admin.from("sync_events").insert({
      user_id:       userId,
      connection_id: connectionId,
      broker:        "tradovate",
      started_at:    eventStart,
      completed_at:  new Date().toISOString(),
      trades_found:  0,
      trades_new:    0,
      error:         message,
    });

    return { connectionId, tradesFound: 0, tradesNew: 0, error: message };
  }
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  const origin = req.headers["origin"] ?? "";
  const allowed = CRON_ALLOWED_ORIGINS.has(origin) ? origin : "https://tradrjournal.xyz";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-cron-secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const admin = getAdminClient();

  // ── MANUAL mode: POST with Supabase JWT ────────────────────────────────────
  if (req.method === "POST") {
    const userId = await getUserIdFromJwt(req.headers["authorization"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    // Rate limit: 10 manual syncs per 10 minutes per user-authenticated IP.
    // JWT auth already prevents unauthenticated abuse; this caps resource usage
    // from a single user hammering the sync button.
    const ip = getClientIp(req);
    const allowed = await checkRateLimit("manual_sync", ip, { limit: 10, windowMs: 600_000 });
    if (!allowed) return res.status(429).json({ error: "Too many sync requests — try again in a few minutes" });

    const { data: conns, error } = await admin
      .from("broker_connections")
      .select("*")
      .eq("user_id", userId)
      .in("sync_status", ["connected", "error"]);

    if (error) return res.status(500).json({ error: error.message });
    if (!conns?.length) return res.status(200).json({ ok: true, results: [], message: "No connected accounts" });

    const results = await runWithConcurrency(
      (conns ?? []).map((conn) => () => syncConnection(conn)),
      5
    );

    return res.status(200).json({ ok: true, results });
  }

  // ── SCHEDULED mode: GET with cron secret ──────────────────────────────────
  if (req.method === "GET") {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret)
      return res.status(500).json({ error: "CRON_SECRET not configured" });
    if (req.headers["x-cron-secret"] !== cronSecret)
      return res.status(401).json({ error: "Invalid cron secret" });

    const { data: conns, error } = await admin
      .from("broker_connections")
      .select("*")
      .in("sync_status", ["connected", "error"]);

    if (error) return res.status(500).json({ error: error.message });
    if (!conns?.length) return res.status(200).json({ ok: true, synced: 0 });

    const results = (await runWithConcurrency(
      (conns ?? []).map((conn) => () => syncConnection(conn)),
      10
    )) as { tradesNew: number; error?: unknown }[];

    const totalNew    = results.reduce((s, r) => s + (r.tradesNew ?? 0), 0);
    const errored     = results.filter(r => r.error);

    return res.status(200).json({
      ok:        true,
      synced:    conns.length,
      tradesNew: totalNew,
      errors:    errored.length,
    });
  }

  return res.status(405).json({ error: "GET or POST required" });
}
