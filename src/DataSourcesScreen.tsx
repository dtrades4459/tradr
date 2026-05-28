// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · DataSourcesScreen
//
// "Sync" tab — manage broker connections (Tradovate live sync) and CSV imports.
//
// Props surface:
//   C              — colour palette from Koda.tsx
//   supabase       — Supabase browser client (reads broker_connections + sync_events via RLS)
//   userId         — authenticated user ID
//   accessToken    — Supabase JWT (passed to /api/broker/connect + /api/cron/sync)
//   existingTrades — for CSV dedup inside CsvImportPanel
//   allStrategyNames
//   onTradesImported(trades) — called after a CSV import is confirmed
//   showToast(msg)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Kicker, MONO, BODY, DISPLAY } from "./shared";
import { CsvImportPanel } from "./CsvImportPanel";
import type { Trade } from "./types";
import type { Theme } from "./theme";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerConn {
  id: string;
  broker: string;
  env: "demo" | "live";
  account_id: string | null;
  account_name: string | null;
  sync_status: "connected" | "syncing" | "error" | "disconnected" | "paused";
  sync_error: string | null;
  last_sync_at: string | null;
  created_at: string;
}

interface SyncEvent {
  id: string;
  connection_id: string | null;
  broker: string;
  started_at: string | null;
  completed_at: string | null;
  trades_found: number;
  trades_new: number;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const _STATUS_LABEL: Record<string, string> = {
  connected:    "Live",
  syncing:      "Syncing…",
  error:        "Error",
  disconnected: "Disconnected",
  paused:       "Paused",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function _StatusDot({ status, C }: { status: string; C: Theme }) {
  const col =
    status === "connected"    ? C.green :
    status === "syncing"      ? C.warn  :
    status === "error"        ? C.red   :
    C.muted;
  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8,
      borderRadius: "50%",
      background: col,
      boxShadow: status === "syncing" ? `0 0 6px ${col}` : undefined,
      marginRight: 6,
      flexShrink: 0,
    }} />
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

export interface DataSourcesScreenProps {
  C: Theme;
  supabase: SupabaseClient;
  userId: string;
  accessToken: string;
  existingTrades: Trade[];
  allStrategyNames: string[];
  onTradesImported: (trades: Trade[]) => void;
  showToast: (msg: string) => void;
  autoOpenCsv?: boolean;
  onAutoOpenCsvDone?: () => void;
}

export function DataSourcesScreen({
  C, supabase, userId, accessToken,
  existingTrades, allStrategyNames,
  onTradesImported, showToast,
  autoOpenCsv, onAutoOpenCsvDone,
}: DataSourcesScreenProps) {

  // ── State ─────────────────────────────────────────────────────────────────
  const [_connections, setConnections] = useState<BrokerConn[]>([]);
  const [syncEvents,  setSyncEvents]  = useState<SyncEvent[]>([]);
  const [_loadingConns, setLoadingConns] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);

  // Connect modal
  const [showConnect, setShowConnect] = useState(false);
  const [connectEnv,  setConnectEnv]  = useState<"demo" | "live">("live");
  const [connectName, setConnectName] = useState("");
  const [connectPass, setConnectPass] = useState("");
  const [connecting,  setConnecting]  = useState(false);
  const [connectError, setConnectError] = useState("");

  // Disconnect confirmation
  const [pendingDisconnect, setPendingDisconnect] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Manual sync state
  const [_syncing, setSyncing] = useState(false);

  // CSV panel visibility
  const [showCsv, setShowCsv] = useState(false);

