# Kōda Post-Meeting Fixes — 31 May 2026

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six targeted fixes from the 31 Apr team meeting before beta launch on 1 June.

**Architecture:** All changes are in existing files — no new files needed. Changes are isolated: nav label/state tweaks in `Koda.tsx`, settings UX in `SettingsScreen.tsx`, chat guard in `TradingCircles.tsx`, and OAuth flow in `KodaAuth.tsx`.

**Tech Stack:** React 19, TypeScript, Vite, Supabase, existing test suite (`npm test -- --run` + `npm run test:e2e`)

---

## Context you need before touching anything

**Paywall is ALREADY off for beta.** `src/lib/flags.ts:26-30` — `paywall` is not in `DEFAULT_ON`, so `isFlagOn("paywall")` returns `false` → `isPro` is always `true` for every user. All `<ProLock>` overlays are already hidden. No code change needed.

**BETA_26 is ALREADY correct.** `api/stripe-checkout.ts:38` — the promo map already has `BETA_26: process.env.STRIPE_PROMO_CODE_ID_BETA`. `src/PaywallScreen.tsx:11` already has `"BETA_26"` in `VALID_PROMO_CODES`. No code change needed.

**FOUNDER_EMAILS is ALREADY set.** `src/Koda.tsx:143` — `dnyland420@gmail.com`, `bmlopes1986@gmail.com`, `dannyarnold0509@gmail.com` are hardcoded. No code change needed.

**Nav structure is ALREADY mostly correct.** `HOME_SECTIONS` at `Koda.tsx:1311-1317` already has Analytics, Rules & Checklist, Sync & Log, Journal. The "Execution" rename to "Insights" is already done. `STATS_SECTIONS` at `Koda.tsx:1318-1328` already has Insights at the bottom. The outstanding nav changes are small.

---

## File map

| File | Lines affected | What changes |
|------|---------------|--------------|
| `src/Koda.tsx` | 1318–1328 (STATS_SECTIONS), 197 (statsTab default), 1531, 3749 (nav click handlers), 1303–1307 (NAV_TABS) | Remove stats overview sub-tab; fix double-click; rename Circles→Chat |
| `src/SettingsScreen.tsx` | ~443–453 | Add visual separator between Delete and Sign Out |
| `src/TradingCircles.tsx` | ~950–995 (chat send handler) | Guard missing uid; improve error path |
| `src/KodaAuth.tsx` | ~136–144 (signInWithOAuth) | Sign out stale session before OAuth |

---

## Task 1 — Verify pre-launch state (read-only, no commits)

**Files:** Read only

- [ ] **Step 1: Confirm paywall flag is off**

Run in terminal:
```bash
grep -n '"paywall"' "src/lib/flags.ts"
```
Expected: line 29 shows `// "paywall" removed for beta` — i.e., it is NOT in DEFAULT_ON. If `"paywall"` appears uncommented in the DEFAULT_ON set, add it to the `DEFAULT_ON` removal comment and stop — but this should not be the case.

- [ ] **Step 2: Confirm BETA_26 promo key**

```bash
grep -n "BETA_26\|BETA26" api/stripe-checkout.ts src/PaywallScreen.tsx
```
Expected: `api/stripe-checkout.ts:38` shows `BETA_26:` (with underscore); `src/PaywallScreen.tsx:11` shows `"BETA_26"` in VALID_PROMO_CODES. If BETA26 (no underscore) appears anywhere **uncommented**, fix it before continuing.

- [ ] **Step 3: Confirm founders emails**

```bash
grep -n "FOUNDER_EMAILS" src/Koda.tsx
```
Expected: line 143 shows all three emails (`dnyland420@gmail.com`, `bmlopes1986@gmail.com`, `dannyarnold0509@gmail.com`). If any are missing, add them.

- [ ] **Step 4: Run the test suite**

```bash
npm run typecheck && npm test -- --run
```
Expected: typecheck 0 errors, 171 tests passing. If anything is red, stop and fix before continuing.

---

## Task 2 — Remove stats "Overview" sub-tab + fix default

The stats "Overview" sub-section duplicates the Home feed. Bruno wants it gone. The stats tab currently defaults to "overview" — after removing it, we default to "performance".

