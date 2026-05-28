# Kōda Private Beta Launch Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all remaining audit + visual pass work across 4 sequential PRs so Kōda is ready for private beta at `kodatrade.co.uk`.

**Architecture:** 4 independent git branches, merged in order. Each branch is a self-contained PR that passes CI before merge. Visual pass tasks (Batch 3) use exact code from `docs/superpowers/plans/2026-05-26-koda-visual-pass-v2.md` — that document is the code source for those tasks.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase + Vercel. Node 20. Pre-commit hooks run `tsc --noEmit` + ESLint on every commit.

**New domain:** `kodatrade.co.uk` (confirmed 2026-05-28 — replaces `tradrjournal.xyz`).

**Verification shorthand:** Every task ends with a build check. "Build passes" = `npm run build` exits 0 with no new errors.

---

## BATCH 1 — Commit existing work + .env.example update

**Branch:** `feat/batch1-quick-fixes`  
**Creates/modifies:** `src/shared.tsx`, `src/Koda.tsx`, `src/EvalAccountScreen.tsx`, `src/tradeConstants.ts`, `.env.example`

---

### Task 1: Commit the localDateStr timezone fix

These 4 files are already modified in the working tree. Just stage and commit.

- [ ] **Step 1: Verify the changes are clean**

```powershell
cd "C:\Users\Dylon\OneDrive\Desktop\tradr-fresh"
git diff --stat HEAD
```

Expected: 4 modified files (`src/shared.tsx`, `src/Koda.tsx`, `src/EvalAccountScreen.tsx`, `src/tradeConstants.ts`) and `.superpowers/` untracked. Nothing else.

- [ ] **Step 2: Build to confirm no regressions**

```powershell
npm run build
```

Expected: Build exits 0 with no errors.

- [ ] **Step 3: Create the branch and commit**

```powershell
git checkout -b feat/batch1-quick-fixes
git add src/shared.tsx src/Koda.tsx src/EvalAccountScreen.tsx src/tradeConstants.ts
git commit -m "fix: replace UTC date slicing with localDateStr() for correct timezone handling"
```

Expected: Commit succeeds. Pre-commit hook runs tsc — should pass.

---

### Task 2: Update .env.example for new domain + encryption key rename

**File:** `.env.example`

Two changes: update `APP_URL` default and rename the encryption key.

- [ ] **Step 1: Update APP_URL default**

Find this line in `.env.example`:
```
APP_URL=https://tradrjournal.xyz
```

Replace with:
```
APP_URL=https://kodatrade.co.uk
```

- [ ] **Step 2: Rename encryption key entry**

Find these lines:
```
# Note: env var name will be renamed from TRADR_ENCRYPTION_KEY → KODA_ENCRYPTION_KEY in a future release.
TRADR_ENCRYPTION_KEY=64-hex-chars-here
```

Replace with:
```
KODA_ENCRYPTION_KEY=64-hex-chars-here
```

- [ ] **Step 3: Commit**

```powershell
git add .env.example
git commit -m "chore: update APP_URL default to kodatrade.co.uk, rename TRADR_ENCRYPTION_KEY"
```

---

### Task 3: Push Batch 1 and open PR

- [ ] **Step 1: Push**

```powershell
git push -u origin feat/batch1-quick-fixes
```

- [ ] **Step 2: Open PR**

GitHub will print a PR URL. Open it, wait for CI green (lint + tsc + build), then merge.

- [ ] **Step 3: Switch back to main**

```powershell
git checkout main
git pull origin main
```

---

## BATCH 2 — Brand sweep + domain migration

**Branch:** `feat/batch2-brand-sweep`  
**Modifies:** `src/BetaGate.tsx`, `src/KodaAuth.tsx`, `src/Koda.tsx`, `src/SettingsScreen.tsx`, `src/TradingCircles.tsx`, `src/FriendsFeed.tsx`, `api/broker/[action].ts`, `api/feedback.ts`, `api/cron/complete-challenges.ts`, `api/cron/sync.ts`, `api/reset-password.ts`, `api/lib/cryptoUtils.ts`

> **Prerequisite — Dylon must do in Vercel dashboard BEFORE merging this PR:**
> 1. Add `kodatrade.co.uk` and `www.kodatrade.co.uk` as custom domains in Vercel → project settings → Domains
> 2. Set `APP_URL=https://kodatrade.co.uk` in Vercel env vars (Production + Preview)
> 3. Add `KODA_ENCRYPTION_KEY` = same 64-hex-char value as the existing `TRADR_ENCRYPTION_KEY`

- [ ] **Step 1: Create branch**

```powershell
git checkout -b feat/batch2-brand-sweep
```

---

### Task 4: BetaGate — replace "kd" SVG text with 4-chevron mark

**File:** `src/BetaGate.tsx` — `KodaMarkFilled` component at approximately L40–47.

