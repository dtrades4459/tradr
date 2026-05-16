// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · feature flags
//
// Tiny flag system backed by localStorage. Lets you ship dark-launched code
// to production and turn it on per-device without redeploying.
//
// Toggle a flag from the browser console:
//   localStorage.tradr_flags = "newTrades,newProfile"
//   location.reload();
//
// Read a flag in code:
//   import { isFlagOn } from "./lib/flags";
//   if (isFlagOn("newTrades")) { ...new code path... } else { ...old... }
//
// Keep flag names short and *additive*. Default is OFF. When a flag has been
// at 100% for a week with no issues, delete the flag and the old code path
// in the same PR.
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "tradr_flags";

let cache: Set<string> | null = null;

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
  return read().has(name);
}

export function enableFlag(name: string): void {
  const s = new Set(read()); s.add(name); persist(s);
}

export function disableFlag(name: string): void {
  const s = new Set(read()); s.delete(name); persist(s);
}

export function listFlags(): string[] {
  return Array.from(read());
}

function persist(s: Set<string>): void {
  cache = s;
  try { localStorage.setItem(STORAGE_KEY, Array.from(s).join(",")); } catch { /* noop */ }
}

// Expose on window so non-developers (and you, on a phone) can flip flags
// from devtools without poking at imports.
if (typeof window !== "undefined") {
  (window as any).tradrFlags = { isFlagOn, enableFlag, disableFlag, listFlags };
}
