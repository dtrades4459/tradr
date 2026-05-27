// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · api/lib/rateLimit.ts
//
// Supabase-backed IP rate limiter — survives Vercel cold starts because state
// lives in shared_kv, not in memory.
//
// Usage:
//   import { checkRateLimit, hashIp } from "../lib/rateLimit";
//   const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
//   const allowed = await checkRateLimit("connect", ip, { limit: 5, windowMs: 600_000 });
//   if (!allowed) return res.status(429).json({ error: "Too many requests" });
// ═══════════════════════════════════════════════════════════════════════════════

import { createHash } from "crypto";
import { getAdminClient } from "./supabaseAdmin.js";

/** Stable 16-char hex derived from the IP via SHA-256 — avoids storing raw IPs in the DB. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export interface RateLimitOptions {
  /** Max requests allowed within the window. Default: 5 */
  limit?: number;
  /** Window duration in ms. Default: 60_000 (1 minute) */
  windowMs?: number;
}

export async function checkRateLimit(
  action: string,
  ip: string,
  options: RateLimitOptions = {}
): Promise<boolean> {
  const { limit = 5, windowMs = 60_000 } = options;
  const admin = getAdminClient();
  const key = `koda_rl_${action}_${hashIp(ip)}`;

  type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  const { data, error } = await (admin.rpc as unknown as RpcCall)("check_and_increment_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    console.error("[rateLimit] RPC error — failing open:", error.message);
    return true; // fail-open: never block legitimate traffic on DB errors
  }

  return data === true;
}

/** Extract the client IP from a Vercel request, falling back to "unknown". */
export function getClientIp(req: any): string {
  return (req.headers["x-forwarded-for"] as string | undefined)
    ?.split(",")[0].trim() || "unknown";
}