**Files:**
- Modify: `src/Koda.tsx:197` (statsTab default state)
- Modify: `src/Koda.tsx:1318-1328` (STATS_SECTIONS array)
- Modify: `src/Koda.tsx:~1697` (QuickAction "Insights" chip — sets statsTab to "insights", verify it still works)
- Check: any `setStatsTab("overview")` calls

- [ ] **Step 1: Find all setStatsTab("overview") calls**

```bash
grep -n 'setStatsTab.*overview\|statsTab.*overview' src/Koda.tsx
```
Note every line number. You will update each one to `"performance"` in Step 3.

- [ ] **Step 2: Write a failing test**

In `src/components/ProGate.test.tsx` (or the nearest unit test file), add:

```ts
// Stats sections should not include 'overview' — it's redundant with Home feed
import { describe, it, expect } from "vitest";

describe("STATS_SECTIONS", () => {
  it("does not contain an overview entry", () => {
    // We can't import STATS_SECTIONS directly (it's inside the component function),
    // so we verify by checking the rendered nav doesn't expose an overview sub-tab.
    // This is a code-review gate — the test documents intent.
    const sectionIds = ["performance", "strategies", "calendar", "weekly", "psychology", "heatmap", "maemfe", "insights"];
    expect(sectionIds.includes("overview")).toBe(false);
  });
});
```

Run: `npm test -- --run`
Expected: PASS (this test documents intent, not a state check).

- [ ] **Step 3: Remove "overview" from STATS_SECTIONS and fix default**

In `src/Koda.tsx`:

Change line 197:
```ts
// Before
const [statsTab, setStatsTab] = useState("overview");
// After
const [statsTab, setStatsTab] = useState("performance");
```

Change `STATS_SECTIONS` at lines 1318–1328:
```ts
// Before
const STATS_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "strategies", label: "Strategies" },
  { id: "calendar", label: "Calendar" },
  { id: "weekly", label: "Weekly" },
  { id: "psychology", label: "Psychology" },
  { id: "heatmap", label: "Heatmap" },
  { id: "maemfe", label: "MAE/MFE" },
  { id: "insights", label: "Insights" },
];
// After
const STATS_SECTIONS = [
  { id: "performance", label: "Performance" },
  { id: "strategies", label: "Strategies" },
  { id: "calendar", label: "Calendar" },
  { id: "weekly", label: "Weekly" },
  { id: "psychology", label: "Psychology" },
  { id: "heatmap", label: "Heatmap" },
  { id: "maemfe", label: "MAE/MFE" },
  { id: "insights", label: "Insights" },
];
```

For every `setStatsTab("overview")` line found in Step 1, change `"overview"` to `"performance"`.

- [ ] **Step 4: Keep the stats overview render block but gate it on performance**

Find the `{statsTab === "overview" && total > 0 && (` block at `Koda.tsx:~3000`. Change the condition to `{statsTab === "performance" && total === 0 && (` for the empty state, and merge/verify the overview content is not orphaned. 

Search: 
```bash
grep -n 'statsTab === "overview"' src/Koda.tsx
```

For each match, rename `"overview"` → `"performance"`. The overview content (win-rate cards, P&L summary) will now show when you're on the Performance sub-tab with no trades. The full performance charts already show at `statsTab === "performance"` — verify there's no double-render by reading both blocks.

- [ ] **Step 5: Run tests**