  // Audit expand/collapse
  const [auditExpanded, setAuditExpanded] = useState(true);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchConnections = useCallback(async () => {
    setLoadingConns(true);
    const { data, error } = await supabase
      .from("broker_connections")
      .select("id, broker, env, account_id, account_name, sync_status, sync_error, last_sync_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error && data) setConnections(data as BrokerConn[]);
    setLoadingConns(false);
  }, [supabase, userId]);

  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);
    const { data, error } = await supabase
      .from("sync_events")
      .select("id, connection_id, broker, started_at, completed_at, trades_found, trades_new, error")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (!error && data) setSyncEvents(data as SyncEvent[]);
    setLoadingAudit(false);
  }, [supabase, userId]);

  useEffect(() => {
    fetchConnections();
    fetchAudit();
  }, [fetchConnections, fetchAudit]);

  useEffect(() => {
    if (autoOpenCsv) {
      setShowCsv(true);
      onAutoOpenCsvDone?.();
    }
  }, [autoOpenCsv]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!connectName.trim() || !connectPass.trim()) {
      setConnectError("Username and password are required.");
      return;
    }
    setConnecting(true);
    setConnectError("");
    try {
      const r = await fetch("/api/broker/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: connectName.trim(), password: connectPass, env: connectEnv }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setConnectError(data.error ?? "Connection failed.");
        return;
      }
      showToast(`✓ ${data.message}`);
      setShowConnect(false);
      setConnectName(""); setConnectPass(""); setConnectEnv("live");
      await fetchConnections();
      await fetchAudit();
    } catch (err: any) {
      setConnectError(err?.message ?? "Network error.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(true);
    try {
      const r = await fetch("/api/broker/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ connectionId }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) { showToast("Disconnect failed: " + (data.error ?? "unknown error")); return; }
      showToast("Account disconnected.");
      setPendingDisconnect(null);
      await fetchConnections();
    } catch {
      showToast("Disconnect failed — network error.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function _handleManualSync() {
    setSyncing(true);
    try {
      const r = await fetch("/api/cron/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      });
      const data = await r.json();
      if (!r.ok || !data.ok) { showToast("Sync failed: " + (data.error ?? "unknown error")); return; }
      const total = (data.results ?? []).reduce((s: number, x: any) => s + (x.tradesNew ?? 0), 0);
      showToast(total > 0 ? `✓ Synced — ${total} new trade${total !== 1 ? "s" : ""} imported` : "✓ Synced — no new trades");
      await fetchConnections();
      await fetchAudit();
    } catch {
      showToast("Sync failed — network error.");
    } finally {
      setSyncing(false);
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: C.card ?? C.surface ?? "#1a1a2e",
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 10,
  };

  const btn = (variant: "primary" | "ghost" | "danger" = "ghost"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontFamily: BODY,
    fontSize: 14,
    fontWeight: 500,
    background:
      variant === "primary" ? (C.accent ?? "#7c3aed") :
      variant === "danger"  ? "#ef4444" :
      C.surface2 ?? C.surface ?? "#2a2a3e",
    color:
      variant === "primary" ? "#fff" :
      variant === "danger"  ? "#fff" :
      C.text ?? "#e2e8f0",
  });

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${C.border ?? "#333"}`,
    background: C.surface2 ?? "#2a2a3e",
    color: C.text ?? "#e2e8f0",
    fontFamily: BODY,
    fontSize: 14,
    boxSizing: "border-box",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px 16px 80px", maxWidth: 600, margin: "0 auto", fontFamily: BODY }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: C.text ?? "#e2e8f0" }}>Data Sources</div>
          <div style={{ fontSize: 13, color: C.muted ?? "#888", marginTop: 2 }}>
            Live sync and CSV imports
          </div>
        </div>
        {/* Sync Now button — re-enable when live sync ships */}
        {/* false && connections.length > 0 && (
          <button style={btn("primary")} onClick={handleManualSync} disabled={syncing}>
            {syncing ? "Syncing…" : "↺ Sync Now"}
          </button>
        ) */}
      </div>

      {/* ── LIVE CONNECTIONS — COMING SOON ── */}
      <div style={{ marginBottom: 10 }}><Kicker C={C as any}>Live Connections</Kicker></div>

      <div style={{ position: "relative", marginBottom: 24 }}>
        {/* Blurred preview of what the section will look like */}
        <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none", opacity: 0.45 }}>
          <div style={{
            borderRadius: 18, border: `1px solid ${C.border2 ?? "#2a2a3e"}`,
            background: C.panel ?? "#131317", padding: "16px 18px",
            display: "flex", alignItems: "center", gap: 14, marginBottom: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: C.text ?? "#e2e8f0" }}>Tradovate — Live</div>
              <div style={{ fontSize: 12, color: C.muted ?? "#888", fontFamily: MONO, marginTop: 2 }}>Last sync: just now · 3 new trades</div>
            </div>
          </div>
          <div style={{
            borderRadius: 18, border: `1px solid ${C.border2 ?? "#2a2a3e"}`,
            background: C.panel ?? "#131317", padding: "16px 18px",
            display: "flex", alignItems: "center", gap: 14, marginBottom: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: C.text ?? "#e2e8f0" }}>Rithmic — Demo</div>
              <div style={{ fontSize: 12, color: C.muted ?? "#888", fontFamily: MONO, marginTop: 2 }}>Last sync: 5m ago · syncing…</div>
            </div>
          </div>
        </div>

        {/* Coming soon overlay */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          borderRadius: 14,
          background: "linear-gradient(135deg, rgba(124,58,237,0.13) 0%, rgba(16,16,32,0.7) 100%)",
          backdropFilter: "blur(1px)",
          border: `1px solid ${C.border ?? "#333"}`,
          gap: 8, padding: 20,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.accent ?? "#7c3aed",
            background: `color-mix(in oklch, ${C.accent ?? "oklch(0.74 0.16 250)"} 12%, transparent)`, padding: "4px 10px", borderRadius: 6,
          }}>
            Coming Soon
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text ?? "#e2e8f0", textAlign: "center" }}>
            Live Broker Sync
          </div>
          <div style={{ fontSize: 12, color: C.muted ?? "#888", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
            Auto-import trades every 5 minutes from Tradovate and Rithmic. Launching soon — use CSV import in the meantime.
          </div>
        </div>
      </div>

      {/* ── DUMMY SECTION BELOW (hidden — preserved for when live sync ships) ── */}
      {/* Connections list hidden until live sync ships — kept for reference:
      connections.length === 0 ? (
        <div style={{ ...card, color: C.muted ?? "#888", fontSize: 14, textAlign: "center", padding: "22px 16px" }}>
          No broker connected yet.
          Trades will auto-import every 5 minutes once connected.
        </div>
      ) : (
        connections.map(conn => (
          ...conn cards...
        ))
      ) */}

      {/* ── ADD BROKER BUTTON — hidden until live sync ships ── */}
      {/* Connect button hidden until live sync ships */}

      {/* ── CSV IMPORT ── */}
      <div style={{ marginBottom: 10 }}><Kicker C={C as any}>Sync from CSV</Kicker></div>
      <div style={{ borderRadius: 18, border: `1px solid ${C.border2 ?? "#2a2a3e"}`, background: C.panel ?? "#131317", padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, color: C.text ?? "#e2e8f0", fontSize: 15 }}>Manual CSV Import</div>
            <div style={{ fontSize: 12, color: C.muted ?? "#888", marginTop: 2 }}>
              Tradovate · Rithmic · NinjaTrader 8 · TopstepX · FTMO/MT5 · TradingView · MT4
            </div>
          </div>
          <button
            style={btn(showCsv ? "ghost" : "primary")}
            onClick={() => setShowCsv(v => !v)}
          >
            {showCsv ? "Close" : "Import CSV"}
          </button>
        </div>

        {showCsv && (
          <div style={{ marginTop: 16 }}>
            <CsvImportPanel
              existingTrades={existingTrades}
              onImport={(trades: any[]) => {
                onTradesImported(trades);
                setShowCsv(false);
                showToast(`✓ Imported ${trades.length} trade${trades.length !== 1 ? "s" : ""}`);
              }}
              onClose={() => setShowCsv(false)}
              allStrategyNames={allStrategyNames}
              C={C}
              inp={input}
              sel={input}
              lbl={{ fontSize: 12, fontFamily: MONO, color: C.muted ?? "#888", marginBottom: 4 }}
            />
          </div>
        )}
      </div>

      {/* ── SYNC AUDIT LOG ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ marginBottom: 0 }}><Kicker C={C as any}>Sync Audit Log</Kicker></div>
        <button
          style={{ ...btn("ghost"), fontSize: 11, padding: "4px 10px", fontFamily: MONO }}
          onClick={() => setAuditExpanded(v => !v)}
        >
          {auditExpanded ? "▲ Collapse" : "▼ Expand"}
        </button>
      </div>

      {auditExpanded && (
        loadingAudit ? (
          <div style={{ color: C.muted ?? "#888", fontSize: 13 }}>Loading audit log…</div>
        ) : syncEvents.length === 0 ? (
          <div style={{
            ...card, color: C.muted ?? "#888", fontSize: 13, textAlign: "center", padding: "20px 16px",
          }}>
            No sync events yet. Connect a broker to see history here.
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
            <table style={{
              width: "100%", borderCollapse: "collapse",
              fontSize: 12, fontFamily: MONO, color: C.text ?? "#e2e8f0",
            }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border ?? "#333"}` }}>
                  {["Time", "Broker", "Found", "New", "Status"].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "6px 10px",
                      fontSize: 10, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: C.muted ?? "#888",
                      fontWeight: 600,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syncEvents.map(ev => {
                  const ok = !ev.error;
                  return (
                    <tr
                      key={ev.id}
                      style={{
                        borderBottom: `1px solid ${C.border ?? "#2a2a3e"}`,
                        background: "transparent",
                      }}
                    >
                      <td style={{ padding: "7px 10px", color: C.muted ?? "#888" }}>
                        {fmtDate(ev.started_at)}
                      </td>
                      <td style={{ padding: "7px 10px", textTransform: "capitalize" }}>
                        {ev.broker}
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "right" }}>
                        {ev.trades_found}
                      </td>
                      <td style={{
                        padding: "7px 10px", textAlign: "right",
                        color: ev.trades_new > 0 ? "#22c55e" : C.muted ?? "#888",
                        fontWeight: ev.trades_new > 0 ? 700 : 400,
                      }}>
                        {ev.trades_new > 0 ? `+${ev.trades_new}` : "0"}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        {ok ? (
                          <span style={{ color: "#22c55e" }}>✓ OK</span>
                        ) : (
                          <span
                            style={{ color: "#ef4444", cursor: "help" }}
                            title={ev.error ?? ""}
                          >
                            ✗ Error
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: C.muted ?? "#888", marginTop: 8, textAlign: "right" }}>
              Showing last {syncEvents.length} events
            </div>
          </div>
        )
      )}

      {/* ── CONNECT MODAL ── */}
      {showConnect && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "#0009", display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowConnect(false); }}
        >
          <div style={{
            background: C.card ?? "#1a1a2e",
            width: "100%", maxWidth: 480,
            borderRadius: "20px 20px 0 0",
            padding: "24px 20px 36px",
          }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: C.text ?? "#e2e8f0", marginBottom: 4 }}>
              Connect Tradovate
            </div>
            <div style={{ fontSize: 13, color: C.muted ?? "#888", marginBottom: 20 }}>
              Your credentials are used once to get a token — never stored in plain text.
            </div>

            {/* Env toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["live", "demo"] as const).map(env => (
                <button
                  key={env}
                  onClick={() => setConnectEnv(env)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                    cursor: "pointer", fontFamily: BODY, fontSize: 14, fontWeight: 600,
                    background: connectEnv === env ? (C.accent ?? "#7c3aed") : (C.surface2 ?? "#2a2a3e"),
                    color: connectEnv === env ? "#fff" : (C.muted ?? "#888"),
                  }}
                >
                  {env === "live" ? "🟢 Live" : "🟡 Demo"}
                </button>
              ))}
            </div>

            <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontFamily: MONO, color: C.muted ?? "#888", display: "block", marginBottom: 4 }}>
                  Tradovate Username
                </label>
                <input
                  style={input}
                  placeholder="your@email.com or username"
                  value={connectName}
                  onChange={e => setConnectName(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="username"
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontFamily: MONO, color: C.muted ?? "#888", display: "block", marginBottom: 4 }}>
                  Password
                </label>
                <input
                  style={input}
                  type="password"
                  placeholder="••••••••"
                  value={connectPass}
                  onChange={e => setConnectPass(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {connectError && (
                <div style={{
                  fontSize: 13, color: "#ef4444", background: "#ef444418",
                  borderRadius: 8, padding: "8px 12px", fontFamily: MONO,
                }}>
                  {connectError}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  style={{ ...btn("ghost"), flex: 1, justifyContent: "center" }}
                  onClick={() => setShowConnect(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...btn("primary"), flex: 2, justifyContent: "center" }}
                  disabled={connecting}
                >
                  {connecting ? "Connecting…" : "Connect Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DISCONNECT CONFIRMATION ── */}
      {pendingDisconnect && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "#0009", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setPendingDisconnect(null); }}
        >
          <div style={{
            background: C.card ?? "#1a1a2e",
            borderRadius: 18, padding: "24px 20px",
            width: "100%", maxWidth: 380,
          }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.text ?? "#e2e8f0", marginBottom: 8 }}>
              Disconnect account?
            </div>
            <div style={{ fontSize: 13, color: C.muted ?? "#888", marginBottom: 20, lineHeight: 1.5 }}>
              Auto-sync will stop. Trades already imported are kept in your journal.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ ...btn("ghost"), flex: 1, justifyContent: "center" }}
                onClick={() => setPendingDisconnect(null)}
              >
                Cancel
              </button>
              <button
                style={{ ...btn("danger"), flex: 1, justifyContent: "center" }}
                disabled={disconnecting}
                onClick={() => handleDisconnect(pendingDisconnect)}
              >
                {disconnecting ? "Removing…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
