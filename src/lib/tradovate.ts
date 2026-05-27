// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Tradovate client
//
// All network calls go through /api/tradovate (the Vercel proxy) — never
// directly to Tradovate. This keeps app credentials server-side and avoids CORS.
//
// Usage:
//   const sess = await tradovateAuth("username", "password", "demo");
//   if (!sess) { /* bad credentials */ }
//   const positions = await tradovateGetPositions(sess);
// ═══════════════════════════════════════════════════════════════════════════════

import { log } from "./log";
import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradovateSession {
  accessToken: string;
  refreshToken?: string;
  /** ISO string — when the access token expires */
  expirationTime: string;
  userId: number;
  accountId?: number;
  accountName?: string;
  env: "demo" | "live";
  /** ISO string — timestamp of the last successful fill sync */
  lastSyncTime?: string;
}

export interface TradovatePosition {
  contractId: number;
  symbol: string;
  /** Positive = long, negative = short */
  netPos: number;
  netPrice: number;
  openPnl: number;
  openPnlStr: string;
}

export interface TradovateStats {
  cashBalance: number;
  realizedPnL: number;
  openPnL: number;
}

export interface TradovateFill {
  id: number;
  contractId: number;
  symbol: string;
  orderId: number;
  timestamp: string;
  price: number;
  qty: number;
  /** "Buy" | "Sell" — maps from Tradovate's "action" field */
  side: "Buy" | "Sell";
}

// ─── Internal helper ──────────────────────────────────────────────────────────

const PROXY = "/api/tradovate";

async function callProxy(
  action: string,
  opts: {
    method?: "GET" | "POST";
    token?: string;
    body?: unknown;
    params?: Record<string, string>;
    env?: "demo" | "live";
  }
): Promise<unknown> {
  const { method = "GET", token, body, params = {}, env = "demo" } = opts;
  const qs = new URLSearchParams({ action, env, ...params }).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Always send the Kōda session JWT — server verifies the caller is authenticated
  const { data: { session } } = await supabase.auth.getSession();
  if (session) headers["Authorization"] = `Bearer ${session.access_token}`;
  // Tradovate token goes in its own header, separate from the Kōda auth header
  if (token) headers["x-tradovate-token"] = token;
  const r = await fetch(`${PROXY}?${qs}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as any;
    throw new Error(err?.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

/** Resolve contract IDs → symbols via the proxy. Returns a map { id → name }. */
async function resolveSymbols(
  ids: number[],
  token: string,
  env: "demo" | "live"
): Promise<Record<number, string>> {
  if (ids.length === 0) return {};
  try {
    const contracts = (await callProxy("contracts", {
      token,
      env,
      params: { ids: [...new Set(ids)].join(",") },
    })) as any[];
    return Object.fromEntries((contracts ?? []).map((c: any) => [c.id, c.name]));
  } catch {
    return {};
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Exchange Tradovate username + password for a session token.
 * Credentials are never stored — only the returned token is.
 */
export async function tradovateAuth(
  name: string,
  password: string,
  env: "demo" | "live" = "demo"
): Promise<TradovateSession | null> {
  try {
    const data = (await callProxy("auth", { method: "POST", body: { name, password }, env })) as any;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expirationTime: data.expirationTime,
      userId: data.userId,
      env,
    };
  } catch (e) {
    log.error("tradovate.auth", e);
    return null;
  }
}

/** Silently refresh an expiring token. Returns null on failure — caller should disconnect. */
export async function tradovateRefresh(
  session: TradovateSession
): Promise<TradovateSession | null> {
  try {
    const data = (await callProxy("refresh", {
      method: "POST",
      body: { token: session.accessToken },
      env: session.env,
    })) as any;
    return { ...session, accessToken: data.accessToken, expirationTime: data.expirationTime };
  } catch (e) {
    log.error("tradovate.refresh", e);
    return null;
  }
}

/** True if the token expires within the next 5 minutes. */
export function tradovateTokenExpiring(session: TradovateSession): boolean {
  return new Date(session.expirationTime).getTime() - Date.now() < 5 * 60 * 1000;
}

/** Fetch the first account linked to this session. */
export async function tradovateGetAccount(
  session: TradovateSession
): Promise<{ id: number; name: string } | null> {
  try {
    const accounts = (await callProxy("accounts", {
      token: session.accessToken,
      env: session.env,
    })) as any[];
    if (!Array.isArray(accounts) || accounts.length === 0) return null;
    return { id: accounts[0].id, name: accounts[0].name };
  } catch (e) {
    log.error("tradovate.getAccount", e);
    return null;
  }
}

/** Fetch all open positions with human-readable symbol names. */
export async function tradovateGetPositions(
  session: TradovateSession
): Promise<TradovatePosition[]> {
  try {
    const raw = (await callProxy("positions", {
      token: session.accessToken,
      env: session.env,
    })) as any[];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const symbols = await resolveSymbols(
      raw.map(p => p.contractId),
      session.accessToken,
      session.env
    );
    return raw
      .filter(p => p.netPos !== 0)
      .map(p => ({
        contractId: p.contractId,
        symbol: symbols[p.contractId] ?? `#${p.contractId}`,
        netPos: p.netPos ?? 0,
        netPrice: p.netPrice ?? 0,
        openPnl: p.openPnl ?? 0,
        openPnlStr:
          p.openPnl != null
            ? `${p.openPnl >= 0 ? "+" : ""}$${Math.abs(p.openPnl).toFixed(2)}`
            : "—",
      }));
  } catch (e) {
    log.error("tradovate.getPositions", e);
    return [];
  }
}