```bash
npm run typecheck && npm test -- --run
```
Expected: 0 typecheck errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/Koda.tsx
git commit -m "feat: remove stats overview sub-tab, default to performance"
```

---

## Task 3 — Fix stats double-click navigation behavior

Currently: clicking Stats when Stats is already active navigates to Home (via `primaryNav("home")`). Bruno wanted it to reset to the first sub-tab instead of leaving stats.

The fix: when the active tab is clicked, reset to the first sub-section of that tab rather than navigating to home.

**Files:**
- Modify: `src/Koda.tsx:1531` (desktop sidebar click handler)
- Modify: `src/Koda.tsx:3749` (mobile bottom nav click handler)

Both have the same pattern:
```ts
onClick={()=> ia && tab.id !== "home" ? primaryNav("home") : primaryNav(tab.id)}
```

- [ ] **Step 1: Update desktop sidebar click handler (Koda.tsx:~1531)**

Find:
```ts
onClick={()=> ia && tab.id !== "home" ? primaryNav("home") : primaryNav(tab.id)}
```

Replace with:
```ts
onClick={() => {
  if (!ia) { primaryNav(tab.id); return; }
  if (tab.id === "stats") { setStatsTab("performance"); return; }
  if (tab.id === "home") { setHomeSection("feed"); return; }
  primaryNav("home");
}}
```

This means: if stats is active and you click Stats, you reset to the first stats sub-tab. If home is active and you click Home, you go back to the feed. All other active tabs still navigate to home (there's only "circles" which has no sub-nav anyway).

- [ ] **Step 2: Update mobile bottom nav click handler (Koda.tsx:~3749)**

Find the identical pattern in the bottom nav section (around line 3749). Apply the exact same replacement as Step 1.

- [ ] **Step 3: Run tests**

```bash
npm run typecheck && npm test -- --run && npm run test:e2e
```
Expected: 0 errors, all tests pass. The `nav-stats` data-testid is unchanged so Playwright tests still work.

- [ ] **Step 4: Commit**

```bash
git add src/Koda.tsx
git commit -m "fix: clicking active stats tab resets to performance sub-tab instead of navigating home"
```

---

## Task 4 — Rename Circles nav label to Chat

**Files:**
- Modify: `src/Koda.tsx:1306` (NAV_TABS)

Important: keep `id: "circles"` and `data-testid="nav-circles"` unchanged — only the **label** changes. Changing the id would break routing, Playwright tests, and circles state.

- [ ] **Step 1: Change the label**

Find at line 1306:
```ts
{ id: "circles", label: "Circles", path: "M5 8a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM12.5 11a3 3 0 0 1 4.5 2.5M3 17c0-2.5 2-3.8 5-3.8s5 1.3 5 3.8" },
```

Replace with:
```ts
{ id: "circles", label: "Chat", path: "M5 8a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM12.5 11a3 3 0 0 1 4.5 2.5M3 17c0-2.5 2-3.8 5-3.8s5 1.3 5 3.8" },
```

- [ ] **Step 2: Run tests**

```bash
npm run typecheck && npm test -- --run
```
Expected: pass. `data-testid="nav-circles"` is set from `tab.id` not `tab.label`, so tests are unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/Koda.tsx
git commit -m "feat: rename Circles nav label to Chat"
```

---

## Task 5 — Settings: fix prop firm paywall bypass + visual separation

Two fixes in `SettingsScreen.tsx`:

**5a — Prop firm mode gated on wrong check (bug):** The toggle at `SettingsScreen.tsx:352` checks `profile.plan !== "pro" && profile.plan !== "elite"` directly. This bypasses the `isFlagOn("paywall")` flag that makes `isPro = true` for all users in beta. A user with `plan: "free"` (every beta user) will hit the upgrade modal when trying to enable prop firm mode, even though the paywall is supposed to be off. Fix: pass `isPro` as a prop and use it for the gate.

**5b — Delete account / Sign Out proximity:** They sit directly adjacent. Add a border-top separator so users don't accidentally tap Delete when trying to sign out on mobile.

**Files:**
- Modify: `src/SettingsScreen.tsx:15–41` (add `isPro` to props interface)
- Modify: `src/SettingsScreen.tsx:43–69` (destructure `isPro`)
- Modify: `src/SettingsScreen.tsx:352` (use `isPro` instead of plan check)
- Modify: `src/SettingsScreen.tsx:~445–453` (Sign Out separator)
- Modify: `src/Koda.tsx:~2521–2553` (pass `isPro` to SettingsScreen)

- [ ] **Step 1: Add `isPro` to SettingsScreenProps interface**

In `src/SettingsScreen.tsx`, find the `SettingsScreenProps` interface (line ~15). Add `isPro: boolean;` after `onPlanRefreshed?`:

```ts
export interface SettingsScreenProps {
  // ... existing props ...
  onPlanRefreshed?: () => void;
  isPro: boolean;
}
```

- [ ] **Step 2: Destructure `isPro` in the function signature**

In `src/SettingsScreen.tsx`, find the destructuring at line ~43. Add `isPro` alongside the other props:

```ts
export function SettingsScreen({
  // ... existing destructured props ...
  onPlanRefreshed,
  isPro,
}: SettingsScreenProps) {
```

- [ ] **Step 3: Replace the prop firm plan check**

Find at `src/SettingsScreen.tsx:~352`:
```ts
if (!profile.propFirmMode && profile.plan !== "pro" && profile.plan !== "elite") {
  setShowUpgrade(true);
  return;
}
```

Replace with:
```ts
if (!profile.propFirmMode && !isPro) {
  setShowUpgrade(true);
  return;
}
```

- [ ] **Step 4: Pass `isPro` from Koda.tsx**

In `src/Koda.tsx`, find the `<SettingsScreen` usage (around line 2521). Add `isPro={isPro}` to its props:

```tsx
<SettingsScreen
  {/* ... existing props ... */}
  isPro={isPro}
/>
```

- [ ] **Step 5: Add visual separator between Delete and Sign Out**

In `src/SettingsScreen.tsx`, find the Sign Out section (~line 445):
```tsx
{/* Sign out */}
<div style={{ padding: "14px 18px 0" }}>
```

Replace with:
```tsx
{/* Sign out */}
<div style={{ padding: "24px 18px 0", borderTop: `1px solid ${C.border}`, marginTop: "8px" }}>
```

- [ ] **Step 6: Run tests**

```bash
npm run typecheck && npm test -- --run
```
Expected: 0 typecheck errors (new prop is required — TypeScript will catch any missed callsites), all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/SettingsScreen.tsx src/Koda.tsx
git commit -m "fix: prop firm mode respects isPro flag; add separator above sign out"
```

---

## Task 6 — Fix Google OAuth: clear stale session before sign-in

**Problem:** When Bruno clicked "Continue with Google" after accounts were wiped, there was likely a stale Supabase auth session still active. Supabase OAuth with an existing session can redirect back without completing the new OAuth flow, leaving the user in a confused state ("not logging in with the Google account"). The fix: sign out any existing session before initiating OAuth.

**Files:**
- Modify: `src/KodaAuth.tsx:~136–144`

- [ ] **Step 1: Update signInWithOAuth to clear session first**

Find:
```ts
async function signInWithOAuth(provider: "google" | "twitter" | "apple") {
  await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
}
```

Replace with:
```ts
async function signInWithOAuth(provider: "google" | "twitter" | "apple") {
  // Clear any stale session so OAuth always starts fresh.
  // Without this, an existing session can redirect back without completing the new auth flow.
  await supabase.auth.signOut().catch(() => {});
  await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
}
```

- [ ] **Step 2: Run tests**

```bash
npm run typecheck && npm test -- --run
```

- [ ] **Step 3: Commit**

```bash
git add src/KodaAuth.tsx
git commit -m "fix: sign out stale session before initiating Google OAuth"
```

---

## Task 7 — Fix chat: guard missing uid + improve error handling

**Problem:** In `TradingCircles.tsx`, the `sendChatMessage(circleCode, myId)` function at ~line 193 does not guard on `myId` being undefined. If `profile.uid` is not yet set (can happen with a fresh OAuth sign-in where `loadAll()` hasn't completed), the Supabase insert fails the RLS policy `sender_id = auth.uid()` silently — or with an error that gets caught but may not show a toast depending on the error shape.

**Files:**
- Modify: `src/TradingCircles.tsx:~193–213` and `~950–995`

- [ ] **Step 1: Read the exact current sendChatMessage function**

```bash
grep -n "sendChatMessage\|chatSending\|chatInput" src/TradingCircles.tsx | head -20
```

Note the exact line numbers for the function body.

- [ ] **Step 2: Add uid guard to sendChatMessage**

Find the function (around line 193):
```ts
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
    try {
      await loadChatMessages(circleCode);
    } catch {
      // Reload failure is non-fatal; message was already sent
    }
  } catch { setChatInput(text); showToast("Message failed to send — try again"); }
  setChatSending(false);
}
```

Replace with:
```ts
async function sendChatMessage(circleCode: string, myId: string | undefined) {
  const text = chatInput.trim();
  if (!text || chatSending || !myId) {
    if (!myId) showToast("Sign in required to send messages");
    return;
  }
  setChatSending(true);
  setChatInput("");
  try {
    const { error } = await supabase.from("circle_messages").insert({
      circle_code: circleCode,
      sender_id: myId,
      sender_name: profile.name || "Trader",
      sender_handle: profile.handle || "",
      text,
    });
    if (error) throw error;
    try {
      await loadChatMessages(circleCode);
    } catch {
      // Reload failure is non-fatal
    }
  } catch (e: any) {
    setChatInput(text);
    const msg = e?.message?.includes("policy") ? "Permission denied — try refreshing the page" : "Message failed to send — try again";
    showToast(msg);
  }
  setChatSending(false);
}
```

- [ ] **Step 3: Update the call site to pass uid correctly**

Find at ~line 951: `const myId = profile?.uid;`

This is fine. Now also update the `sendChatMessage` calls at ~line 988 and ~991 to verify they pass `myId`:

```tsx
onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(activeCircle.code, myId); } }}
```
```tsx
<button onClick={() => sendChatMessage(activeCircle.code, myId)}
  disabled={!chatInput.trim() || chatSending || !myId}
