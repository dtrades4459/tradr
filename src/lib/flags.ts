// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · feature flags
//
// Tiny flag system backed by localStorage. Lets you ship dark-launched code
// to production and turn it on per-device without redeploying.
//
// Toggle a flag from the browser console:
//   window.kodaFlags.enableFlag("newTrades"); location.reload();
//   window.kodaFlags.disableFlag("newProfile"); location.reload();
//
// Read a flag in code:
//   import { isFlagOn } from "./lib/flags";
//   if (isFlagOn("newTrades")) { ...new code path... } else { ...old... }
//
// Keep flag names short and *additive*. When a flag has been at 100% for a
// week with no issues, delete the flag and the old code path in the same PR.
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "koda_flags";
const STORAGE_KEY_OFF = "koda_flags_off";

// Flags that are ON by default for all users.
// Add a flag here once you've validated it on your own account.
// To turn one off for debugging:
//   window.kodaFlags.disableFlag("newProfile"); location.reload();
const DEFAULT_ON: ReadonlySet<string> = new Set([
  "newProfile",  // dual-write + read from public.profiles (v2 schema)
  "newTrades",   // dual-write to public.trades (KV remains the read source for 2 weeks)
  // "paywall" removed for beta — all users get full access
]);

let cache: Set<string> | null = null;
let cacheOff: Set<string> | null = null;

function readOff(): Set<string> {
  if (cacheOff) return cacheOff;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OFF) || "";
    cacheOff = new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
  } catch {
    cacheOff = new Set();
  }
  return cacheOff;
}

function read(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    cache = new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
  } catch {
    cache = new Set();
  }
  return cache;
}

export function isFlagOn(name: string): boolean {
  if (readOff().has(name)) return false;
  if (read().has(name)) return true;
  return DEFAULT_ON.has(name);
}

export function enableFlag(name: string): void {
  const off = new Set(readOff()); off.delete(name); persistOff(off);
  const on = new Set(read()); on.add(name); persist(on);
}

export function disableFlag(name: string): void {
  const on = new Set(read()); on.delete(name); persist(on);
  const off = new Set(readOff()); off.add(name); persistOff(off);
}

export function listFlags(): string[] {
  const on = new Set([...DEFAULT_ON, ...read()]);
  for (const f of readOff()) on.delete(f);
  return Array.from(on);
}

function persist(s: Set<string>): void {
  cache = s;
  try { localStorage.setItem(STORAGE_KEY, Array.from(s).join(",")); } catch { /* noop */ }
}

function persistOff(s: Set<string>): void {
  cacheOff = s;
  try { localStorage.setItem(STORAGE_KEY_OFF, Array.from(s).join(",")); } catch { /* noop */ }
}

// Expose on window so you can flip flags from devtools — dev/localhost only.
// In production builds Vite dead-code-eliminates this entire block.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).kodaFlags = { isFlagOn, enableFlag, disableFlag, listFlags };
}
