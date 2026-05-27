# TRADR → Kōda Full Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all TRADR brand references in code to Kōda/Koda across files, components, CSS classes, log tags, and localStorage keys — without touching Supabase KV key values (those go in PR 2 / Task 7).

**Architecture:** Two-PR approach. PR 1 (Tasks 1–6) covers all code-level symbol renames and is zero-data-risk — the Supabase KV key strings (e.g. `"tradr_trades"`) stay unchanged so no user data is affected. PR 2 (Task 7) runs a SQL migration to rename KV rows and updates the code simultaneously, deployed atomically.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase. Pre-commit hook rejects `: any` — use `Record<string, unknown>` or typed alternatives.

---

## File Map

| Action | Path | What changes |
|--------|------|--------------|
| Rename | `src/TRADR.tsx` → `src/Koda.tsx` | file name + default export `Tradr` → `Koda` |
| Rename | `src/TradrAuth.tsx` → `src/KodaAuth.tsx` | file name + default export + CSS classes |
| Modify | `src/main.tsx` | imports |
| Modify | `src/shared.tsx` | `TradrMark` → `KodaMark`, `TrMark` → `KodaMarkFilled` |
| Modify | `src/TradingCircles.tsx` | import alias |
| Modify | `src/OnboardingFlow.tsx` | import alias + localStorage key |
| Modify | `src/BetaGate.tsx` | localStorage key |
| Modify | `src/CsvImportPanel.tsx` | localStorage key comment only (key stays, Tier 5) |
| Modify | `src/lib/log.ts` | log prefix |
| Modify | `src/lib/storage.ts` | internal localStorage prefix |
| Modify | `src/lib/flags.ts` | `tradrFlags` → `kodaFlags` + localStorage keys |
| Modify | `src/lib/sentry.ts` | comment only |
| Modify | `package.json` | `"name"` field |
| Modify | `CLAUDE.md` | references in docs |

**Do NOT modify in this PR (Tier 5):** any string literal that is a Supabase KV `key` column value — e.g. `"tradr_trades"`, `"tradr_profile"`, `"tradr_stripe_customer"`, `"tradr_circle_*"`, `"tradr_follow_*"`, `"tradr_handle_*"`, `"tradr_feed"`, `"tradr_friends"`, `"tradr_csv_templates"`. These live in the DB and must migrate atomically.

**Do NOT modify:** `users.tradr.app` (live auth domain), `tradrjournal.xyz` (live domain URL), `TRADR_GLOBAL_CODE` value `"TRADRG-HB1U"` (existing circle code in DB).

---

## Task 1: Rename source files and fix the import chain

**Files:**
- Rename: `src/TRADR.tsx` → `src/Koda.tsx`
- Rename: `src/TradrAuth.tsx` → `src/KodaAuth.tsx`
- Modify: `src/main.tsx`
- Modify: `src/Koda.tsx` (export name)
- Modify: `src/KodaAuth.tsx` (export name + import)

- [ ] **Step 1: Rename the files on disk**

```powershell
cd "C:\Users\Dylon\OneDrive\Desktop\tradr-fresh"
Rename-Item src\TRADR.tsx src\Koda.tsx
Rename-Item src\TradrAuth.tsx src\KodaAuth.tsx
```

- [ ] **Step 2: Update the default export name in `src/Koda.tsx`**

Find line 245:
```ts
export default function Tradr({ user, jwtPlan }: { user?: User; jwtPlan?: "free" | "pro" | "elite" } = {}) {
```
Replace with:
```ts
export default function Koda({ user, jwtPlan }: { user?: User; jwtPlan?: "free" | "pro" | "elite" } = {}) {
```

- [ ] **Step 3: Update `src/KodaAuth.tsx` — import + export**

Change the import at the top:
```ts
// OLD
import Tradr from "./TRADR";
// NEW
import Koda from "./Koda";
```