/** Fetch account cash balance and realized P&L. */
export async function tradovateGetStats(
  session: TradovateSession
): Promise<TradovateStats | null> {
  if (!session.accountId) return null;
  try {
    const history = (await callProxy("cashbalance", {
      token: session.accessToken,
      env: session.env,
      params: { accountId: String(session.accountId) },
    })) as any[];
    if (!Array.isArray(history) || history.length === 0) return null;
    const latest = history[history.length - 1];
    return {
      cashBalance: latest.cashBalance ?? 0,
      realizedPnL: latest.realizedPnl ?? 0,
      openPnL: latest.openTradeEquity ?? 0,
    };
  } catch (e) {
    log.error("tradovate.getStats", e);
    return null;
  }
}

/**
 * Fetch fills, optionally filtered to those newer than `since` (ISO string).
 * Symbols are resolved automatically.
 */
export async function tradovateGetFills(
  session: TradovateSession,
  since?: string
): Promise<TradovateFill[]> {
  try {
    const raw = (await callProxy("fills", {
      token: session.accessToken,
      env: session.env,
    })) as any[];
    if (!Array.isArray(raw)) return [];
    const filtered = since ? raw.filter(f => f.timestamp > since) : raw;
    if (filtered.length === 0) return [];
    const symbols = await resolveSymbols(
      filtered.map(f => f.contractId),
      session.accessToken,
      session.env
    );
    return filtered.map(f => ({
      id: f.id,
      contractId: f.contractId,
      symbol: symbols[f.contractId] ?? `#${f.contractId}`,
      orderId: f.orderId,
      timestamp: f.timestamp,
      price: f.price ?? 0,
      qty: f.qty ?? 0,
      side: f.action === "Buy" ? "Buy" : "Sell",
    }));
  } catch (e) {
    log.error("tradovate.getFills", e);
    return [];
  }
}

/**
 * Pair Tradovate fills into round-trip trades using proper FIFO queue matching.
 * Handles scaling in/out and partial fills correctly — buy[0]/sell[0] pairing
 * breaks whenever a trader adds to or reduces a position mid-trade.
 *
 * Each returned trade has `source: "tradovate"` and embeds the entry fill ID
 * in the notes for deduplication on re-sync.
 */
export function fillsToTrades(fills: TradovateFill[]): any[] {
  // Group fills by contractId so ES and NQ don't cross-match
  const byContract: Record<number, TradovateFill[]> = {};
  for (const f of fills) {
    (byContract[f.contractId] ??= []).push(f);
  }

  const trades: any[] = [];

  for (const contractFills of Object.values(byContract)) {
    // Process fills in strict chronological order
    const sorted = [...contractFills].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    // FIFO queues — each slot tracks the original fill + how many contracts remain unmatched
    const longQ:  Array<{ fill: TradovateFill; remaining: number }> = [];
    const shortQ: Array<{ fill: TradovateFill; remaining: number }> = [];

    for (const fill of sorted) {
      let toMatch = fill.qty;

      if (fill.side === "Buy") {
        // A buy closes short positions first, then opens a long
        while (toMatch > 0 && shortQ.length > 0) {
          const head = shortQ[0];
          const matched = Math.min(toMatch, head.remaining);
          // Short P&L: sold high, bought back low
          const rawPnl = (head.fill.price - fill.price) * matched;
          trades.push(makeTrade(head.fill, fill, matched, rawPnl, trades.length));
          head.remaining -= matched;
          toMatch -= matched;
          if (head.remaining === 0) shortQ.shift();
        }
        if (toMatch > 0) longQ.push({ fill, remaining: toMatch });

      } else {
        // A sell closes long positions first, then opens a short
        while (toMatch > 0 && longQ.length > 0) {
          const head = longQ[0];
          const matched = Math.min(toMatch, head.remaining);
          // Long P&L: bought low, sold high
          const rawPnl = (fill.price - head.fill.price) * matched;
          trades.push(makeTrade(head.fill, fill, matched, rawPnl, trades.length));
          head.remaining -= matched;
          toMatch -= matched;
          if (head.remaining === 0) longQ.shift();
        }
        if (toMatch > 0) shortQ.push({ fill, remaining: toMatch });
      }
    }
  }

  return trades;
}

/** Build a single Trade object from a matched entry + exit fill. */
function makeTrade(
  entry: TradovateFill,
  exit: TradovateFill,
  qty: number,
  rawPnl: number,
  index: number
): any {
  const pnlDollar = rawPnl.toFixed(2);
  const outcome   = rawPnl >= 0 ? "Win" : "Loss";
  return {
    id: Date.now() * 1000 + index,
    date: entry.timestamp.split("T")[0],
    pair: entry.symbol,
    strategy: "",
    setup: "",
    bias: "",
    session: "",
    entryPrice: String(entry.price),
    slPrice: "",
    tpPrice: "",
    rr: "",
    outcome,
    pnl: "",
    pnlDollar,
    notes: `Tradovate fill #${entry.id} · ${qty} contract${qty !== 1 ? "s" : ""}`,
    screenshot: "",
    emotions: [],
    comments: [],
    reactions: {},
    source: "tradovate",
  };
}
