// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · window.storage shim
//
// The monolithic TRADR.tsx component uses a `window.storage` API shaped like:
//   await window.storage.get(key, shared?)      -> { value: string } | null
//   await window.storage.set(key, value, shared?)
//
// This module provides that API, backed by:
//   - Supabase `user_kv` table for per-user data (profile, trades, etc.)
//   - Supabase `shared_kv` table for cross-user data (circles, leaderboards)
//   - localStorage as a synchronous cache + offline fallback
//
// Profiles, trades, and circles are remembered across devices because they
// round-trip through Supabase. The localStorage cache makes reads instant.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase";

type StorageRow = { value: string } | null;

let currentUserId: string | null = null;

function cacheKey(key: string, shared: boolean): string {
  return shared ? `tradr__shared__${key}` : `tradr__user__${currentUserId ?? "anon"}__${key}`;
}

function readCache(key: string, shared: boolean): StorageRow {
  try {
    const raw = localStorage.getItem(cacheKey(key, shared));
    if (raw == null) return null;
    return { value: raw };
  } catch {
    return null;
  }
}

function writeCache(key: string, value: string, shared: boolean): void {
  try {
    localStorage.setItem(cacheKey(key, shared), value);
  } catch {
    // Quota exceeded — screenshots can be heavy. Fail silently; Supabase still
    // has the data.
  }
}

async function remoteGet(key: string, shared: boolean): Promise<StorageRow> {
  try {
    if (shared) {
      const { data, error } = await supabase
        .from("shared_kv")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error || !data) return null;
      return { value: JSON.stringify(data.value) };
    }
    if (!currentUserId) return null;
    const { data, error } = await supabase
      .from("user_kv")
      .select("value")
      .eq("user_id", currentUserId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return { value: JSON.stringify(data.value) };
  } catch {
    return null;
  }
}

async function remoteSet(key: string, value: string, shared: boolean): Promise<void> {
  try {
    const parsed = JSON.parse(value);
    if (shared) {
      if (!currentUserId) return;
      await supabase.from("shared_kv").upsert(
        { key, value: parsed, owner_id: currentUserId },
        { onConflict: "key" }
      );
      return;
    }
    if (!currentUserId) return;
    await supabase.from("user_kv").upsert(
      { user_id: currentUserId, key, value: parsed },
      { onConflict: "user_id,key" }
    );
  } catch {
    // Network / RLS error — localStorage still has the data, retry next write.
  }
}

const storage = {
  async get(key: string, shared: boolean = false): Promise<StorageRow> {
    // Fast path: localStorage cache.
    const cached = readCache(key, shared);
    // Always kick off a remote fetch in the background to keep the cache fresh
    // on the next page load. Shared keys always fetch fresh to avoid stale
    // leaderboards.
    if (shared || cached == null) {
      const remote = await remoteGet(key, shared);
      if (remote) {
        writeCache(key, remote.value, shared);
        return remote;
      }
    } else {
      // Background refresh for per-user keys; don't block.
      remoteGet(key, shared).then(remote => {
        if (remote && remote.value !== cached.value) {
          writeCache(key, remote.value, shared);
        }
      });
    }
    return cached;
  },

  async set(key: string, value: string, shared: boolean = false): Promise<void> {
    writeCache(key, value, shared);
    await remoteSet(key, value, shared);
  },
};

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

/**
 * Install the shim on window.storage. Safe to call multiple times.
 * Pass the authenticated user's id so per-user reads/writes route correctly.
 */
export function installStorage(userId: string | null): void {
  currentUserId = userId;
  (window as any).storage = storage;
}

/**
 * Wipe the local cache. Call on sign-out so the next user starts clean.
 */
export function clearStorageCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("tradr__user__") || k.startsWith("tradr__shared__"))) {
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}

export { storage };
