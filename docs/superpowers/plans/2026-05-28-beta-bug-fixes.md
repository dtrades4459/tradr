# Beta Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 14 bugs identified in the 28 May beta call with Dan and Bruno.

**Architecture:** Fixes are spread across 5 files: `src/Koda.tsx`, `src/SettingsScreen.tsx`, `src/TradingCircles.tsx`, `src/charts.tsx`, and `src/hooks/useCircles.ts`. Each task is self-contained and can be verified independently.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase + Vercel. `src/Koda.tsx` is ~4300 lines — always use Python atomic write for edits to that file.

---

## File Map

| File | What changes |
|------|-------------|
| `src/Koda.tsx` | Bug 1 (CSV nav), Bug 2 (feedback auth), Bug 3 (feedback text), Bug 10 (strategies empty state) |
| `src/SettingsScreen.tsx` | Bug 4 (pro refresh), Bug 5 (sign out), Bug 13 (arrow removal) |
| `src/TradingCircles.tsx` | Bug 6+7 (members/board error state), Bug 8 (chat), Bug 9 (members list), Bug 11 (RR → %) |
| `src/charts.tsx` | Bug 12 (calendar toggle) |
| `src/hooks/useCircles.ts` | Bug 11 (publish % of account to circle entry) |

---

## Task 1 — Fix feedback: add auth header + change sender text

**Files:**
- Modify: `src/Koda.tsx` (lines ~1164–1189 submitFeedback, ~3966 helper text, ~3982 button text)

The `/api/feedback` endpoint requires `Authorization: Bearer <token>` (line 48–49 in api/feedback.ts). The current `submitFeedback()` sends no auth header so every submit returns 401 silently. The button also says "Send to Dylon" which should say "Send to Kōda Support".

- [ ] **Step 1: Find the submitFeedback function**

```bash
grep -n "submitFeedback\|Send to Dylon\|Dylon reads" src/Koda.tsx
```

Expected output shows lines ~1164, ~3966, ~3982.

- [ ] **Step 2: Update submitFeedback to include auth header**

At `src/Koda.tsx` line ~1168, change the fetch call from:
```tsx
const res = await fetch("/api/feedback", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ feedback: feedbackText.trim(), name: profile.name, handle: profile.handle }),
});
```
to:
```tsx
const { data: { session } } = await supabase.auth.getSession();
const res = await fetch("/api/feedback", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  },
  body: JSON.stringify({ feedback: feedbackText.trim(), name: profile.name, handle: profile.handle }),
});
```

- [ ] **Step 3: Update feedback modal text**

At line ~3966, change:
```tsx
<div style={{ ... }}>Dylon reads every message.</div>
```
to:
```tsx
<div style={{ ... }}>Goes straight to Kōda Support.</div>
```

At line ~3982, change:
```tsx
{feedbackSent ? "Sent! ✓" : feedbackSending ? "Sending…" : "Send to Dylon"}
```
to:
```tsx
{feedbackSent ? "Sent! ✓" : feedbackSending ? "Sending…" : "Send to Kōda Support"}
```

- [ ] **Step 4: Verify build passes**

```bash
cd "C:\Users\Dylon\OneDrive\Desktop\tradr-fresh" && npm run build 2>&1 | tail -10
```
Expected: `✓ built in` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/Koda.tsx
git commit -m "fix: feedback requires auth header; rename button to Kōda Support"
```

---

## Task 2 — Fix sign out button missing in Settings

**Files:**
- Modify: `src/SettingsScreen.tsx`
- Modify: `src/Koda.tsx` (pass `onSignOut` prop)

The SettingsScreen has no sign-out action. It needs a "Sign Out" button and the parent needs to wire up `supabase.auth.signOut()`.

- [ ] **Step 1: Add `onSignOut` to SettingsScreenProps interface**

In `src/SettingsScreen.tsx`, add to the `SettingsScreenProps` interface (line ~15):
```tsx
onSignOut: () => void;
```

Add to the destructured props in the function signature (line ~64):
```tsx
onSignOut,
```

- [ ] **Step 2: Add the sign-out button to SettingsScreen**

After the `{/* Delete account */}` block and before the `{/* ── Support ── */}` block (around line ~416), add:
```tsx
{/* Sign out */}
<div style={{ padding: "14px 18px 0" }}>
  <button
    onClick={onSignOut}
    style={{ width: "100%", padding: "13px", border: `1px solid ${C.border2}`, borderRadius: "14px", background: "transparent", color: C.text2, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const }}
  >
    Sign Out
  </button>
