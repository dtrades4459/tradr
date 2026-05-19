# TRADR — Launch Readiness Checklist
> Generated from full codebase audit (May 2026). Work through tiers in order. Do NOT skip to lower tiers before completing higher ones.

---

## TIER 1 — IMMEDIATE BLOCKERS (fix before showing this to anyone)

### 1.1 Fix Broken Git State
- [x] Run `Remove-Item .git\index.lock -Force` in PowerShell from the tradr directory
- [x] Verify `git status` works cleanly
- [ ] Push any uncommitted changes to a feature branch
- **Why:** CI/CD is completely dead. You cannot push, PR, or deploy until this is resolved.

### 1.2 Remove Broken Google OAuth Button
- [x] In `src/TradrAuth.tsx`, find the `handleGoogle` function and the Google sign-in button
- [x] Either remove the button entirely OR configure Google OAuth properly in Supabase dashboard
- [x] If removing: delete `handleGoogle()`, the button JSX, and the comment about Google OAuth
- **Why:** Shipping a button that silently fails destroys trust on first impression.

### 1.3 Automate Password Reset (kill the Telegram manual process)
- [x] Sign up for Resend (resend.com) — free tier is plenty for beta
- [x] Add `RESEND_API_KEY` to Vercel environment variables
- [x] Update `api/reset-password.ts` to email the recovery link directly via Resend instead of Telegram
- [x] Update the "Link sent" UI copy in `TradrAuth.tsx` to say "Check your recovery email"
- [x] Add a note at signup: "Add a recovery email in case you forget your password" with an optional field (already existed)
- **Why:** Every forgotten password currently requires manual founder intervention. This is a support ops disaster at any scale beyond 20 users.

### 1.4 Fix `listUsers(perPage: 1000)` Bug in Password Reset
- [x] In `api/reset-password.ts`, replace the `admin.auth.admin.listUsers({ perPage: 1000 })` call
- [x] Use `admin.auth.admin.getUserByEmail(syntheticEmail)` instead — it's O(1) and doesn't paginate
- [x] Remove the `.find()` loop that iterates the user array
- **Why:** Silently fails to find users once you have >1,000 accounts. One-line fix.

---

## TIER 2 — PRE-LAUNCH ESSENTIALS (must be done before public launch)

### 2.1 Build the Review Inbox for Auto-Synced Trades
- [ ] Add a badge/count indicator on the Log tab for `review_status = 'draft'` trades
- [ ] Create `src/ReviewInboxScreen.tsx` — list view of draft trades with basic info (symbol, date, P&L)
- [ ] Add "Publish" button per trade — sets `review_status = 'published'`, shows it in main journal
- [ ] Add "Skip" button per trade — sets `review_status = 'skipped'`, hides it from inbox
- [ ] Add "Publish All" bulk action
- [ ] Wire the screen into the tab navigation (probably under the Sync tab or as a sub-view of Log)
- **Why:** Auto-sync is your biggest differentiator. Right now trades sync silently to `draft` and users see nothing. The feature is completely invisible.

### 2.2 Fix the Blank Loading Screen
- [ ] In `src/TRADR.tsx`, find where `loading === true` is handled in the render
- [ ] Replace the blank screen with a proper loading state — at minimum a centered TrMark logo with a subtle pulse animation
- [ ] Alternatively add skeleton placeholders for the stat cards and chart areas
- [ ] Target: something visible and branded within 200ms of app load
- **Why:** The app appears broken on first load. This is the single biggest first-impression killer.