- [ ] **Step 1: Find the component**

The component looks like:
```tsx
function KodaMarkFilled({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" ...>
      ...
      <text ...>kd</text>
    </svg>
  );
}
```

- [ ] **Step 2: Replace with 4-chevron mark**

Replace the entire `KodaMarkFilled` function with:
```tsx
function KodaMarkFilled({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.8)} viewBox="0 0 100 80" fill="none" style={{ display: "block", flexShrink: 0 }}>
      <polyline points="8,8 22,40 8,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="28,8 42,40 28,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="48,8 62,40 48,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="68,8 82,40 68,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
    </svg>
  );
}
```

(`TEXT` is already defined as a constant at the top of BetaGate.tsx — it's the light text colour.)

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: Build passes.

- [ ] **Step 4: Commit**

```powershell
git add src/BetaGate.tsx
git commit -m "feat: replace BetaGate kd text mark with 4-chevron SVG"
```

---

### Task 5: KodaAuth — update USERNAME_DOMAIN

**File:** `src/KodaAuth.tsx` — L44.

- [ ] **Step 1: Find and replace**

Find:
```ts
const USERNAME_DOMAIN = "users.tradr.app";
```

Replace with:
```ts
const USERNAME_DOMAIN = "users.kodatrade.co.uk";
```

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add src/KodaAuth.tsx
git commit -m "fix: update USERNAME_DOMAIN to users.kodatrade.co.uk"
```

---

### Task 6: API files — update CORS fallback URLs (5 files)

The `APP_URL` constant already derives from `process.env.APP_URL` — so when Vercel has the correct `APP_URL`, the CORS will work. This task just updates the hardcoded fallback strings so local dev and cold-start defaults are correct.

**Files:** `api/broker/[action].ts`, `api/feedback.ts`, `api/cron/sync.ts`, `api/reset-password.ts`, `api/cron/complete-challenges.ts`

- [ ] **Step 1: Update broker/[action].ts**

Find:
```ts
const APP_URL = process.env.APP_URL ?? "https://tradrjournal.xyz";
```
Replace with:
```ts
const APP_URL = process.env.APP_URL ?? "https://kodatrade.co.uk";
```

- [ ] **Step 2: Update api/feedback.ts**

Same change — find `process.env.APP_URL ?? "https://tradrjournal.xyz"` and replace fallback with `"https://kodatrade.co.uk"`.

- [ ] **Step 3: Update api/cron/sync.ts**

Same change — find the `APP_URL` constant and update the fallback.

- [ ] **Step 4: Update api/reset-password.ts**

Two changes in this file:
1. Find `process.env.APP_URL ?? "https://tradrjournal.xyz"` → update fallback.
2. Find `from: "Kōda <noreply@tradrjournal.xyz>"` (around L122) → replace with `"Kōda <noreply@kodatrade.co.uk>"`.

- [ ] **Step 5: Update api/cron/complete-challenges.ts**

Find:
```ts
res.setHeader("Access-Control-Allow-Origin", process.env.APP_URL ?? "https://tradrjournal.xyz");
```
Replace fallback with `"https://kodatrade.co.uk"`.

- [ ] **Step 6: Build + commit**

```powershell
npm run build
git add "api/broker/[action].ts" api/feedback.ts api/cron/sync.ts api/reset-password.ts api/cron/complete-challenges.ts
git commit -m "fix: update CORS fallback URLs to kodatrade.co.uk"
```

---

### Task 7: Update domain URLs in src files (6 occurrences)

- [ ] **Step 1: src/Koda.tsx — PDF footer (L1318)**

Find:
```ts
+ "<div class=\"footer\">Generated by Kōda · tradrjournal.xyz · " + today + "</div>"
```
Replace `tradrjournal.xyz` with `kodatrade.co.uk`.

- [ ] **Step 2: src/Koda.tsx — share button (L3104)**

Find the share button that builds the tweet text. It contains `https://tradrjournal.xyz`. Replace with `https://kodatrade.co.uk`.

- [ ] **Step 3: src/Koda.tsx — join comment (L366)**

Find the comment: `// tradrjournal.xyz/?join=TRADR-ABCD-EFGH → open join flow pre-filled`

Replace with: `// kodatrade.co.uk/?join=KODA-XXXX → open join flow pre-filled`

- [ ] **Step 4: src/FriendsFeed.tsx — share URL (L424)**

Find: `https://tradrjournal.xyz` inside the tweet intent URL string.
Replace with: `https://kodatrade.co.uk`.

- [ ] **Step 5: src/SettingsScreen.tsx — profile URL (L311)**

Find: `` `https://tradrjournal.xyz/@${handle}` ``
Replace with: `` `https://kodatrade.co.uk/@${handle}` ``

- [ ] **Step 6: src/TradingCircles.tsx — circle join URLs (L365 and L1078)**

Find both occurrences of `` `https://tradrjournal.xyz/?join=${`` ``
Replace with: `` `https://kodatrade.co.uk/?join=${`` ``

- [ ] **Step 7: Build + commit**

```powershell
npm run build
git add src/Koda.tsx src/FriendsFeed.tsx src/SettingsScreen.tsx src/TradingCircles.tsx
git commit -m "fix: replace tradrjournal.xyz with kodatrade.co.uk in all src files"
```

---

### Task 8: Rename TRADR_ENCRYPTION_KEY → KODA_ENCRYPTION_KEY in code

**File:** `api/lib/cryptoUtils.ts`

- [ ] **Step 1: Replace all 3 occurrences**

The file has 3 references to `TRADR_ENCRYPTION_KEY` (L10 comment, L23 read, L26 error string). Replace all three:

L10 comment:
```ts
//   TRADR_ENCRYPTION_KEY — 64 hex characters (32 bytes).
```
→
```ts
//   KODA_ENCRYPTION_KEY — 64 hex characters (32 bytes).
```

L23:
```ts
const hex = process.env.TRADR_ENCRYPTION_KEY;
```
→
```ts
const hex = process.env.KODA_ENCRYPTION_KEY;
```

L26 error string:
```ts
"TRADR_ENCRYPTION_KEY env var is missing or wrong length. "
```
→
```ts
"KODA_ENCRYPTION_KEY env var is missing or wrong length. "
```

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add api/lib/cryptoUtils.ts
git commit -m "fix: rename TRADR_ENCRYPTION_KEY to KODA_ENCRYPTION_KEY in cryptoUtils"
```

---

### Task 9: Update email.ts domain references

**File:** `api/lib/email.ts`

- [ ] **Step 1: Update FROM address and all links**

Find `"Kōda <noreply@tradrjournal.xyz>"` → replace with `"Kōda <noreply@kodatrade.co.uk>"`.

Find all `https://tradrjournal.xyz` occurrences inside the HTML templates (in `weeklyRecapHtml` and `receiptHtml`) → replace with `https://kodatrade.co.uk`.

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add api/lib/email.ts
git commit -m "fix: update email FROM address and links to kodatrade.co.uk"
```

---

### Task 10: Push Batch 2 and open PR

- [ ] **Step 1: Push**

```powershell
git push -u origin feat/batch2-brand-sweep
```

- [ ] **Step 2: Verify in preview**

Once Vercel posts a preview URL on the PR:
- Open the preview URL
- Go through the beta gate (if VITE_BETA_PASSWORD is set)
- Check the app loads correctly
- Verify share buttons produce `kodatrade.co.uk` URLs
- Check Settings → copy profile link shows new domain

- [ ] **Step 3: Merge and return to main**

Merge the PR. Then:
```powershell
git checkout main
git pull origin main
```

---

## BATCH 3 — Visual pass

**Branch:** `feat/batch3-visual-pass`  
**Code source:** All exact code for Tasks 11–25 is in `docs/superpowers/plans/2026-05-26-koda-visual-pass-v2.md`. Each task below references the corresponding "Task N" in that document.

- [ ] **Step 1: Create branch**

```powershell
git checkout -b feat/batch3-visual-pass
```

---

### Task 11: 9 missing CSS keyframes

**File:** `src/index.css`  
**Plan ref:** Task 1 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Add keyframes**

Open `src/index.css`. Inside the `@media (prefers-reduced-motion: no-preference)` block, after the last existing `@keyframes` line, add the 9 keyframes from Task 1 Step 1 of the visual pass plan.

The keyframes to add: `kRise`, `kCount`, `kStreakGlow`, `kTick`, `kDrawer`, `kRipple`, `kShimmer`, `kConfettiA`, `kSheen`.

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add src/index.css
git commit -m "feat: add 9 missing design-spec keyframes (kRise, kDrawer, kShimmer, etc.)"
```

---

### Task 12: Empty/skeleton/error state components

**File:** `src/shared.tsx`  
**Plan ref:** Task 2 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Append components to shared.tsx**

At the end of `src/shared.tsx`, before the final closing, append the components from Task 2 Step 1 of the visual pass plan:
- `SkeletonBar`
- `EmptyTradesState`
- `EmptyCirclesState`
- `EmptyInboxState`
- `ErrorOfflineState`
- `ErrorSyncFailedState`

- [ ] **Step 2: Build + type-check**

```powershell
npm run build
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```powershell
git add src/shared.tsx
git commit -m "feat: add empty/skeleton/error state components to shared.tsx"
```

---

### Task 13: Wire empty states + offline detection into Koda.tsx

**File:** `src/Koda.tsx`  
**Plan ref:** Task 3 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Add imports**

In the import from `./shared`, add: `EmptyTradesState, EmptyCirclesState, EmptyInboxState, ErrorOfflineState`

- [ ] **Step 2: Add online/offline state**

After the existing `useState` declarations (around L300 area), add:
```tsx
const [isOnline, setIsOnline] = useState(() => navigator.onLine);
useEffect(() => {
  const up = () => setIsOnline(true);
  const dn = () => setIsOnline(false);
  window.addEventListener("online", up);
  window.addEventListener("offline", dn);
  return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
}, []);
```

- [ ] **Step 3: Add offline overlay**

Near the `<ToastStack>` render, add the offline overlay from Task 3 Step 3 of the visual pass plan.

- [ ] **Step 4: Replace trades empty state**

Find the existing empty-trades fallback (search for `"Every edge starts with data"` or similar empty-state text). Replace with:
```tsx
{trades.length === 0 && (
  <EmptyTradesState C={C} onLog={() => navigateTo("log")} onSync={() => setHomeSection("sync")} />
)}
```

- [ ] **Step 5: Build + commit**

```powershell
npm run build
git add src/Koda.tsx
git commit -m "feat: offline detection + empty states wired in Koda.tsx"
```

---

### Task 14: Wire EmptyCircles into TradingCircles + CornerGlow

**File:** `src/TradingCircles.tsx`  
**Plan ref:** Task 4 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Import EmptyCirclesState**

Add `EmptyCirclesState` to the import from `./shared`.

- [ ] **Step 2: Replace circles empty state**

Find the current empty circles fallback. Replace with:
```tsx
<EmptyCirclesState C={C} onDiscover={() => setDiscoverOpen(true)} onJoin={() => setJoinOpen(true)} />
```

(Check the actual state setter names in TradingCircles.tsx for the discover/join modals — they may differ slightly.)

- [ ] **Step 3: Apply CornerGlow to circle cards**

Find where `myCircles.map(...)` renders each card. Apply the glass card style from Task 4 Step 2 of the visual pass plan.

- [ ] **Step 4: Build + commit**

```powershell
npm run build
git add src/TradingCircles.tsx
git commit -m "feat: empty circles state + CornerGlow visual pass on circle cards"
```

---

### Task 15: Celebration overlays (trade, streak, pro)

**Files:** `src/shared.tsx`, `src/Koda.tsx`  
**Plan ref:** Task 5 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Check if CelebrationOverlay already exists**

```powershell
grep -n "CelebrationOverlay" src/shared.tsx
```

If it already exists, skip Step 2 and go to Step 3.

- [ ] **Step 2: Add CelebrationOverlay to shared.tsx**

Append the `CelebrationOverlay` component from Task 5 Step 1 of the visual pass plan to `src/shared.tsx`.

- [ ] **Step 3: Check if celebration state already in Koda.tsx**

```powershell
grep -n "celebration" src/Koda.tsx | head -5
```

If `setCelebration` already exists and `CelebrationOverlay` is already in the render, this task is complete. Verify with `npm run build`.

- [ ] **Step 4: If not wired — wire into Koda.tsx**

Follow Task 5 Step 2 of the visual pass plan to add `celebration` state and wire the overlay into the render.

- [ ] **Step 5: Build + commit**

```powershell
npm run build
npx tsc --noEmit
git add src/shared.tsx src/Koda.tsx
git commit -m "feat: trade/streak/pro celebration overlays"
```

---

### Task 16: EvalAccountScreen visual pass

**File:** `src/EvalAccountScreen.tsx`  
**Plan ref:** Task 6 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Apply visual system**

Following Task 6 of the visual pass plan:
1. Wrap section headers (`"PROFIT TARGET"`, `"DAILY LOSS"`, `"MAX DRAWDOWN"`) in `<Kicker C={C}>...</Kicker>`
2. Big balance number → `fontFamily: DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em"`
3. Progress bar color logic:
```tsx
const barColor = (used: number, limit: number) => {
  const pct = limit > 0 ? used / limit : 0;
  return pct >= 0.75 ? C.red : pct >= 0.5 ? "#f59e0b" : C.green;
};
```
4. Verify PASSING/AT_RISK/FAILED badges use `C.green / "#f59e0b" / C.red`.

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add src/EvalAccountScreen.tsx
git commit -m "feat: EvalAccountScreen visual pass — Kicker headers, progress bar colors"
```

---

### Task 17: LotSizeCalculator — kDrawer animation + glass header

**File:** `src/LotSizeCalculator.tsx`  
**Plan ref:** Task 7 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Apply kDrawer + glass styles**

Following Task 7 Steps 2–3 of the visual pass plan:
- Outer sheet wrapper: `animation: "kDrawer 0.32s cubic-bezier(.2,.8,.2,1)"`, rounded top corners, box-shadow
- Glass header: `backdropFilter: "blur(20px) saturate(160%)"`, add drag handle pill
- Result numbers: `fontFamily: DISPLAY, fontSize: 28, fontWeight: 600`
- Labels: `fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase"`

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add src/LotSizeCalculator.tsx
git commit -m "feat: LotSizeCalculator glass header + kDrawer animation"
```

---

### Task 18: ReviewInboxScreen visual pass

**File:** `src/ReviewInboxScreen.tsx`  
**Plan ref:** Task 8 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Apply mint dot + draft pill row pattern**

Following Task 8 Step 2 of the visual pass plan, update each draft trade row to include:
- 7px mint dot: `<div style={{ width: 7, height: 7, borderRadius: "50%", background: C.live, flexShrink: 0 }} />`
- Draft pill: `<div style={{ padding: "2px 8px", borderRadius: 999, background: \`${C.live}20\`, border: \`1px solid ${C.live}40\`, fontFamily: MONO, fontSize: 9, letterSpacing: "0.10em", color: C.live, textTransform: "uppercase" as const }}>DRAFT</div>`

- [ ] **Step 2: Build + commit**

```powershell
npm run build
git add src/ReviewInboxScreen.tsx
git commit -m "feat: ReviewInboxScreen mint dot + draft pill row visual pass"
```

---

### Task 19: LogTradeScreen visual pass

**File:** `src/LogTradeScreen.tsx`  
**Plan ref:** Task 9 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Check FloatingInput usage**

```powershell
grep -n "FloatingInput" src/LogTradeScreen.tsx | head -5
```

- [ ] **Step 2: Apply FloatingInput to text/number fields**

Wrap `<input>` and `<textarea>` elements in `<FloatingInput>` where a floating label is appropriate (pair, entry price, stop loss, take profit, notes). For `<select>` elements, apply the consistent select style from Task 9 Step 2 of the visual pass plan.

- [ ] **Step 3: Style emotion chips and rule adherence**

Apply `<Pill>` atoms for emotion tags per Task 9 Step 3. Replace rule adherence UI with the two-button pill row from Task 9 Step 4.

- [ ] **Step 4: Build + commit**

```powershell
npm run build
git add src/LogTradeScreen.tsx
git commit -m "feat: LogTradeScreen FloatingInput + emotion/rule adherence pill visual pass"
```

---

### Task 20: SettingsScreen visual pass

**File:** `src/SettingsScreen.tsx`  
**Plan ref:** Task 10 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Wrap sections in Card + Kicker pattern**

Each settings section (Account, Appearance, Notifications, Pro, Data) should follow:
```tsx
<div style={{ marginBottom: 20 }}>
  <Kicker C={C} style={{ marginBottom: 8 }}>Section Name</Kicker>
  <div style={{ borderRadius: 18, background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden" }}>
    {/* rows */}
  </div>
</div>
```

- [ ] **Step 2: Style rows**

Each row: `display: flex, alignItems: center, justifyContent: space-between, padding: "14px 16px", borderBottom: \`1px solid ${C.border}\``. Remove borderBottom from last row in each section.

- [ ] **Step 3: Build + commit**

```powershell
npm run build
git add src/SettingsScreen.tsx
git commit -m "feat: SettingsScreen Kicker section headers + Card row grouping"
```

---

### Task 21: KodaAuth landing hero + sign-in card

**File:** `src/KodaAuth.tsx`  
**Plan ref:** Task 11 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Add missing imports**

Add `GlassOrb, GhostWord, Kicker, DISPLAY` to the existing shared import (if not already present).

- [ ] **Step 2: Apply landing hero design**

Following Task 11 Step 2 of the visual pass plan, update the landing wrapper with ambient orbs (`<GlassOrb>`), ghost word backdrop (`<GhostWord word="KŌDA">`), and centered lockup with `KodaMark`.

- [ ] **Step 3: Apply sign-in card glass treatment**

Following Task 11 Step 3, apply the glass card style to the auth form container and add `<Kicker>Sign in to Kōda</Kicker>` above the form title.

- [ ] **Step 4: Build + commit**

```powershell
npm run build
git add src/KodaAuth.tsx
git commit -m "feat: KodaAuth landing hero + sign-in card glass visual pass"
```

---

### Task 22: DataSourcesScreen visual pass

**File:** `src/DataSourcesScreen.tsx`  
**Plan ref:** Task 12 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Apply broker card layout**

Following Task 12 Step 2, update each broker connection card with the bordered panel style including broker logo placeholder, status dot, and action button.

- [ ] **Step 2: Apply CSV preset grid**

Following Task 12 Step 3, wrap the CSV presets in a `grid` with `gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))"`.

- [ ] **Step 3: Build + commit**

```powershell
npm run build
git add src/DataSourcesScreen.tsx
git commit -m "feat: DataSourcesScreen broker card layout + CSV preset grid"
```

---

### Task 23: App icons — regenerate to 4-chevron mark

**Files:** `public/icon.svg`, `public/favicon.svg`, `public/apple-touch-icon.svg`, `public/icon-maskable.svg`  
**Plan ref:** Task 13 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Replace public/icon.svg**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="100" height="80" fill="none">
  <polyline points="8,8 22,40 8,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
  <polyline points="28,8 42,40 28,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
  <polyline points="48,8 62,40 48,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
  <polyline points="68,8 82,40 68,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
</svg>
```

- [ ] **Step 2: Replace public/favicon.svg**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
  <rect width="100" height="100" rx="22.5" fill="#0A0A0B"/>
  <polyline points="12,14 24,50 12,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
  <polyline points="29,14 41,50 29,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
  <polyline points="46,14 58,50 46,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
  <polyline points="63,14 75,50 63,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
</svg>
```

- [ ] **Step 3: Replace public/apple-touch-icon.svg**

Same as favicon.svg but `width="180" height="180"`.

- [ ] **Step 4: Replace public/icon-maskable.svg**

Same rounded-square recipe, `width="512" height="512"`, safe-zone margins (~10% inset on all sides — shift chevrons inward by ~52px on a 512px canvas).

- [ ] **Step 5: Build + commit**

```powershell
npm run build
git add public/icon.svg public/favicon.svg public/apple-touch-icon.svg public/icon-maskable.svg
git commit -m "feat: regenerate all icons to 4-chevron mark (no tr text)"
```

---

### Task 24: OG share card

**File:** `public/og-image.svg`  
**Plan ref:** Task 14 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Replace og-image.svg**

Write the 1200×630 SVG from Task 14 Step 1 of the visual pass plan. Key elements: dark `#0A0A0B` bg, radial gradient orbs, 4-chevron mark (scaled 1.8×), "Kōda" wordmark, "OS" badge, "TRADE SMARTER." tagline in mint mono, "EDGE" ghost word. Update the `https://tradrjournal.xyz` link inside if present to `https://kodatrade.co.uk`.

- [ ] **Step 2: Commit**

```powershell
git add public/og-image.svg
git commit -m "feat: regenerate og-image.svg — 4-chevron mark, kodatrade.co.uk"
```

---

### Task 25: Static pages — /faq, /changelog, /404

**Files:** `public/faq.html`, `public/changelog.html`, `public/404.html`  
**Plan ref:** Task 15 in `2026-05-26-koda-visual-pass-v2.md`

- [ ] **Step 1: Create public/faq.html**

Use the HTML from Task 15 Step 1 of the visual pass plan. Before writing, update all `tradrjournal.xyz` occurrences to `kodatrade.co.uk`. Update the contact email if needed.

- [ ] **Step 2: Create public/changelog.html**

Use the HTML from Task 15 Step 2. Update domain references.

- [ ] **Step 3: Create public/404.html**

Use the HTML from Task 15 Step 3. Update domain references.

- [ ] **Step 4: Build + commit**

```powershell
npm run build
git add public/faq.html public/changelog.html public/404.html
git commit -m "feat: add /faq /changelog /404 static pages"
```

---

### Task 26: Push Batch 3 and smoke-test

- [ ] **Step 1: Push**

```powershell
git push -u origin feat/batch3-visual-pass
```

- [ ] **Step 2: Manual smoke test on preview URL**

Once Vercel posts the preview URL:
- Open on phone
- Home: verify empty state shows if no trades; verify dashboard loads if trades present
- Log a trade → celebration overlay fires and auto-dismisses after 2.5s
- Open Circles tab → empty state if no circles
- Open DataSources → broker cards render correctly
- Open Settings → grouped card sections with Kicker headers
- Install as PWA → check home screen icon (4 chevrons, no "kd" text)
- Open `/faq` and `/404` directly in browser

- [ ] **Step 3: Merge + return to main**

```powershell
git checkout main
git pull origin main
```

---

## BATCH 4 — Email + cron

**Branch:** `feat/batch4-email-cron`  
**Creates:** `api/lib/email.ts`, `api/cron/weekly-recap.ts`  
**Modifies:** `vercel.json`, `api/stripe-webhook.ts`

- [ ] **Step 1: Create branch**

```powershell
git checkout -b feat/batch4-email-cron
```

---

### Task 27: Create api/lib/email.ts

**File:** `api/lib/email.ts` (new file)

- [ ] **Step 1: Create the file**

```ts
// Resend-based email helper for Kōda transactional emails.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = "Kōda <noreply@kodatrade.co.uk>";

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json();
}

export function weeklyRecapHtml({
  name, netR, winRate, bestSetup, tradeCount, weekLabel,
}: { name: string; netR: number; winRate: number; bestSetup: string; tradeCount: number; weekLabel: string }) {
  const positive = netR >= 0;
  const color = positive ? "oklch(0.78 0.18 152)" : "oklch(0.70 0.21 25)";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kōda Weekly Recap</title></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:system-ui,sans-serif;color:#F2F2EE">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 8px">${weekLabel} · Weekly Recap</p>
      <p style="font-size:28px;font-weight:600;letter-spacing:-0.02em;margin:0 0 32px">Your week in review, ${name}.</p>
      <table width="100%" cellpadding="16" style="background:#131317;border-radius:16px;border:1px solid rgba(255,255,255,0.07);margin-bottom:24px">
        <tr>
          <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.07)">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Net R</p>
            <p style="font-size:32px;font-weight:600;color:${color};margin:0">${positive ? "+" : ""}${netR.toFixed(1)}R</p>
          </td>
          <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.07)">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Win Rate</p>
            <p style="font-size:32px;font-weight:600;color:#F2F2EE;margin:0">${winRate}%</p>
          </td>
          <td style="text-align:center">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Trades</p>
            <p style="font-size:32px;font-weight:600;color:#F2F2EE;margin:0">${tradeCount}</p>
          </td>
        </tr>
      </table>
      ${bestSetup ? `<p style="font-size:13px;color:#A6A6A2;margin:0 0 32px">Best setup this week: <strong style="color:#F2F2EE">${bestSetup}</strong></p>` : ""}
      <a href="https://kodatrade.co.uk" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none">Open Kōda →</a>
      <p style="font-size:11px;color:#45453F;margin-top:40px">Weekly recap from Kōda. <a href="https://kodatrade.co.uk" style="color:#65655F">Manage preferences</a></p>
    </td></tr>
  </table>
</body></html>`;
}

export function receiptHtml({ name, plan, amount, date }: { name: string; plan: string; amount: string; date: string }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Receipt · Kōda</title></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:system-ui,sans-serif;color:#F2F2EE">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 8px">Payment receipt</p>
      <p style="font-size:26px;font-weight:600;letter-spacing:-0.02em;margin:0 0 32px">Thanks, ${name}.</p>
      <table width="100%" cellpadding="14" style="background:#131317;border-radius:14px;border:1px solid rgba(255,255,255,0.07);margin-bottom:24px">
        <tr><td style="font-size:13px;color:#A6A6A2;border-bottom:1px solid rgba(255,255,255,0.07)">Plan</td><td style="font-size:13px;color:#F2F2EE;text-align:right;border-bottom:1px solid rgba(255,255,255,0.07)">Kōda ${plan}</td></tr>
        <tr><td style="font-size:13px;color:#A6A6A2;border-bottom:1px solid rgba(255,255,255,0.07)">Amount</td><td style="font-size:13px;color:#F2F2EE;text-align:right;border-bottom:1px solid rgba(255,255,255,0.07)">${amount}</td></tr>
        <tr><td style="font-size:13px;color:#A6A6A2">Date</td><td style="font-size:13px;color:#F2F2EE;text-align:right">${date}</td></tr>
      </table>
      <a href="https://kodatrade.co.uk" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none">Open Kōda →</a>
    </td></tr>
  </table>
</body></html>`;
}
```

- [ ] **Step 2: Build + type-check**

```powershell
npm run build
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```powershell
git add api/lib/email.ts
git commit -m "feat: add Resend email helper with weeklyRecap + receipt templates"
```

---

### Task 28: Create weekly recap cron

**File:** `api/cron/weekly-recap.ts` (new file)

- [ ] **Step 1: Create the file**

```ts
// Runs Sunday 20:00 UTC — sends weekly recap email to users with trades this week.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, weeklyRecapHtml } from "../lib/email";

export const config = { runtime: "nodejs" };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekLabel = `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const since = startOfWeek.toISOString().slice(0, 10);

  const { data: profiles, error } = await supabase
    .from("user_kv")
    .select("user_id, value")
    .eq("key", "koda_profile")
    .not("value->>email", "is", null);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const row of profiles ?? []) {
    const profile = row.value as Record<string, unknown>;
    if (profile.email_weekly_recap === false) continue;
    const email = profile.email as string | undefined;
    if (!email) continue;

    const { data: tradesRow } = await supabase
      .from("user_kv")
      .select("value")
      .eq("user_id", row.user_id)
      .eq("key", "koda_trades")
      .maybeSingle();

    const allTrades = (tradesRow?.value ?? []) as Array<Record<string, unknown>>;
    const weekTrades = allTrades.filter(t => (t.date as string) >= since);
    if (weekTrades.length === 0) continue;

    const wins = weekTrades.filter(t => t.outcome === "win").length;
    const winRate = Math.round((wins / weekTrades.length) * 100);
    const netR = weekTrades.reduce((s, t) => s + (Number(t.rr) || 0), 0);
    const setupCounts: Record<string, number> = {};
    weekTrades.forEach(t => { if (t.setup) setupCounts[t.setup as string] = (setupCounts[t.setup as string] ?? 0) + 1; });
    const bestSetup = Object.entries(setupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    try {
      await sendEmail({
        to: email,
        subject: `Your Kōda recap: ${netR >= 0 ? "+" : ""}${netR.toFixed(1)}R this week`,
        html: weeklyRecapHtml({
          name: String(profile.name ?? "Trader").split(" ")[0],
          netR: parseFloat(netR.toFixed(1)),
          winRate,
          bestSetup,
          tradeCount: weekTrades.length,
          weekLabel,
        }),
      });
      sent++;
    } catch (e) {
      console.error("weekly-recap email failed for user", row.user_id, e);
    }
  }

  return res.status(200).json({ sent });
}
```

- [ ] **Step 2: Add cron entry to vercel.json**

Open `vercel.json`. Find the `"crons"` array. Add:
```json
{ "path": "/api/cron/weekly-recap", "schedule": "0 20 * * 0" }
```

- [ ] **Step 3: Build + type-check**

```powershell
npm run build
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```powershell
git add api/cron/weekly-recap.ts vercel.json
git commit -m "feat: add weekly recap email cron (Sunday 20:00 UTC)"
```

---

### Task 29: Wire Stripe receipt email

**File:** `api/stripe-webhook.ts`

- [ ] **Step 1: Read the invoice.paid handler**

Open `api/stripe-webhook.ts`. Search for `invoice.paid`. Read the handler carefully — note what variables are in scope (`invoice`, `customerId`, etc.).

- [ ] **Step 2: Add import at top of file**

Add to the imports at the top:
```ts
import { sendEmail, receiptHtml } from "./lib/email";
```

- [ ] **Step 3: Wire the receipt send**

Inside the `invoice.paid` handler, after the existing plan-claim logic, add:
```ts
const userEmail = invoice.customer_email as string | null;
const userName = String(invoice.customer_name ?? "Trader");
const planLabel = (invoice.lines?.data?.[0]?.description as string | undefined) ?? "Pro";
const amountPaid = invoice.amount_paid as number;
if (userEmail) {
  try {
    await sendEmail({
      to: userEmail,
      subject: "Your Kōda receipt",
      html: receiptHtml({
        name: userName.split(" ")[0],
        plan: planLabel,
        amount: `$${(amountPaid / 100).toFixed(2)}`,
        date: new Date((invoice.created as number) * 1000).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        }),
      }),
    });
  } catch (e) {
    console.error("receipt email failed", e);
  }
}
```

- [ ] **Step 4: Build + type-check**

```powershell
npm run build
npx tsc --noEmit
```

If `invoice.lines` is typed too strictly, cast: `(invoice as any).lines?.data?.[0]?.description`.

- [ ] **Step 5: Commit**

```powershell
git add api/stripe-webhook.ts
git commit -m "feat: send receipt email on invoice.paid via Resend"
```

---

### Task 30: Push Batch 4 and open PR

- [ ] **Step 1: Push**

```powershell
git push -u origin feat/batch4-email-cron
```

- [ ] **Step 2: Verify in Vercel function logs**

After merging, check Vercel → Functions logs for `weekly-recap` and `stripe-webhook` on next trigger to confirm no errors.

- [ ] **Step 3: Merge + return to main**

```powershell
git checkout main
git pull origin main
```

---

## Definition of Done

- [ ] All 4 PRs merged to `main`, CI green on each
- [ ] Production deploy live at `kodatrade.co.uk`
- [ ] App opens on phone, no visual regressions
- [ ] Beta gate works — correct invite code gets in
- [ ] Log a trade → celebration overlay fires
- [ ] PWA icon on home screen shows 4-chevron mark
- [ ] `/faq`, `/changelog`, `/404` all load
- [ ] Vercel has `KODA_ENCRYPTION_KEY`, `APP_URL=https://kodatrade.co.uk` set
- [ ] First beta invite sent

---

## Self-Review Notes

**Spec coverage check:**
- Batch 1 ✓ (localDateStr commit, .env.example update)
- Batch 2 ✓ (BetaGate, USERNAME_DOMAIN, CORS, all domain URLs, email FROM, encryption key)
- Batch 3 ✓ (all 15 visual pass tasks, icons, OG, static pages)
- Batch 4 ✓ (email.ts, weekly-recap, Stripe receipt)

**Items removed from spec vs plan:** `useEffect []` fixes (already done), `.gitattributes` (already done), 4 of 5 `.env.example` entries (already done), CSS class + export filenames (already done in earlier sessions).

**Vercel dashboard actions** (not automatable — Dylon must do manually before merging Batch 2): add domains, set `APP_URL`, add `KODA_ENCRYPTION_KEY`.
