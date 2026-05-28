// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · SettingsScreen
//
// Extracted from Koda.tsx — Settings tab (homeSection === "settings").
// All state lives in the parent Tradr component and is passed down as props.
// No behavior changes — this is a pure structural extraction.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import type { Profile } from "./types";
import { AvatarCircle, Card, Kicker, MONO, BODY, DISPLAY } from "./shared";
import type { Theme } from "./theme";
import { supabase } from "./lib/supabase";

export interface SettingsScreenProps {
  C: Record<string, string>;
  profile: Profile;
  profileDraft: Profile;
  setProfileDraft: (p: Profile) => void;
  editingProfile: boolean;
  setEditingProfile: (v: boolean) => void;
  darkMode: boolean;
  toggleDark: () => void;
  fontScale: number;
  setFontScale: (s: number) => void;
  deleteConfirm: string;
  setDeleteConfirm: (s: string) => void;
  deletingAccount: boolean;
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  normaliseHandle: (h: string) => string;
  isHandleTaken: (h: string) => Promise<boolean>;
  saveProfile: (p: Profile) => Promise<void>;
  showToast: (msg: string) => void;
  exportCSV: () => void;
  deleteAccount: () => void;
  setShowUpgrade: (v: boolean) => void;
  setFeedbackOpen: (v: boolean) => void;
  isFlagOn: (name: string) => boolean;
}