</div>
```

- [ ] **Step 3: Remove the non-functional arrow from the user card**

At line ~142, remove the arrow SVG at the end of the user card:
```tsx
<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth="1.3" strokeLinecap="round"/></svg>
```
(The user card has no onClick so the arrow implies navigation that doesn't exist.)

- [ ] **Step 4: Wire onSignOut in Koda.tsx**

In `src/Koda.tsx`, find where `<SettingsScreen` is rendered and add:
```tsx
onSignOut={async () => {
  await supabase.auth.signOut();
  phReset();
  clearStorageCache();
}}
```

Use Python atomic write to update Koda.tsx since it's 4300+ lines.

- [ ] **Step 5: Build + verify TypeScript**

```bash
cd "C:\Users\Dylon\OneDrive\Desktop\tradr-fresh" && npm run build 2>&1 | tail -10
```
Expected: no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/SettingsScreen.tsx src/Koda.tsx
git commit -m "fix: add sign out button to settings; remove non-functional arrow from user card"
```

---

## Task 3 — Fix Pro plan not unlocking after upgrade

**Files:**
- Modify: `src/SettingsScreen.tsx`
- Modify: `src/Koda.tsx`

After Stripe checkout, the user is redirected back to the app. But `profile.plan` is cached in KV and the JWT claim needs to be refreshed. The fix: on app load (and on the Stripe return URL `?return=settings`), refresh the Supabase session to pick up the updated JWT claim, then reload the profile.

- [ ] **Step 1: Find the Stripe return handling in Koda.tsx**

```bash
grep -n "return=settings\|stripeCustomerId\|plan.*pro\|profile\.plan" src/Koda.tsx | head -20
```

- [ ] **Step 2: Add session refresh on Stripe return**

In `src/Koda.tsx`, in the main `useEffect` that runs on load (or in the auth state change handler), add:
```tsx
// Refresh session after Stripe redirect so JWT plan claim is up-to-date
if (window.location.search.includes("return=settings") || window.location.search.includes("session_id=")) {
  supabase.auth.refreshSession().then(({ data }) => {
    if (data?.session) {
      // Reload profile from KV to get updated plan
      loadAll();
    }
  }).catch(() => {});
}
```

Find `loadAll` (the main data-loading function) and confirm it re-reads `tradr_profile` from KV. If the plan is stored on the profile object in KV (not just in the JWT), also check if the Stripe webhook (`api/stripe-webhook.ts`) updates `tradr_profile` in KV.

- [ ] **Step 3: Check stripe-webhook.ts updates profile.plan**

```bash
grep -n "plan\|tradr_profile\|user_kv" api/stripe-webhook.ts | head -20
```

If the webhook updates the JWT claim but NOT the KV profile, add a plan sync: after `supabase.auth.refreshSession()`, read `profile.plan` from the JWT user metadata and update the KV profile accordingly.

- [ ] **Step 4: Add a "Refresh plan" button in Settings for fallback**

In `src/SettingsScreen.tsx`, inside the billing/plan area (after the "PRO PLAN" badge, around line ~140), add:
```tsx
{(profile.plan === "pro" || profile.plan === "elite") && (
  <div style={{ marginTop: 4 }}>
    <button
      onClick={async () => {
        await supabase.auth.refreshSession();
        showToast("Plan refreshed — reload if features are still locked");
      }}
      style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.08em", padding: 0, textDecoration: "underline" }}
    >
      Refresh plan
    </button>
  </div>
)}
```

Wait — actually the `profile.plan` value comes from KV, not from JWT. Check `stripe-webhook.ts` to confirm it updates `user_kv` row with key `tradr_profile`, setting `plan: "pro"`. If it does, the issue is just that the cached in-memory profile isn't refreshed after the redirect.

