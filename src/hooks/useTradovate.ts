// ═══════════════════════════════════════════════════════════════════════════════
// useTradovate — Tradovate session state + connect / sync / disconnect
//
// Owns:  tradovateSession, tradovatePositions, tradovateConnecting,
//        tradovateSyncing, tradovateError, tradovateForm
//
// Self-initialises from storage once `loading` flips to false — no need for
// loadAll() to touch Tradovate state.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { storage } from "../lib/storage";
import { log } from "../lib/log";
import {
  tradovateAuth,
  tradovateRefresh,
  tradovateTokenExpiring,
  tradovateGetAccount,
  tradovateGetPositions,
  tradovateGetFills,
  fillsToTrades,
  type TradovateSession,
  type TradovatePosition,
} from "../lib/tradovate";
import type { Trade } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UseTradovateParams {
  /** True while the initial data load is still in flight. */
  loading: boolean;
  /** Current trade list — used to dedup imported fills. */
  trades: Trade[];
  /** Persist an updated trade list (called after successful fill import). */
  saveTrades: (trades: Trade[]) => Promise<void>;
  /** Toast callback. */
  showToast: (msg: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTradovate({ loading, trades, saveTrades, showToast }: UseTradovateParams) {
  const [tradovateSession, setTradovateSession] = useState<TradovateSession | null>(null);
  const [tradovatePositions, setTradovatePositions] = useState<TradovatePosition[]>([]);
  const [tradovateConnecting, setTradovateConnecting] = useState(false);
  const [tradovateSyncing, setTradovateSyncing] = useState(false);
  const [tradovateError, setTradovateError] = useState("");
  const [tradovateForm, setTradovateForm] = useState<{
    username: string;
    password: string;
    env: "demo" | "live";
  }>({ username: "", password: "", env: "demo" });

  // ── Self-init from storage ───────────────────────────────────────────────────
  // Runs once after loadAll() finishes so we don't race with the main data fetch.
  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        const res = await storage.get("koda_tradovate");
        if (!res) return;
        const sess: TradovateSession = JSON.parse(res.value);
        if (!sess?.accessToken) return;
        setTradovateSession(sess);
        // Refresh positions in the background — non-blocking.
        tradovateGetPositions(sess)
          .then(setTradovatePositions)
          .catch(e => log.error("useTradovate.init.positions", e));
      } catch (e) {
        log.error("useTradovate.init", e);
      }
    })();
  }, [loading]);

  // ── Connect ──────────────────────────────────────────────────────────────────

  async function connectTradovate() {
    const { username, password, env } = tradovateForm;
    if (!username.trim() || !password.trim()) {
      setTradovateError("Username and password are required");
      return;
    }
    setTradovateConnecting(true);
    setTradovateError("");
    try {
      const sess = await tradovateAuth(username.trim(), password, env);
      if (!sess) {
        setTradovateError("Invalid credentials — check username and password");
        return;
      }
      const acct = await tradovateGetAccount(sess);
      const fullSess: TradovateSession = { ...sess, accountId: acct?.id, accountName: acct?.name };
      setTradovateSession(fullSess);
      setTradovateForm(f => ({ ...f, password: "" })); // clear password from state
      await storage.set("koda_tradovate", JSON.stringify(fullSess));
      const positions = await tradovateGetPositions(fullSess);
      setTradovatePositions(positions);
      showToast(`Connected to ${acct?.name ?? "Tradovate"}`);
    } catch (e) {
      log.error("tradovate.connect", e);
      setTradovateError("Connection failed — check credentials and try again");
    } finally {
      setTradovateConnecting(false);
    }
  }

  // ── Refresh positions ────────────────────────────────────────────────────────

  async function refreshTradovatePositions(sess: TradovateSession) {
    try {
      let s = sess;
      if (tradovateTokenExpiring(s)) {
        const refreshed = await tradovateRefresh(s);
        if (!refreshed) {
          showToast("Tradovate token expired — please reconnect");
          setTradovateSession(null);
          return;
        }
        s = refreshed;
        setTradovateSession(s);
        await storage.set("koda_tradovate", JSON.stringify(s));
      }
      const positions = await tradovateGetPositions(s);
      setTradovatePositions(positions);
    } catch (e) {
      log.error("tradovate.refreshPositions", e);
    }
  }

  // ── Sync fills ───────────────────────────────────────────────────────────────

  async function syncTradovateFills() {
    if (!tradovateSession) return;
    setTradovateSyncing(true);
    try {
      let sess = tradovateSession;
      if (tradovateTokenExpiring(sess)) {
        const refreshed = await tradovateRefresh(sess);
        if (!refreshed) {
          showToast("Tradovate token expired — please reconnect");
          setTradovateSession(null);
          setTradovateSyncing(false);
          return;
        }
        sess = refreshed;
        setTradovateSession(sess);
      }
      const since = sess.lastSyncTime;
      const fills = await tradovateGetFills(sess, since);
      const newTrades = fillsToTrades(fills);
      if (newTrades.length === 0) {
        showToast("No new fills since last sync");
      } else {
        const imported = await handleTradovateFillImport(newTrades);
        if (imported === 0) {
          showToast("All fills already in journal — nothing new");
        } else {
          showToast(`${imported} trade${imported === 1 ? "" : "s"} imported from Tradovate`);
        }
      }
      const updatedSess: TradovateSession = { ...sess, lastSyncTime: new Date().toISOString() };
      setTradovateSession(updatedSess);
      await storage.set("koda_tradovate", JSON.stringify(updatedSess));
      const positions = await tradovateGetPositions(updatedSess);
      setTradovatePositions(positions);
    } catch (e) {
      log.error("tradovate.syncFills", e);
      showToast("Sync failed — try reconnecting");
    } finally {
      setTradovateSyncing(false);
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────────────────

  async function disconnectTradovate() {
    setTradovateSession(null);
    setTradovatePositions([]);
    setTradovateForm({ username: "", password: "", env: "demo" });
    setTradovateError("");
    try { await storage.del("koda_tradovate"); } catch { /* noop */ }
    showToast("Tradovate disconnected");
  }

  // ── Fill import (dedup) ──────────────────────────────────────────────────────

  /**
   * Merges newly-fetched fills into the trade list, skipping any fills that
   * are already represented by a trade note containing "Tradovate fill #<id>".
   * Returns the number of net-new trades written.
   */
  async function handleTradovateFillImport(newTrades: Trade[]): Promise<number> {
    const importedIds = new Set(
      trades
        .map(t => { const m = (t.notes || "").match(/Tradovate fill #(\d+)/); return m ? m[1] : null; })
        .filter(Boolean)
    );
    const deduped = newTrades.filter(t => {
      const m = (t.notes || "").match(/Tradovate fill #(\d+)/);
      return m ? !importedIds.has(m[1]) : true;
    });
    if (!deduped.length) return 0;
    await saveTrades([...trades, ...deduped]);
    return deduped.length;
  }

  return {
    // State
    tradovateSession,
    tradovatePositions,
    tradovateConnecting,
    tradovateSyncing,
    tradovateError,
    tradovateForm,
    // Setters (needed by DataSourcesScreen UI)
    setTradovateSession,
    setTradovateForm,
    setTradovateError,
    // Actions
    connectTradovate,
    refreshTradovatePositions,
    syncTradovateFills,
    disconnectTradovate,
  };
}