export function SettingsScreen({
  C,
  profile,
  profileDraft,
  setProfileDraft,
  editingProfile,
  setEditingProfile,
  darkMode,
  toggleDark,
  fontScale,
  setFontScale,
  deleteConfirm,
  setDeleteConfirm,
  deletingAccount,
  handleAvatarUpload,
  normaliseHandle,
  isHandleTaken,
  saveProfile,
  showToast,
  exportCSV,
  deleteAccount,
  setShowUpgrade,
  setFeedbackOpen,
  isFlagOn,
}: SettingsScreenProps) {
  const inp: React.CSSProperties = {
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${C.border2}`,
    borderRadius: 0,
    color: C.text,
    padding: "12px 0",
    minHeight: "44px",
    fontSize: "16px",
    width: "100%",
    outline: "none",
    fontFamily: BODY,
    boxSizing: "border-box",
    letterSpacing: "0.01em",
  };
  const lbl: React.CSSProperties = {
    fontSize: "11px",
    color: C.muted,
    letterSpacing: "0.06em",
    marginBottom: "4px",
    display: "block",
    fontFamily: MONO,
    textTransform: "uppercase",
  };

  async function openBillingPortal() {
    if (!profile.stripeCustomerId) {
      showToast("No billing info found — contact support.");
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/stripe-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ stripeCustomerId: profile.stripeCustomerId, returnPath: "/?return=settings" }),
      });
      if (!res.ok) { showToast("Couldn't open billing portal. Try again."); return; }
      const { url } = await res.json();
      if (!url) { showToast("Couldn't open billing portal. Try again."); return; }
      window.location.href = url;
    } catch {
      showToast("Couldn't open billing portal. Try again.");
    }
  }

  return (
    <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 0, marginTop: "clamp(4px, 2vw, 12px)" }}>

      {/* ── User card ── */}
      <div style={{ margin: "0 0 16px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14 }}>
        <div onClick={() => document.getElementById("avatarInput")?.click()} style={{ cursor: "pointer", position: "relative" }}>
          {(profileDraft.avatar || profile.avatar || "").startsWith("data:") || (profileDraft.avatar || profile.avatar || "").startsWith("http") ? (
            <AvatarCircle name={profile.name} avatar={profileDraft.avatar || profile.avatar} size={50} color={C.text} C={C} />
          ) : (
            <div style={{
              width: 50, height: 50, borderRadius: 999,
              background: `linear-gradient(135deg, ${(C as any).orb1 ?? "oklch(0.55 0.22 252)"}, ${(C as any).orb2 ?? "oklch(0.45 0.20 268)"})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontFamily: DISPLAY, fontWeight: 600, fontSize: 16,
            }}>
              {(profileDraft.avatar || profile.avatar || profile.name?.[0] || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <input id="avatarInput" type="file" accept="image/jpeg,image/png" onChange={handleAvatarUpload} style={{ display: "none" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 600, color: C.text }}>{profile.name || "—"}</div>
          <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>
            {profile.handle || "@—"} · {profile.plan === "pro" || profile.plan === "elite" ? "Pro plan" : "Free plan"}
          </div>
          {(profile.plan === "pro" || profile.plan === "elite") && (
            <div style={{ marginTop: "6px", display: "inline-flex", padding: "2px 8px", borderRadius: "999px", background: (C as any).liveSoft ?? "rgba(100,220,180,0.08)", color: (C as any).live ?? C.green, fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", border: `1px solid color-mix(in oklch, ${(C as any).live ?? C.green} 30%, transparent)` }}>{"●"} PRO PLAN</div>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg>
      </div>

      {/* ── Account section ── */}
      <div style={{ marginBottom: 8 }}>
        <Kicker C={C as any}>Account</Kicker>
      </div>
      <div style={{ borderRadius: "22px", background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "4px" }}>
        {/* Edit profile row */}
        <div onClick={() => { setProfileDraft({ ...profile }); setEditingProfile(!editingProfile); }} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 10a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM4 17c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Edit profile</div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Name, handle, avatar, bio</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d={editingProfile ? "M3 9l4-4 4 4" : "M5 3l4 4-4 4"} stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg>
        </div>
        {/* Inline edit form */}
        {editingProfile && (
          <div style={{ padding: "18px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "14px", background: C.panel }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div><label style={lbl}>Name</label><input value={profileDraft.name} onChange={e => setProfileDraft({ ...profileDraft, name: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Handle</label><input value={profileDraft.handle} onChange={e => setProfileDraft({ ...profileDraft, handle: e.target.value })} style={inp} /></div>
            </div>
            <div><label style={lbl}>Bio</label><textarea value={profileDraft.bio} onChange={e => setProfileDraft({ ...profileDraft, bio: e.target.value })} rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div><label style={lbl}>Broker</label><input value={profileDraft.broker} onChange={e => setProfileDraft({ ...profileDraft, broker: e.target.value })} placeholder="IC Markets" style={inp} /></div>
              <div><label style={lbl}>Timezone</label><input value={profileDraft.timezone} onChange={e => setProfileDraft({ ...profileDraft, timezone: e.target.value })} style={inp} /></div>
            </div>
            <div><label style={lbl}>Circle alias <span style={{ color: C.dim }}>(3–12 chars)</span></label><input value={profileDraft.alias || ""} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12); setProfileDraft({ ...profileDraft, alias: v }); }} placeholder="e.g. DYLON-PRO" style={{ ...inp, fontFamily: MONO, letterSpacing: "0.08em" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div><label style={lbl}>Target R:R</label><input type="number" value={profileDraft.targetRR} onChange={e => setProfileDraft({ ...profileDraft, targetRR: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Max Trades/Day</label><input type="number" value={profileDraft.maxTradesPerDay} onChange={e => setProfileDraft({ ...profileDraft, maxTradesPerDay: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Max Daily Loss (R)</label><input type="number" step="0.5" value={profileDraft.maxDailyLoss || ""} onChange={e => setProfileDraft({ ...profileDraft, maxDailyLoss: e.target.value })} placeholder="e.g. 3" style={inp} /></div>
            </div>
            <button onClick={async () => {
              const name = (profileDraft.name || "").trim();
              const handle = (profileDraft.handle || "").trim();
              if (!name) { showToast("Name can't be empty"); return; }
              if (!handle) { showToast("Handle can't be empty"); return; }
              const normNew = normaliseHandle(handle);
              const normOld = normaliseHandle(profile.handle || "");
              if (normNew !== normOld) {
                const taken = await isHandleTaken(handle);
                if (taken) { showToast(`@${normNew} is already taken`); return; }
              }
              await saveProfile({ ...profileDraft, name, handle });
              setEditingProfile(false);
              showToast("Profile saved");
            }} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: C.text, color: C.bg, border: "none", borderRadius: "14px",
              padding: "5px 6px 5px 20px", fontSize: "14px", fontWeight: 600,
              cursor: "pointer", width: "100%", fontFamily: BODY, marginTop: "4px",
            }}>
              <span>Save profile</span>
              <span style={{ width: "36px", height: "36px", borderRadius: "999px", background: (C as any).live ?? C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#0A0A0A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            </button>
          </div>
        )}
        {/* Appearance / Dark mode */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2v3M10 15v3M3 10h3M14 10h3M5.5 5.5l-2-2M14.5 5.5l2-2M5.5 14.5l-2 2M14.5 14.5l2 2M10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Appearance</div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Dark mode</div>
          </div>
          <button onClick={toggleDark} style={{ width: "38px", height: "22px", borderRadius: "999px", border: "none", cursor: "pointer", background: darkMode ? (C as any).live ?? C.green : C.border2, position: "relative", transition: "background 0.2s", boxShadow: darkMode ? `0 0 0 3px color-mix(in oklch, ${(C as any).live ?? C.green} 22%, transparent)` : "none", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: "2px", left: darkMode ? "18px" : "2px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
          </button>
        </div>
      </div>

      {/* ── Subscription section ── */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <Kicker C={C as any}>Subscription</Kicker>
      </div>
      <div style={{ borderRadius: "22px", background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "4px" }}>
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>
              {(profile.plan === "pro" || profile.plan === "elite") ? "Pro" : "Free"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>
              {(profile.plan === "pro" || profile.plan === "elite")
                ? "Full access · manage or cancel anytime"
                : "Limited features · upgrade for full access"}
            </div>
          </div>
          {(profile.plan === "pro" || profile.plan === "elite") ? (
            <button
              onClick={openBillingPortal}
              style={{
                padding: "8px 14px", background: "transparent",
                border: `1px solid ${C.border2}`, borderRadius: "10px",
                fontFamily: MONO, fontSize: "11px", color: C.text,
                cursor: "pointer", letterSpacing: "0.06em",
              }}
            >
              Manage billing
            </button>
          ) : (
            <button
              onClick={() => setShowUpgrade(true)}
              style={{
                padding: "10px 18px",
                background: (C as any).live ?? "#4ade80",
                border: "none", borderRadius: "12px",
                fontFamily: MONO, fontSize: "11px", fontWeight: 700,
                color: "#0A0A0A", cursor: "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase" as const,
                whiteSpace: "nowrap" as const,
              }}
            >
              Upgrade to Pro
            </button>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 18px", fontFamily: MONO, fontSize: "10px", color: (C as any).dim ?? C.muted, letterSpacing: "0.04em" }}>
          Payments handled securely by Stripe
        </div>
      </div>

      {/* ── Text size ── */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <Kicker C={C as any}>Text Size</Kicker>
      </div>
      <div style={{ borderRadius: "16px", background: C.panel, border: `1px solid ${C.border}`, padding: "14px 16px", marginBottom: "4px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          {([["S", 0.85], ["M", 1.0], ["L", 1.15], ["XL", 1.3]] as [string, number][]).map(([label, scale]) => (
            <button key={label} onClick={() => setFontScale(scale)} style={{ flex: 1, padding: "10px 4px", border: `1px solid ${fontScale === scale ? C.text : C.border2}`, borderRadius: "10px", background: fontScale === scale ? C.text : "transparent", color: fontScale === scale ? C.bg : C.muted, fontSize: label === "S" ? "11px" : label === "M" ? "13px" : label === "L" ? "15px" : "17px", fontFamily: BODY, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Privacy & Data ── */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <Kicker C={C as any}>Privacy & Data</Kicker>
      </div>
      <div style={{ borderRadius: "22px", background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "4px" }}>
        {/* Public trades toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `color-mix(in oklch, ${C.green} 12%, transparent)`, border: `1px solid ${C.border2}`, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 3l6 3v4c0 4-2.5 6.5-6 7-3.5-.5-6-3-6-7V6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Public trades</div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Visible on your profile</div>
          </div>
          <button onClick={() => { const next = !profile.publicTrades; saveProfile({ ...profile, publicTrades: next }); }} style={{ width: "38px", height: "22px", borderRadius: "999px", border: "none", cursor: "pointer", background: profile.publicTrades ? (C as any).live ?? C.green : C.border2, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: "2px", left: profile.publicTrades ? "18px" : "2px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
          </button>
        </div>
        {/* Copy mentor link */}
        {profile.publicTrades && (
          <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M12 2h6v6M10 10L18 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Share with mentor</div>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Copy your public profile link</div>
            </div>
            <button onClick={() => { const handle = (profile.handle || "").replace(/^@/, ""); const url = `https://kodatrade.co.uk/@${handle}`; navigator.clipboard?.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast("Link: " + url)); }} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "5px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.06em", color: C.muted }}>Copy</button>
          </div>
        )}
        {/* Prop firm / eval account */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 12l2-2 4 4 8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Prop firm / eval mode</div>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Track evaluation targets on dashboard</div>
            </div>
            <button
              onClick={() => {
                if (!profile.propFirmMode && profile.plan !== "pro" && profile.plan !== "elite") {
                  setShowUpgrade(true);
                  return;
                }
                saveProfile({ ...profile, propFirmMode: !profile.propFirmMode });
              }}
              style={{ width: "38px", height: "22px", borderRadius: "999px", border: "none", cursor: "pointer", background: profile.propFirmMode ? (C as any).live ?? C.green : C.border2, position: "relative", transition: "background 0.2s", flexShrink: 0 }}
            >
              <div style={{ position: "absolute", top: "2px", left: profile.propFirmMode ? "18px" : "2px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
            </button>
          </div>
          {profile.propFirmMode && (
            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={lbl}>Starting balance ($)</label>
                  <input type="number" value={profile.propFirmBalance ?? ""} onChange={e => saveProfile({ ...profile, propFirmBalance: parseFloat(e.target.value) || undefined })} placeholder="50000" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Profit target ($)</label>
                  <input type="number" value={profile.propFirmProfitTarget ?? ""} onChange={e => saveProfile({ ...profile, propFirmProfitTarget: parseFloat(e.target.value) || undefined })} placeholder="3000" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Daily loss limit ($)</label>
                  <input type="number" value={profile.propFirmDailyLossLimit ?? ""} onChange={e => saveProfile({ ...profile, propFirmDailyLossLimit: parseFloat(e.target.value) || undefined })} placeholder="1000" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Max drawdown ($)</label>
                  <input type="number" value={profile.propFirmMaxDrawdown ?? ""} onChange={e => saveProfile({ ...profile, propFirmMaxDrawdown: parseFloat(e.target.value) || undefined })} placeholder="2500" style={inp} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Push notifications */}
        {("serviceWorker" in navigator && "PushManager" in window) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily: BODY, fontSize: 14, color: C.text }}>Push notifications</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.08em", marginTop: 2 }}>New circle activity, AI insights</div>
            </div>
            <button
              onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
                });
                await fetch("/api/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                  body: JSON.stringify(sub.toJSON()),
                });
                showToast("Push notifications enabled");
              }}
              style={{ padding: "8px 14px", borderRadius: 999, background: C.live, color: "#0A0A0A", border: "none", fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}
            >Enable</button>
          </div>
        )}
        {/* Export CSV */}
        <div onClick={() => { if (isFlagOn("paywall") && profile.plan !== "pro" && profile.plan !== "elite") { setShowUpgrade(true); return; } exportCSV(); }} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 9l4 4 4-4M3 16h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Data export</div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>CSV + JSON of all trades</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg>
        </div>
        {/* Delete account */}
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `color-mix(in oklch, ${C.red} 12%, transparent)`, border: `1px solid ${C.border2}`, color: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 5h10v10H5zM8 8l4 4M12 8l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.red }}>Delete account</div>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Permanent · cannot be undone</div>
            </div>
          </div>
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE to confirm" style={{ padding: "11px 14px", background: "transparent", border: `1px solid ${deleteConfirm.toUpperCase() === "DELETE" ? C.red : C.border2}`, borderRadius: "10px", color: C.text, fontFamily: MONO, fontSize: "12px", letterSpacing: "0.04em", outline: "none" }} />
            <button onClick={deleteAccount} disabled={deletingAccount || deleteConfirm.toUpperCase() !== "DELETE"} style={{ padding: "11px", border: `1px solid ${deleteConfirm.toUpperCase() === "DELETE" ? C.red : C.border2}`, borderRadius: "10px", background: "transparent", color: deleteConfirm.toUpperCase() === "DELETE" ? C.red : C.muted, cursor: deleteConfirm.toUpperCase() === "DELETE" ? "pointer" : "not-allowed", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", opacity: deletingAccount ? 0.6 : 1, transition: "all 0.2s" }}>
              {deletingAccount ? "Deleting…" : "Delete My Account"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Support ── */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <Kicker C={C as any}>Support</Kicker>
      </div>
      <div style={{ borderRadius: "22px", background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: "4px" }}>
        <div onClick={() => setFeedbackOpen(true)} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4a6 6 0 1 1 0 12a6 6 0 0 1 0-12zM10 7v4M10 14v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Send feedback</div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>Direct to founder · 24h reply</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: (C as any).accentSoft ?? C.panel, border: `1px solid ${C.border2}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4l1.5 5h5l-4 3 1.5 5-4-3-4 3 1.5-5-4-3h5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text }}>Rate Kōda</div>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>App Store</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "24px 16px 0", fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: "0.12em" }}>
        KŌDA v1.0 · BUILD {new Date().getFullYear()}.05
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", padding: "8px 0" }}>
        <a href="/privacy.html" target="_blank" rel="noopener" style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.08em", textDecoration: "none" }}>Privacy</a>
        <a href="/terms.html" target="_blank" rel="noopener" style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.08em", textDecoration: "none" }}>Terms</a>
      </div>
    </div>
  );
}