- [ ] **Step 5: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/Koda.tsx src/SettingsScreen.tsx
git commit -m "fix: refresh session and profile after Stripe redirect; add manual plan-refresh button"
```

---

## Task 4 — Fix Circles: Members/Board error state + empty members list

**Files:**
- Modify: `src/TradingCircles.tsx`
- Modify: `src/hooks/useCircles.ts`

Two issues:
1. Members tab shows "something went wrong" — likely an unhandled exception in the members render or a failed `listByPrefix` query. Add a try/catch error state.
2. Members list only shows Dylon — `readCircleMembers` uses `listByPrefix` which requires all users to have written their own `koda_circle_member_{CODE}_{myCode}` row. If they haven't loaded the app since the per-member-row refactor, their rows are missing. Fix: when opening a circle, trigger a member sync and show a refreshing state.

- [ ] **Step 1: Add error state to the members tab**

In `src/TradingCircles.tsx`, wrap the `circleTab === "members"` block in a try/catch via an error boundary pattern. Change:
```tsx
{circleTab === "members" && (
  <div style={{ borderTop: `1px solid ${C.border}` }}>
    {(activeCircle.members || []).length === 0 ? (
      <div ...>No member data available.</div>
    ) : (activeCircle.members || []).map(...)}
  </div>
)}
```
to:
```tsx
{circleTab === "members" && (() => {
  const members = activeCircle?.members || [];
  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      {members.length === 0 ? (
        <div style={{ padding: "28px 0", fontFamily: BODY, fontSize: "13px", color: C.muted, fontStyle: "italic" }}>
          No members found. Members appear here after they open the app.
        </div>
      ) : members.map((m: any, idx: number) => {
        const isMe = m.code === getMyCode();
        const isFollowing = (following || []).includes(m.code);
        const lbEntry = leaderboard.find((e: any) => e.memberCode === m.code);
        return (
          <div key={m.code || idx} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: "18px", flexShrink: 0, border: `1px solid ${C.border}` }}>
              {m.avatar ? (m.avatar.length <= 8 && !m.avatar.startsWith("http") && !m.avatar.startsWith("data:") ? m.avatar : "👤") : "👤"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>{m.name || "Trader"}</span>
                {isMe && <span style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.12em" }}>· YOU</span>}
                {m.code === activeCircle.createdBy || m.isOwner ? <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>OWNER</span> : null}
              </div>
              {m.alias && <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "2px" }}>{m.alias}</div>}
              {lbEntry && <div style={{ fontFamily: MONO, fontSize: "10px", color: lbEntry.totalPnL >= 0 ? C.green : C.red, letterSpacing: "0.06em", marginTop: "2px" }}>{lbEntry.totalPnL >= 0 ? "+" : ""}{lbEntry.totalPnL.toFixed(1)}R · {lbEntry.winRate.toFixed(0)}% WR</div>}
            </div>
            {!isMe && (
              <button onClick={() => isFollowing ? unfollowUser(m.code) : followUser(m.code)}
                style={{ background: isFollowing ? "transparent" : C.text, color: isFollowing ? C.muted : C.bg, border: `1px solid ${isFollowing ? C.border2 : C.text}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase" as const, flexShrink: 0 }}>
                {isFollowing ? "✓" : "+Follow"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
})()}
```

- [ ] **Step 2: Add a loading state + refresh button for members**

Add state at top of TradingCircles component:
```tsx
const [membersLoading, setMembersLoading] = useState(false);
```

When the members tab is clicked (in the tab onClick handler), trigger a fresh member fetch:
```tsx
if (t === "members") {
  setMembersLoading(true);
  readCircleMembers(activeCircle.code, activeCircle.members || [])
    .then(fresh => { setActiveCircle((c: any) => c ? { ...c, members: fresh } : c); })
    .catch(() => {})
    .finally(() => setMembersLoading(false));
}
```

Add `readCircleMembers` to the props being passed to TradingCircles from Koda.tsx (it comes from `useCircles` hook).

Show loading state in members tab:
```tsx
{membersLoading && (
  <div style={{ padding: "8px 0", fontFamily: MONO, fontSize: "10px", color: C.muted }}>Refreshing…</div>
)}
```

- [ ] **Step 3: Fix leaderboard (Board) tab — add explicit error state**

Wrap the leaderboard fetch that happens in `openCircle` in try/catch so that if `fetchCircleLeaderboard` throws, we set an error state instead of crashing. Add state:
```tsx
const [lbError, setLbError] = useState(false);
```

In `openCircle`, wrap:
```tsx
try {
  const [entries, challenge] = await Promise.all([
    fetchCircleLeaderboard(circle),
    fetchActiveChallenge(circle.code),
  ]);
  setLeaderboard(entries);
  setLbError(false);
  setActiveChallenge(challenge);
} catch {
  setLbError(true);
  setLeaderboard([]);
}
```

In the leaderboard tab render, add before the `loadingLB` check:
```tsx
{lbError && (
  <div style={{ padding: "20px", textAlign: "center", fontFamily: BODY, fontSize: "13px", color: C.muted }}>
    Couldn't load leaderboard. <button onClick={async () => { setLoadingLB(true); setLbError(false); try { const e = await fetchCircleLeaderboard(activeCircle); setLeaderboard(e); } catch { setLbError(true); } setLoadingLB(false); }} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontFamily: MONO, fontSize: "11px", textDecoration: "underline" }}>Try again</button>
  </div>
)}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/TradingCircles.tsx
git commit -m "fix: circles members/board error states; refresh members on tab click"
```

---

## Task 5 — Fix chat messages not coming through

**Files:**
- Modify: `src/TradingCircles.tsx`

The chat tab loads messages via `loadChatMessages` only when switching to the tab and `chatMessages.length === 0`. After a message is sent via `sendChatMessage`, the state is updated via realtime subscription — but if the Supabase realtime channel isn't connecting (common in PWAs), the sender's own message won't appear.

Fix: after a successful `sendChatMessage`, reload the chat messages directly instead of relying solely on realtime.

- [ ] **Step 1: Update sendChatMessage to reload after send**

In `src/TradingCircles.tsx`, in `sendChatMessage`:
```tsx
async function sendChatMessage(circleCode: string, myId: string) {
  const text = chatInput.trim();
  if (!text || chatSending) return;
  setChatSending(true);
  setChatInput("");
  try {
    await supabase.from("circle_messages").insert({
      circle_code: circleCode,
      sender_id: myId,
      sender_name: profile.name || "Trader",
      sender_handle: profile.handle || "",
      text,
    });
    // Reload to ensure sender sees their own message even without realtime
    await loadChatMessages(circleCode);
  } catch { setChatInput(text); }
  setChatSending(false);
}
```

- [ ] **Step 2: Auto-reload chat when switching to chat tab**

Change the tab onClick to always reload (not just when empty):
```tsx
if (t === "chat") loadChatMessages(activeCircle.code);
```
(Remove the `&& chatMessages.length === 0` guard.)

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/TradingCircles.tsx
git commit -m "fix: reload chat after send; always reload on tab switch"
```

---

## Task 6 — Fix RR calculation: add % of account to circle leaderboard

**Files:**
- Modify: `src/hooks/useCircles.ts`
- Modify: `src/TradingCircles.tsx`

The circle leaderboard shows R-multiple (`totalPnL`) and dollar P&L (`totalPnLDollar`) but not % return. The meeting requested showing P&L as a % of account size. The `profile` has `fundedAmount` (from EvalAccountScreen) or `accountBalance`. If set, compute pnlPercent = totalPnlDollar / accountSize * 100.

- [ ] **Step 1: Add pnlPercent to the published leaderboard entry**

In `src/hooks/useCircles.ts`, in `publishToCircle`:
```tsx
const accountSize = parseFloat((p as any).fundedAmount || (p as any).accountBalance || "0") || 0;
const pnlPercent = accountSize > 0 && s.totalPnlDollar !== 0
  ? (s.totalPnlDollar / accountSize) * 100
  : null;
const entry = {
  // ... existing fields ...
  pnlPercent,  // new field
};
```

- [ ] **Step 2: Show % in circle leaderboard when available**

In `src/TradingCircles.tsx`, in the `metricDisplay` function, update the `dollar` case:
```tsx
if (m === "dollar") {
  const v = entry.totalPnLDollar || 0;
  const pct = (entry as any).pnlPercent;
  const val = pct !== null && pct !== undefined
    ? `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`
    : `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`;
  return { val, raw: v, label: "$ P&L" };
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCircles.ts src/TradingCircles.tsx
git commit -m "feat: add % of account to circle leaderboard dollar P&L display"
```

---

## Task 7 — Fix Calendar: add R ↔ $ display toggle

**Files:**
- Modify: `src/charts.tsx`

`CalendarView` always shows `data.pnl` which is the R-multiple. It should support toggling to show dollar P&L (`pnlDollar`) when available.

- [ ] **Step 1: Update CalendarView props and add toggle state**

In `src/charts.tsx`, update `CalendarView` signature:
```tsx
export function CalendarView({ trades, C, onDayClick }: ChartProps & { onDayClick?: (key: string) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const hasDollar = trades.some(t => t.pnlDollar && t.pnlDollar !== "");
  const [showDollar, setShowDollar] = useState(false);
```

- [ ] **Step 2: Update the dayPnL calculation to support dollar mode**

Change the dayPnL accumulation:
```tsx
const dayPnL: Record<string, { pnl: number; pnlDollar: number; count: number }> = {};
trades.forEach(t => {
  if (t.date) {
    if (!dayPnL[t.date]) dayPnL[t.date] = { pnl: 0, pnlDollar: 0, count: 0 };
    dayPnL[t.date].pnl += parseFloat(t.pnl as string) || 0;
    dayPnL[t.date].pnlDollar += parseFloat(t.pnlDollar as string) || 0;
    dayPnL[t.date].count++;
  }
});
```

- [ ] **Step 3: Add the toggle button and update cell display**

Add a toggle button above the calendar nav (inside the return, before the nav div):
```tsx
{hasDollar && (
  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
    <div style={{ display: "flex", background: C.panel, borderRadius: "999px", border: `1px solid ${C.border2}`, padding: "2px" }}>
      {(["R", "$"] as const).map(mode => (
        <button key={mode} onClick={() => setShowDollar(mode === "$")}
          style={{ padding: "4px 12px", borderRadius: "999px", background: (mode === "$") === showDollar ? C.text : "transparent", color: (mode === "$") === showDollar ? C.bg : C.muted, border: "none", cursor: "pointer", fontFamily: MONO, fontSize: "9px", fontWeight: 600, letterSpacing: "0.1em", transition: "all 0.15s" }}>
          {mode}
        </button>
      ))}
    </div>
  </div>
)}
```

Update cell display value:
```tsx
const displayVal = showDollar && hasDollar
  ? data.pnlDollar
  : data.pnl;
const displayStr = showDollar && hasDollar
  ? `${displayVal >= 0 ? "+" : ""}$${Math.abs(displayVal).toFixed(0)}`
  : `${displayVal >= 0 ? "+" : ""}${displayVal.toFixed(1)}`;
// Replace the existing display with:
{data && <div style={{ fontSize: "10px", color: textCol, fontFamily: MONO, letterSpacing: "0.04em" }}>{displayStr}</div>}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/charts.tsx
git commit -m "feat: add R/$ toggle to CalendarView"
```

---

## Task 8 — Fix CSV sync: rename label + auto-open panel from home

**Files:**
- Modify: `src/Koda.tsx`

Two sub-issues:
1. Home empty state button says "Or import from CSV" — navigates to sync tab but doesn't open the CSV panel.
2. The DataSourcesScreen CSV section heading says "CSV Import" — rename to "Sync from CSV".

The fix for (1): pass a `defaultOpenCsv` flag to `DataSourcesScreen` when navigating from the home page "import" button.

- [ ] **Step 1: Add state to auto-open CSV on nav**

In `src/Koda.tsx`, add state:
```tsx
const [autoOpenCsv, setAutoOpenCsv] = useState(false);
```

- [ ] **Step 2: Set the flag on the home-page empty-state button click**

Find the "Or import from CSV" button (line ~1965):
```tsx
<button onClick={() => navigateTo("sync")} ...>Or import from CSV</button>
```
Change to:
```tsx
<button onClick={() => { setAutoOpenCsv(true); navigateTo("sync"); }} ...>Or sync trades</button>
```

- [ ] **Step 3: Pass autoOpenCsv to DataSourcesScreen**

Find the `<DataSourcesScreen` render and add:
```tsx
autoOpenCsv={autoOpenCsv}
onAutoOpenCsvDone={() => setAutoOpenCsv(false)}
```

- [ ] **Step 4: Update DataSourcesScreen to accept and use the flag**

In `src/DataSourcesScreen.tsx`, add to props interface:
```tsx
autoOpenCsv?: boolean;
onAutoOpenCsvDone?: () => void;
```

Add a useEffect to auto-open when the flag is set:
```tsx
useEffect(() => {
  if (autoOpenCsv) {
    setShowCsv(true);
    onAutoOpenCsvDone?.();
  }
}, [autoOpenCsv]);
```

- [ ] **Step 5: Rename "CSV Import" heading in DataSourcesScreen**

Find `<Kicker C={C as any}>CSV Import</Kicker>` (line ~381) and change to:
```tsx
<Kicker C={C as any}>Sync from CSV</Kicker>
```

- [ ] **Step 6: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add src/Koda.tsx src/DataSourcesScreen.tsx
git commit -m "fix: auto-open CSV panel from home; rename CSV Import to Sync from CSV"
```

---

## Task 9 — Fix Strategies tab showing nothing

**Files:**
- Modify: `src/Koda.tsx`

When `statsTab === "strategies"` is selected and the user has no trades with strategies assigned, the section shows the `WinRateChart` and `MonthlyPnLChart` but both render nothing useful (empty). The meeting reported "nothing coming up". Add a clear empty state explaining why it's empty and what to do.

- [ ] **Step 1: Find the strategies section**

```bash
grep -n "statsTab === \"strategies\"" src/Koda.tsx
```

- [ ] **Step 2: Add an empty state for no trades with strategies**

In the `{statsTab === "strategies" && (` section, check if there are any trades with a strategy set. Add at the top of the section:
```tsx
{statsTab === "strategies" && (
  <>
    {Object.keys(stratStats).length === 0 && (
      <div style={{ padding: "40px 24px", textAlign: "center", background: C.panel, borderRadius: "16px", margin: "8px 0 20px" }}>
        <div style={{ fontFamily: MONO, fontSize: "22px", color: C.border2, marginBottom: "12px" }}>◆</div>
        <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontStyle: "italic", color: C.text2, marginBottom: "6px" }}>No strategy data yet.</div>
        <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted }}>Assign a strategy when logging trades to see your edge breakdown here.</div>
      </div>
    )}
    {/* existing WinRateChart, MonthlyPnLChart, stratStats detail */}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/Koda.tsx
git commit -m "fix: add empty state to strategies tab when no strategy data"
```

---

## Task 10 — Final: push to main

- [ ] **Step 1: Run lint and build**

```bash
cd "C:\Users\Dylon\OneDrive\Desktop\tradr-fresh" && npm run lint 2>&1 | tail -20 && npm run build 2>&1 | tail -10
```

- [ ] **Step 2: Create feature branch and push**

```bash
git checkout -b feat/beta-bug-fixes-may28
git push -u origin feat/beta-bug-fixes-may28
```

Then open a PR. Merge to `main` for auto-deploy to Vercel.

---

## Self-Review Checklist

| Bug # | Description | Task |
|-------|-------------|------|
| 1 | CSV import → blank screen / rename to Sync | Task 8 |
| 2 | Feedback not sending (missing auth) | Task 1 |
| 3 | Feedback says "Send to Dylon" | Task 1 |
| 4 | Pro upgrade not unlocking | Task 3 |
| 5 | Sign out button missing | Task 2 |
| 6 | Circles > Members error state | Task 4 |
| 7 | Circles > Board error state | Task 4 |
| 8 | Chat messages not coming through | Task 5 |
| 9 | Members list only shows Dylon | Task 4 (refresh on tab click) |
| 10 | Strategies tab empty | Task 9 |
| 11 | RR calculation → show % of account | Task 6 |
| 12 | Calendar dollar ↔ % toggle | Task 7 |
| 13 | Settings arrow does nothing | Task 2 |
| 14 | Notification bell (works, low priority) | — |