### 2.3 Fix the Empty Dashboard State for New Users
- [ ] Detect `trades.length === 0` on the home/overview screen
- [ ] Show a compelling zero-state: TrMark logo, a short message ("Your edge starts here"), and a clear "Log your first trade →" CTA button that navigates to the Log tab
- [ ] Remove or hide empty chart containers when there is no data (don't show blank axes)
- [ ] Remove or hide stat cards showing "0" and "—" when there are no trades
- **Why:** New users land on a dashboard full of zeros and empty charts with no guidance. Most will leave.

### 2.4 Align Auth Page Design System with the App
- [ ] In `src/TradrAuth.tsx`, update `DISPLAY`, `BODY`, `MONO` font constants to match `src/TRADR.tsx` (use Geist / Geist Mono)
- [ ] Remove the Syne font references — it's not loaded in `index.html` so it's falling back to system fonts anyway
- [ ] Update the hardcoded hex colour values in TradrAuth.tsx (`green: "#00C96B"`, `red: "#FF3D00"`, etc.) to match the OKLCH values from the main app's DARK theme
- [ ] Verify the auth page and app feel like the same product after the change
- **Why:** Users experience a visual jump between the signup screen and the app. Syne isn't even loading — it's falling back silently.

### 2.5 Move Screenshots to Supabase Storage URLs
- [ ] Supabase storage bucket + RLS already set up (migration 003 is done)
- [ ] In the screenshot upload handler in `src/TRADR.tsx` (`handleScreenshotUpload`), upload the compressed image to Supabase Storage instead of embedding as base64
- [ ] Store the returned public URL in `trade.screenshot` instead of the data URI
- [ ] Update `handleAvatarUpload` similarly for profile avatars
- [ ] Add a migration pass for existing trades: on `loadAll()`, if a trade's screenshot is a data URI, upload it to Storage and update the URL (can be done lazily, one trade at a time)
- **Why:** Base64 screenshots embedded in the trade blob means your entire trade history is one massive JSON object. 50 trades with screenshots = potential megabytes loaded on every session start.

### 2.6 Complete the v2 Trades Data Migration
- [ ] Verify `public.trades` table exists and has the v2 schema (run migration 002 if not confirmed)
- [ ] Test the `newTrades` flag path: `localStorage.tradr_flags = '{"newTrades":true}'; location.reload()` — log a trade, verify it appears in `select * from public.trades`
- [ ] Fix any bugs found in the v2 write path
- [ ] Flip the `newTrades` flag to on by default in `src/lib/flags.ts`
- [ ] Keep the KV fallback for reads-only for 2 weeks, then remove it
- **Why:** All trades currently stored as one JSON blob per user. Write conflicts, size limits, and data loss risk increase with every trade logged.

### 2.7 Fix the N+1 Leaderboard Query
- [ ] In `src/TRADR.tsx`, find `fetchCircleLeaderboard()`
- [ ] Replace the per-member fetch loop with a single Supabase query:
  `select * from shared_kv where key like 'tradr_circle_entry_{circleCode}_%'`
- [ ] This is one query returning all member entries instead of one query per member
- [ ] Test with a circle that has 5+ members
- **Why:** 20 members = 20 Supabase queries every time the Circles tab opens. The auto-publish debounce makes this fire repeatedly. This will hammer your Supabase connection pool under normal usage.

---

## TIER 3 — CODE QUALITY (do in the 2 weeks after launch)

### 3.1 Replace `(window as any).storage` with Direct Typed Imports
- [ ] In `src/lib/storage.ts`, ensure `get`, `set`, `delete`, `listByPrefix` are all named exports
- [ ] Do a global find for `(window as any).storage` in `src/TRADR.tsx` and all other src files
- [ ] Replace each instance with the direct import: `import { get, set } from './lib/storage'`
- [ ] Remove the `installStorage` window-mount in `src/TradrAuth.tsx` and `src/main.tsx` once all callers are updated
- **Why:** Every data operation in the app has zero TypeScript safety because of this pattern.

### 3.2 Consolidate Duplicate Position Size Calculator
- [ ] Confirm `src/LotSizeCalculator.tsx` is the canonical implementation (it's the more complete one)
- [ ] Delete the `PositionSizeCalc` function defined inline in `src/TRADR.tsx` (around line 302)
- [ ] Find any JSX that renders `<PositionSizeCalc .../>` in TRADR.tsx and replace with `<LotSizeCalculator .../>`
- [ ] Verify the floating ⚖️ button still works after the swap
- **Why:** Two implementations of the same feature. They will drift.

### 3.3 Fix Font Scaling — Replace `zoom` with Standard CSS
- [ ] In `src/TRADR.tsx`, find the `fontScale` effect that sets `document.documentElement.style.zoom`
- [ ] Replace with `document.documentElement.style.fontSize = `${fontScale * 100}%``
- [ ] Ensure all font sizes in the app use `rem` units, not `px`, so they scale correctly
- [ ] Test on Firefox (zoom doesn't work there)
- **Why:** `zoom` is non-standard CSS. Works in Chrome/Edge but not in Firefox.

### 3.4 Add Pre-commit Hooks to Block Debt Accumulation
- [ ] Install `husky` and `lint-staged`
- [ ] Add a pre-commit rule that fails if any new `: any` annotations are added
- [ ] Add a pre-commit rule that fails if any new `eslint-disable` comments are added
- [ ] Add `tsc --noEmit` to the pre-commit hook so type errors don't reach the repo
- **Why:** Without gates, AI-assisted development will keep producing `any` types and suppressed warnings that compound over time.

### 3.5 Move Strategy Definitions to a Config File
- [ ] Create `src/data/strategies.ts` (or `strategies.json`)
- [ ] Move the `STRATEGIES` constant (ICT, S&D, Wyckoff, ORB with all their setups/checklist/rules) out of TRADR.tsx into this file
- [ ] Import it in TRADR.tsx
- [ ] This is a pure refactor — no behaviour change
- **Why:** 100+ lines of config living in the main component. Adding a new strategy requires modifying TRADR.tsx.

### 3.6 Fix `react-hooks/exhaustive-deps` Suppressions
- [ ] Find all `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in TRADR.tsx
- [ ] For each one, fix the hook properly:
  - Move stable references into `useRef` or `useCallback`
  - Or use the functional updater form of setState to remove dependencies
  - Or restructure the effect so the dependency array is correct
- [ ] Remove the suppression comments once fixed
- **Why:** Each suppressed warning is a potential stale closure bug. These manifest as "why doesn't this update?" bugs that are hard to trace.

### 3.7 Replace `: any` Type Annotations on Core Data Objects
- [ ] In `src/TRADR.tsx`, find all handler functions using `(t: any)` for trade objects — replace with `(t: Trade)`
- [ ] Find all handler functions using `(c: any)` for circle objects — replace with `(c: Circle)`
- [ ] Find all handler functions using `(p: any)` for profile — replace with `(p: Profile)`
- [ ] The types are already defined in `src/types.ts` — use them
- [ ] Target: get `: any` count in TRADR.tsx below 20 (from 114)
- **Why:** TypeScript is not protecting your data layer at all right now.

---

## TIER 4 — ARCHITECTURE (ongoing, post-launch)

### 4.1 Complete the Follow System Migration
- [ ] Once `newFollows` flag is on and verified, remove the legacy `tradr_following_{uid}` KV read/write
- [ ] Remove the legacy `tradr_follower_{uid}_{code}` KV read/write
- [ ] Remove the migration code in `syncFollows()` that merges three data sources
- [ ] The `syncFollows()` function should only read from `public.follows` (v2)
- **Why:** Three simultaneous data systems for follows. The migration code runs on every load.

### 4.2 Begin Decomposing TRADR.tsx
- [ ] Create a `TradrContext` (or use Zustand store) for: `trades`, `profile`, `darkMode`, `C` (theme), `showToast`
- [ ] Extract all theme/style constants (`DARK`, `LIGHT`, `inp`, `lbl`, `pillPrimary`, `pillGhost`) into `src/theme.ts`
- [ ] Move all circle-related state and functions into `src/hooks/useCircles.ts`
- [ ] Move all follow-related state and functions into `src/hooks/useFollows.ts`
- [ ] Move trade CRUD functions into `src/hooks/useTrades.ts`
- [ ] Target: get TRADR.tsx below 2,000 lines by end of month 2 post-launch
- **Why:** 4,255 lines, 89 useState calls. Every feature addition makes this worse. This is the root cause of most other code quality issues.

### 4.3 Add Rate Limiting to Broker Endpoints
- [ ] Add IP-based rate limiting to `api/broker/connect.ts` (max 5 attempts per 10 minutes per IP)
- [ ] Add IP-based rate limiting to `api/cron/sync.ts` POST (manual trigger) — JWT auth helps but add rate limiting too
- [ ] Use the same Supabase KV rate limit pattern already implemented in `api/feedback.ts`
- **Why:** No protection against rapid repeated broker connection attempts.

### 4.4 Fix CSP Headers
- [ ] Investigate which specific scripts or styles require `unsafe-inline` and `unsafe-eval`
- [ ] Vite injects a small inline script for module loading — use a CSP nonce via a Vercel Edge Function or accept this exception and document it
- [ ] Remove `unsafe-eval` if possible — this is the higher-risk directive
- [ ] Add `upgrade-insecure-requests` directive
- **Why:** Current CSP provides false security. The headers look good but `unsafe-inline` + `unsafe-eval` mean XSS is not actually mitigated.

---

## TIER 5 — PRODUCT & GROWTH (post-launch)

### 5.1 Add Structured Onboarding for the Empty State
- [ ] After onboarding completes, if trades.length === 0, show a "Your first trade" guided prompt
- [ ] Pre-fill some form fields based on onboarding answers (instruments selected, strategy chosen)
- [ ] Add an "Import from CSV" shortcut in the empty state for users migrating from another journal
- **Why:** The product only reveals its value after data is logged. Speed up time-to-value.

### 5.2 Add Sitemap and robots.txt
- [ ] Create `public/sitemap.xml` with the main URL
- [ ] Create `public/robots.txt`
- [ ] Add canonical URL meta tag to `index.html`
- **Why:** Basic SEO hygiene. Currently invisible to search engines.

### 5.3 Replace OG Image with Actual Product Screenshot
- [ ] Current OG image (`/icon-512.png`) is just the app icon
- [ ] Create a proper 1200×630 OG image showing the dashboard with sample data
- [ ] Update `og:image` meta tag in `index.html`
- **Why:** The link preview when someone shares the app URL is just a logo. A screenshot of the actual product creates far more click-through.

### 5.4 Feed — Add Engagement Mechanics
- [ ] Add trade detail expandable view in the feed (show setup, R:R, session, notes)
- [ ] Add comment functionality to feed items (already exists on personal trades — bring it to feed)
- [ ] Add "follow back" prompt when someone you don't follow is following you
- **Why:** The feed is currently passive. No reason to check it beyond curiosity.

### 5.5 Prop Firm / Eval Account Mode
- [ ] Create `src/EvalAccountScreen.tsx` (types already defined in `src/types.ts`)
- [ ] Track profit target, daily loss limit, max drawdown with live progress bars
- [ ] Show "Evaluation" badge on the account selector
- **Why:** Large segment of retail futures traders are on prop firm evaluations. This is a direct acquisition hook.

---

## TESTING (start immediately, build over time)

### T.1 Fix the Existing Playwright Smoke Test
- [ ] Run `npx playwright test` — check if `tests/smoke.spec.ts` actually passes
- [ ] Fix any failures
- [ ] Add it to the GitHub Actions CI workflow (`.github/workflows/ci.yml`)

### T.2 Add Unit Tests for Stats Calculations
- [ ] Add `src/lib/stats.test.ts`
- [ ] Test `calcRR()` — edge cases: entry === stop, NaN inputs, result > 100
- [ ] Test win rate calculation
- [ ] Test streak calculation
- [ ] Test weekly P&L filter
- **Why:** These calculations directly affect what traders see as their performance. Bugs here are trust-destroying.

### T.3 Add Integration Test for Trade Log Submit
- [ ] Playwright test: sign in → fill trade form → submit → verify trade appears in history
- [ ] Playwright test: sign in → import CSV → verify trade count increases
- **Why:** The core user action in the product has zero automated coverage.

---

## QUICK WINS (under 30 minutes each, do anytime)

- [ ] Add `loading="lazy"` to all `<img>` tags in trade history
- [ ] Add `aria-label` to all icon-only buttons (the reaction buttons, the gear/settings button, etc.)
- [ ] Add `<meta name="robots" content="index, follow">` to `index.html`
- [ ] Remove stale PowerShell/bat scripts from repo root (mentioned in CLAUDE.md cleanup item)
- [ ] Remove `tradr-redesign.html` from repo if it exists
- [ ] Remove `dist-verify/` folder from repo
- [ ] Update `.env.example` with the 4 new required vars (`SUPABASE_SERVICE_ROLE_KEY`, `TRADR_ENCRYPTION_KEY`, `CRON_SECRET`, `TRADOVATE_*`)
- [ ] Add `autocomplete="current-password"` to the sign-in password field in TradrAuth.tsx
- [ ] Add `autocomplete="new-password"` to the sign-up password field in TradrAuth.tsx
- [ ] Verify `manifest.webmanifest` `start_url` is set to `"/"`

---

## PROGRESS TRACKING

| Tier | Total Tasks | Done | Remaining |
|------|-------------|------|-----------|
| Tier 1 — Blockers | 4 | 4 | 0 |
| Tier 2 — Pre-Launch | 7 | 0 | 7 |
| Tier 3 — Code Quality | 7 | 0 | 7 |
| Tier 4 — Architecture | 4 | 0 | 4 |
| Tier 5 — Product & Growth | 5 | 0 | 5 |
| Testing | 3 | 0 | 3 |
| Quick Wins | 10 | 0 | 10 |
| **Total** | **40** | **4** | **36** |

---

*Last updated: 2026-05-19*
*Based on audit of commit state at this date.*