Change every usage of `<Tradr ...>` (there is one at the bottom of the file):
```ts
// OLD
return <Tradr user={session.user} jwtPlan={jwtPlan} />;
// NEW
return <Koda user={session.user} jwtPlan={jwtPlan} />;
```

Change the export at line 586:
```ts
// OLD
export default function TradrAuth() {
// NEW
export default function KodaAuth() {
```

- [ ] **Step 4: Update `src/main.tsx`**

```ts
// OLD
import TradrAuth from "./TradrAuth";
// NEW
import KodaAuth from "./KodaAuth";
```

And the JSX usage:
```ts
// OLD
<TradrAuth />
// NEW
<KodaAuth />
```

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
cd "C:\Users\Dylon\OneDrive\Desktop\tradr-fresh"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/Koda.tsx src/KodaAuth.tsx src/main.tsx
git rm src/TRADR.tsx src/TradrAuth.tsx 2>/dev/null || true
git commit -m "refactor: rename TRADR.tsx→Koda.tsx, TradrAuth.tsx→KodaAuth.tsx, update exports and imports"
```

---

## Task 2: Rename TradrMark → KodaMark and TrMark → KodaMarkFilled

`TradrMark` is the primary logo mark (outline SVG). `TrMark` is an older filled variant used in loading states. Both live in `src/shared.tsx` and are imported by several files.

**Files:**
- Modify: `src/shared.tsx`
- Modify: `src/Koda.tsx` (import line)
- Modify: `src/KodaAuth.tsx` (import line)
- Modify: `src/TradingCircles.tsx` (import line)
- Modify: `src/OnboardingFlow.tsx` (import line)

- [ ] **Step 1: Rename in `src/shared.tsx`**

Line 55 — rename function:
```ts
// OLD
export function TradrMark({ size = 28, color = "currentColor", strokeWidth = 1.6 }: {
// NEW
export function KodaMark({ size = 28, color = "currentColor", strokeWidth = 1.6 }: {
```

Line 70–71 — rename deprecated alias and update JSDoc:
```ts
// OLD
/** @deprecated Use TradrMark instead — kept for backward compat */
export function TrMark({ size = 28, bg = "#0C0C0B" }: { size?: number; bg?: string }) {
// NEW
/** @deprecated Use KodaMark instead — kept for backward compat */
export function KodaMarkFilled({ size = 28, bg = "#0C0C0B" }: { size?: number; bg?: string }) {
```

Line 652 — usage inside shared.tsx itself:
```ts
// OLD
<TradrMark size={22} color={C.text} />
// NEW
<KodaMark size={22} color={C.text} />
```

- [ ] **Step 2: Update `src/Koda.tsx` imports**

The import line currently reads:
```ts
import { AvatarCircle, Badge, ..., TrMark, TradrMark, ... } from "./shared";
```
Replace `TrMark` with `KodaMarkFilled` and `TradrMark` with `KodaMark`:
```ts
import { AvatarCircle, Badge, ..., KodaMarkFilled, KodaMark, ... } from "./shared";
```

Then replace all usages in `src/Koda.tsx`:
- `<TrMark` → `<KodaMarkFilled`
- `<TradrMark` → `<KodaMark`

(There are 3 usages total: lines ~1351, ~1485, ~1893 in the original TRADR.tsx numbering.)

- [ ] **Step 3: Update `src/KodaAuth.tsx` imports**

```ts
// OLD
import { TradrMark, FloatingInput, TealArrowBtn, MONO, BODY } from "./shared";
// NEW
import { KodaMark, FloatingInput, TealArrowBtn, MONO, BODY } from "./shared";
```

Replace all `<TradrMark` → `<KodaMark` in the file (4 usages: lines ~357, ~477, ~557, ~579).

- [ ] **Step 4: Update `src/TradingCircles.tsx` imports**

```ts
// OLD
import { SectionKicker, StrategyPill, Toast, stratCode, TradrMark, MONO, BODY, DISPLAY } from "./shared";
// NEW
import { SectionKicker, StrategyPill, Toast, stratCode, KodaMark, MONO, BODY, DISPLAY } from "./shared";
```

Replace the one usage: `<TradrMark` → `<KodaMark` (line ~440).

- [ ] **Step 5: Update `src/OnboardingFlow.tsx` imports**

```ts
// OLD
import { MONO, BODY, DISPLAY, TrMark } from "./shared";
// NEW
import { MONO, BODY, DISPLAY, KodaMarkFilled } from "./shared";
```

Replace the one usage: `<TrMark` → `<KodaMarkFilled` (line ~206).

- [ ] **Step 6: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/shared.tsx src/Koda.tsx src/KodaAuth.tsx src/TradingCircles.tsx src/OnboardingFlow.tsx
git commit -m "refactor: rename TradrMark→KodaMark, TrMark→KodaMarkFilled in shared.tsx and all consumers"
```

---

## Task 3: Rename CSS classes in KodaAuth.tsx

All `tradr-*` CSS class names are defined and consumed exclusively within `src/KodaAuth.tsx` — safe to rename with no cross-file impact.

**Files:**
- Modify: `src/KodaAuth.tsx`

- [ ] **Step 1: Rename all CSS class name strings**

Run a find-and-replace (exact string, not regex) in `src/KodaAuth.tsx`:

| Old | New |
|-----|-----|
| `tradr-landing` | `koda-landing` |
| `tradr-shell` | `koda-shell` |
| `tradr-grid` | `koda-grid` |
| `tradr-auth-card` | `koda-auth-card` |
| `tradr-strategies` | `koda-strategies` |
| `tradr-strat-item` | `koda-strat-item` |
| `tradr-pulse` | `koda-pulse` |

This covers both the JSX `className="..."` attributes and the CSS-in-JS template string selectors (`.tradr-landing input::placeholder`, etc.).

- [ ] **Step 2: Verify no old class names remain**

```powershell
Select-String -Path "src\KodaAuth.tsx" -Pattern "tradr-" -SimpleMatch
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/KodaAuth.tsx
git commit -m "refactor: rename tradr-* CSS classes to koda-* in KodaAuth.tsx"
```

---

## Task 4: Rename log tags, storage prefix, and window.tradrFlags

**Files:**
- Modify: `src/lib/log.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/lib/flags.ts`
- Modify: `src/lib/sentry.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Update `src/lib/log.ts`**

Replace all occurrences of `[TRADR]` with `[KODA]` (3 console calls):

```ts
// OLD
console.log(`[TRADR][${scope}]`, msg, ctx ?? "");
// NEW
console.log(`[KODA][${scope}]`, msg, ctx ?? "");
```
```ts
// OLD
console.warn(`[TRADR][${scope}]`, msg, ctx ?? "");
// NEW
console.warn(`[KODA][${scope}]`, msg, ctx ?? "");
```
```ts
// OLD
console.error(`[TRADR][${scope}]`, err, ctx ?? "");
// NEW
console.error(`[KODA][${scope}]`, err, ctx ?? "");
```

Also update the file header comment:
```ts
// OLD
// TRADR · centralized logger
// NEW
// Kōda · centralized logger
```

- [ ] **Step 2: Update `src/lib/storage.ts`**

Change the internal localStorage prefix strings (line ~40):
```ts
// OLD
return shared ? `tradr__shared__${key}` : `tradr__user__${currentUserId ?? "anon"}__${key}`;
// NEW
return shared ? `koda__shared__${key}` : `koda__user__${currentUserId ?? "anon"}__${key}`;
```

Change the clearAll filter (line ~228):
```ts
// OLD
if (k && (k.startsWith("tradr__user__") || k.startsWith("tradr__shared__"))) {
// NEW
if (k && (k.startsWith("koda__user__") || k.startsWith("koda__shared__"))) {
```

Change the error log (line ~35):
```ts
// OLD
console.error("[TRADR][storage]", key, error);
// NEW
console.error("[KODA][storage]", key, error);
```

Update header comment:
```ts
// OLD
// TRADR · window.storage shim
// NEW
// Kōda · window.storage shim
```

- [ ] **Step 3: Update `src/lib/flags.ts`**

Change the `window` object name (line ~92):
```ts
// OLD
(window as any).tradrFlags = { isFlagOn, enableFlag, disableFlag, listFlags };
// NEW
(window as any).kodaFlags = { isFlagOn, enableFlag, disableFlag, listFlags };
```

Change the localStorage flag keys (these are localStorage.getItem/setItem, not Supabase KV):
```ts
// OLD
const STORAGE_KEY = "tradr_flags";
const STORAGE_KEY_OFF = "tradr_flags_off";
// NEW
const STORAGE_KEY = "koda_flags";
const STORAGE_KEY_OFF = "koda_flags_off";
```

Update comments referencing `window.tradrFlags`:
```ts
// OLD (appears ~3 times in comments)
//   window.tradrFlags.enableFlag("newTrades"); location.reload();
//   window.tradrFlags.disableFlag("newProfile"); location.reload();
// NEW
//   window.kodaFlags.enableFlag("newTrades"); location.reload();
//   window.kodaFlags.disableFlag("newProfile"); location.reload();
```

Update header comment:
```ts
// OLD
// TRADR · feature flags
// NEW
// Kōda · feature flags
```

- [ ] **Step 4: Update `src/lib/sentry.ts`**

Update header comment only:
```ts
// OLD
// TRADR · Sentry init
// NEW
// Kōda · Sentry init
```

- [ ] **Step 5: Update `src/main.tsx` comment**

```ts
// OLD
import "./lib/flags"; // side-effect: exposes window.tradrFlags
// NEW
import "./lib/flags"; // side-effect: exposes window.kodaFlags
```

- [ ] **Step 6: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/log.ts src/lib/storage.ts src/lib/flags.ts src/lib/sentry.ts src/main.tsx
git commit -m "refactor: rename [TRADR] log tags, tradr__ storage prefix, and window.tradrFlags to koda equivalents"
```

---

## Task 5: Rename direct localStorage keys

These keys use `localStorage.getItem/setItem` directly (not the Supabase-backed `storage` abstraction), so renaming is data-safe — worst case, the value is not found on first load and defaults gracefully.

**Files:**
- Modify: `src/Koda.tsx`
- Modify: `src/OnboardingFlow.tsx`
- Modify: `src/BetaGate.tsx`

- [ ] **Step 1: Update `src/BetaGate.tsx`**

```ts
// OLD
const STORAGE_KEY = "tradr_beta_unlocked";
// NEW
const STORAGE_KEY = "koda_beta_unlocked";
```

- [ ] **Step 2: Update `src/OnboardingFlow.tsx`**

```ts
// OLD
try { localStorage.setItem("tradr_tour_done", "1"); } catch {}
// NEW
try { localStorage.setItem("koda_tour_done", "1"); } catch {}
```

- [ ] **Step 3: Update `src/Koda.tsx` — rename three direct localStorage keys**

`tradr_font_scale` (2 occurrences — getter and setter):
```ts
// OLD
try { return parseFloat(localStorage.getItem("tradr_font_scale") ?? "1") || 1; } catch { return 1; }
// NEW
try { return parseFloat(localStorage.getItem("koda_font_scale") ?? "1") || 1; } catch { return 1; }
```
```ts
// OLD
try { localStorage.setItem("tradr_font_scale", String(fontScale)); } catch {}
// NEW
try { localStorage.setItem("koda_font_scale", String(fontScale)); } catch {}
```

`tradr_onboarded` (2 occurrences — getter and setter):
```ts
// OLD
const _localOnboarded = typeof window !== "undefined" && localStorage.getItem("tradr_onboarded") === "1";
// NEW
const _localOnboarded = typeof window !== "undefined" && localStorage.getItem("koda_onboarded") === "1";
```
```ts
// OLD
try { localStorage.setItem("tradr_onboarded", "1"); } catch {}
// NEW
try { localStorage.setItem("koda_onboarded", "1"); } catch {}
```

`tradr_tour_done` (1 occurrence):
```ts
// OLD
if (!localStorage.getItem("tradr_tour_done")) setShowTour(true);
// NEW
if (!localStorage.getItem("koda_tour_done")) setShowTour(true);
```

- [ ] **Step 4: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Confirm no remaining direct localStorage tradr_ keys**

```powershell
Select-String -Path "src\Koda.tsx","src\KodaAuth.tsx","src\OnboardingFlow.tsx","src\BetaGate.tsx" -Pattern 'localStorage.*tradr_' -SimpleMatch
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/Koda.tsx src/OnboardingFlow.tsx src/BetaGate.tsx
git commit -m "refactor: rename direct localStorage keys from tradr_ to koda_ (font_scale, onboarded, tour_done, beta_unlocked)"
```

---

## Task 6: Rename package.json + update CLAUDE.md

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `package.json`**

```json
// OLD
"name": "tradr",
// NEW
"name": "koda",
```

- [ ] **Step 2: Update `CLAUDE.md`**

Find all references to the old repo path or product name in CLAUDE.md and update them to reflect Kōda. Open the file and do a find-and-replace:

- `TRADR.tsx` → `Koda.tsx` (where referring to the main component file)
- `TradrAuth.tsx` → `KodaAuth.tsx`
- `TradrMark` → `KodaMark`
- `TrMark` → `KodaMarkFilled`
- Any mention of `"TRADR"` as the app name → `"Kōda"`

Do NOT change: `tradrjournal.xyz`, `TRADR_GLOBAL_CODE` value, `tradr_*` KV key names (still active in DB), or the git history references.

- [ ] **Step 3: Final lint check**

```powershell
npm run lint
```

Expected: no errors (pre-commit hook also runs this on push)

- [ ] **Step 4: Confirm no remaining brand-level TRADR references in src/**

```powershell
Select-String -Path "src\" -Pattern "\bTRADR\b|\bTradrAuth\b|\bTradrMark\b|\bTrMark\b" -Recurse -Include "*.ts","*.tsx" | Where-Object { $_.Line -notmatch "tradrjournal|TRADR_GLOBAL_CODE" }
```

Expected: no output (or only the `TRADR_GLOBAL_CODE` constant name in Koda.tsx — acceptable for now)

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "refactor: update package name to koda and sync CLAUDE.md to renamed files"
```

- [ ] **Step 6: Open a PR for Tasks 1–6**

```bash
git push origin HEAD
gh pr create --title "refactor: TRADR → Kōda code rename (PR 1/2)" --body "$(cat <<'EOF'
## Summary
- Renames src/TRADR.tsx → src/Koda.tsx and src/TradrAuth.tsx → src/KodaAuth.tsx
- Renames component exports: Tradr→Koda, TradrAuth→KodaAuth, TradrMark→KodaMark, TrMark→KodaMarkFilled
- Renames CSS classes: tradr-* → koda-* in KodaAuth.tsx
- Renames log tags [TRADR] → [KODA], localStorage prefix tradr__ → koda__, window.tradrFlags → window.kodaFlags
- Renames direct localStorage keys: tradr_onboarded, tradr_tour_done, tradr_font_scale, tradr_beta_unlocked
- Zero data risk: Supabase KV key strings (tradr_trades, tradr_profile, etc.) unchanged until PR 2

## Test plan
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run dev` starts and app loads
- [ ] Auth flow works (sign in / sign up)
- [ ] Circles tab loads
- [ ] Trade log persists across page reload
EOF
)"
```

---

## Task 7: Supabase KV key migration (PR 2 — separate deploy)

> **Deploy this PR atomically:** run the SQL migration in Supabase first, then deploy the code. Do NOT merge the code without the SQL migration being committed and run.

This task renames all `tradr_*` keys in the `user_kv` and `shared_kv` Supabase tables, then updates every matching string literal in the codebase.

**Files:**
- Create: `supabase/migrations/20260524000000_rename_tradr_kv_keys.sql`
- Modify: `src/Koda.tsx` (remaining tradr_ KV key strings)
- Modify: `src/KodaAuth.tsx` (none — none left after PR 1)
- Modify: `src/TradingCircles.tsx` (none)
- Modify: `src/data/circles.ts`
- Modify: `src/data/follows.ts`
- Modify: `src/hooks/useCircles.ts`
- Modify: `src/hooks/useFeed.ts`
- Modify: `src/hooks/useTradovate.ts`
- Modify: `src/ProfileModal.tsx`
- Modify: `src/CsvImportPanel.tsx`
- Modify: `src/BetaGate.tsx` (none left — done in Task 5)
- Modify: `api/stripe-checkout.ts`
- Modify: `api/stripe-portal.ts`
- Modify: `api/stripe-webhook.ts`
- Modify: `api/cron/complete-challenges.ts`
- Modify: `api/lib/rateLimit.ts`
- Modify: `api/trade-gate.ts`
- Modify: `api/feedback.ts`

- [ ] **Step 1: Write the SQL migration**

Create `supabase/migrations/20260524000000_rename_tradr_kv_keys.sql`:

```sql
-- Rename all tradr_ prefixed keys to koda_ in user_kv and shared_kv.
-- Run this BEFORE deploying the code that references the new key names.

UPDATE user_kv
  SET key = 'koda_' || SUBSTRING(key FROM 7)
  WHERE key LIKE 'tradr_%';

UPDATE shared_kv
  SET key = 'koda_' || SUBSTRING(key FROM 7)
  WHERE key LIKE 'tradr_%';
```

> **Note:** `SUBSTRING(key FROM 7)` strips the 6-char prefix `"tradr_"` and prepends `"koda_"`. Row counts should be logged before/after to confirm.

- [ ] **Step 2: Run the migration in Supabase**

Via Supabase dashboard SQL editor (project `vifwjwsndchnrpvfgrmg`), run:

```sql
-- Preview counts first
SELECT 'user_kv' AS tbl, COUNT(*) FROM user_kv WHERE key LIKE 'tradr_%'
UNION ALL
SELECT 'shared_kv', COUNT(*) FROM shared_kv WHERE key LIKE 'tradr_%';
```

Then run the migration SQL. Confirm updated row counts match.

- [ ] **Step 3: Update all KV key strings in the codebase**

Do a global find-and-replace of `"tradr_` → `"koda_"` and `` `tradr_`` → `` `koda_`` across all `.ts` and `.tsx` files (excluding node_modules, dist, and the SQL migration itself).

Key locations:
- `src/Koda.tsx`: ~20 occurrences (tradr_trades, tradr_profile, tradr_checklists, tradr_rules, tradr_dark, tradr_circles, tradr_thresholds, tradr_custom_strategies, tradr_stripe_customer, tradr_onboarded, tradr_tour_done, tradr_handle_*, tradr_profile_pub_*, tradr_feed_*, tradr_circle_*)
- `src/data/circles.ts`: tradr_circle_* key templates
- `src/data/follows.ts`: tradr_follow_* key templates
- `src/hooks/useCircles.ts`: tradr_circles, tradr_circle_*, tradr_circle_bans_*
- `src/hooks/useFeed.ts`: tradr_friends, tradr_feed, tradr_feed_*
- `src/ProfileModal.tsx`: tradr_handle_*, tradr_profile_pub_*, tradr_feed_*
- `src/CsvImportPanel.tsx`: tradr_csv_templates
- `api/stripe-checkout.ts`: tradr_stripe_customer, tradr_promo_applied
- `api/stripe-portal.ts`: tradr_stripe_customer
- `api/stripe-webhook.ts`: tradr_profile, tradr_stripe_customer
- `api/cron/complete-challenges.ts`: tradr_circle_entry_*
- `api/lib/rateLimit.ts`: tradr_rl_*
- `api/trade-gate.ts`: check for tradr_ keys
- `api/feedback.ts`: check for tradr_ keys

> **CRITICAL:** Also update the `clearAll` key list in `src/Koda.tsx` line ~1181:
> ```ts
> // OLD
> const keys = ["tradr_trades","tradr_profile","tradr_friends","tradr_feed","tradr_checklists","tradr_rules","tradr_dark","tradr_circles","tradr_thresholds","tradr_custom_strategies"];
> // NEW
> const keys = ["koda_trades","koda_profile","koda_friends","koda_feed","koda_checklists","koda_rules","koda_dark","koda_circles","koda_thresholds","koda_custom_strategies"];
> ```

- [ ] **Step 4: Rename TRADR_GLOBAL_CODE constant (optional cleanup)**

In `src/Koda.tsx` line ~43:
```ts
// OLD
/** The TRADR Global circle — every new user auto-joins on onboarding completion. */
const TRADR_GLOBAL_CODE = "TRADRG-HB1U";
// NEW
/** Legacy global circle — kept for backward-compat join check on onboarding. */
const LEGACY_GLOBAL_CODE = "TRADRG-HB1U";
```

Update the 4 usages of `TRADR_GLOBAL_CODE` in the same file to `LEGACY_GLOBAL_CODE`.

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Confirm no remaining tradr_ KV key strings**

```powershell
Select-String -Path "src\","api\" -Pattern '"tradr_|`tradr_' -Recurse -Include "*.ts","*.tsx" | Where-Object { $_.Line -notmatch "tradrjournal|TRADR_GLOBAL|LEGACY_GLOBAL" }
```

Expected: no output

- [ ] **Step 7: Run smoke test**

```powershell
npm run test:e2e
```

Expected: all tests pass

- [ ] **Step 8: Commit and open PR 2**

```bash
git add -A
git commit -m "refactor: rename tradr_ KV keys to koda_ after Supabase migration (PR 2/2)"
git push origin HEAD
gh pr create --title "refactor: TRADR → Kōda KV key rename (PR 2/2)" --body "$(cat <<'EOF'
## Summary
- Runs SQL migration renaming all tradr_* rows in user_kv and shared_kv to koda_*
- Updates every tradr_ KV key string literal in src/ and api/
- Renames TRADR_GLOBAL_CODE constant to LEGACY_GLOBAL_CODE (value unchanged)

## Deploy order
1. Run supabase/migrations/20260524000000_rename_tradr_kv_keys.sql in Supabase dashboard FIRST
2. Then deploy this PR

## Test plan
- [ ] SQL migration preview shows expected row counts
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test:e2e` passes
- [ ] Existing trades still load after deploy
- [ ] Stripe billing still works
- [ ] Circles load and leaderboard populates
EOF
)"
```

---

## Self-review

**Spec coverage check:**
- ✅ Tier 1 (file + component renames): Tasks 1–2
- ✅ Tier 2 (CSS classes): Task 3
- ✅ Tier 3 (log tags, window object, package.json): Tasks 4, 6
- ✅ Tier 4 (direct localStorage keys): Task 5
- ✅ Tier 5 (Supabase KV + remaining code keys): Task 7
- ✅ Skip list documented (tradrjournal.xyz, TRADR_GLOBAL_CODE value, users.tradr.app)

**Skipped intentionally (not a gap):**
- `tradrjournal.xyz` in FriendsFeed.tsx share link — live domain, unchanged
- `users.tradr.app` domain in KodaAuth.tsx — live auth domain, unchanged
- `"TRADRG-HB1U"` — circle code value in DB, not a brand string
- Old plan doc `2026-05-23-circles-improvements.md` — historical, leave as-is
- `.vercel/repo.json` — Vercel internal config, not brand
- `.coderabbit.yaml` — contains "tradr" only in path/URL refs, leave for final polish