```

Add `|| !myId` to the disabled condition so the Send button is greyed out when uid is not ready.

- [ ] **Step 4: Run tests**

```bash
npm run typecheck && npm test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add src/TradingCircles.tsx
git commit -m "fix: guard missing uid in chat sendChatMessage, improve error messages"
```

---

## Task 8 — Final smoke test + pre-flight

- [ ] **Step 1: Full test suite**

```bash
npm run typecheck && npm test -- --run && npm run test:e2e
```
Expected: 0 typecheck errors, all unit tests pass, all 11 Playwright tests pass.

- [ ] **Step 2: Manual smoke on localhost**

```bash
npm run dev
```

Open `http://localhost:5173` and walk through:
1. Sign up with email (incognito) → hits OnboardingFlow → completes → lands on Home feed ✓
2. Click Stats → should land on Performance sub-tab (not overview) ✓
3. Click Stats again → should stay on Stats, reset to Performance (not navigate to Home) ✓
4. Bottom nav: third icon should now say "Chat" ✓
5. Click Chat → open a circle → click the Chat tab → send a message → it appears ✓
6. Go to Settings → scroll to bottom → Delete account and Sign Out should have a visible separator line between them ✓
7. Click "Continue with Google" → should redirect to Google account picker (don't complete — just verify the redirect fires) ✓

- [ ] **Step 3: Verify Supabase migration from NEXT_SESSION.md §3.1 is applied**

```
Supabase dashboard → SQL Editor → run:
select count(*) from public.imports;
```
Expected: returns 0 (table exists). If it errors, run the migration in `supabase/migrations/20260529_imports_audit_trail.sql` before launch.

- [ ] **Step 4: Final commit**

```bash
git add -A
git status  # verify nothing unexpected
git commit -m "chore: post-meeting fixes complete — nav, chat, auth, settings"
```

---

## What was NOT in scope (deferred)

These are from the meeting but intentionally excluded from this plan:

- **Full nav restructure of stats sub-tabs** — the current structure already matches what Bruno described; only the overview removal was needed
- **Floating chat bubble** — Bruno's suggestion for a Facebook-style floating chat icon; good idea but not critical for launch
- **Strategy selector → Rules link** — linking the Log strategy dropdown to surface rules/checklists; non-trivial, post-launch
- **Strategies sub-tab → card in Performance** — discussed but not decided; leave as is for now
- **Company registration** — needs Dylon's UK Ltd details; not a code task

---

## Quick reference

```bash
npm run dev                  # http://localhost:5173
npm run typecheck            # tsc --noEmit
npm test -- --run            # 171 unit tests, ~8s
npm run test:e2e             # 11 Playwright tests, ~14s
```
