# TRADR — Claude Code Operating Rules & Project Context

> Read this file at the start of every session. Follow the Operating Rules without exception, then use the project context below for all decisions.

---

## Operating Rules

These rules apply to every task in this repo.

### Rule 1 — Plan before code
- Never touch a file before writing a plan.
- Output the plan as a numbered checklist: files to touch, what changes in each, what could break, how you'll verify.
- If anything unexpected happens mid-execution (failed test, wrong assumption, scope creep, surprising file state), STOP. Do not "push through." Re-plan from the new reality and show me the revised plan before continuing.

### Rule 2 — Offload hard problems to sub-agents
- For any task with multiple independent parts (refactor + tests + docs, multi-file investigation, parallel searches), spawn sub-agents via the Task tool.
- Keep the main context clean: sub-agents do the deep digging and return summaries.
- Main thread = orchestration and decisions only.

### Rule 3 — Self-improvement loop
- Every lesson learned (mistake made, wrong assumption corrected, surprising codebase behavior, user correction) gets appended to `tasks/lessons.md` as a rule.
- Format: `- [YYYY-MM-DD] [category] Rule in imperative form.`
- Before starting any task, read `tasks/lessons.md` and apply any relevant rules.
- If a lesson contradicts a rule here, flag it — do not silently override.

### Rule 4 — Prove it works
- Nothing is marked done until:
  1. Relevant tests run and pass (or new tests added if none existed).
  2. Logs checked — no new errors or warnings introduced.
  3. The change is verified end-to-end in the actual flow it affects, not just in isolation.
- "It should work" is not done. "I ran it and here's the output" is done.

### Rule 5 — Autonomous bug fixing
- When a bug is presented:
  1. Reproduce it first. Don't trust the description — confirm the symptom.
  2. Go to the logs. Find the actual stack trace or error.
  3. Trace to root cause — not the first plausible suspect, the actual cause.
  4. Fix the root cause, not the symptom.
  5. Add a test or log assertion that would have caught it.
  6. Verify per Rule 4.
- Do not ask permission to investigate. Investigate, then propose the fix.

---

---

## What TRADR is

A trading journal PWA for retail traders. Users log trades, track stats (P&L, win rate, avg R), follow friends, and compete in Trading Circles. Built for mobile-first, installable as a home screen app on iOS and Android.

**Live URL:** https://tradrjournal.xyz and https://www.tradrjournal.xyz (both active, custom domain via GoDaddy → Vercel)
**Vercel project:** tradr.dt (dylnyland4459-1994s-projects)
**Supabase project ID:** vifwjwsndchnrpvfgrmg
**GitHub:** public repo, auto-deploys to Vercel on push to main

---

## Stack

- React 19 + TypeScript + Vite
- Supabase (auth + KV tables + v2 relational schema)
- Vercel (hosting + serverless functions in `api/` + Vercel Cron every 5 min)
- Main app: `src/Koda.tsx` (~4300 lines — many screens extracted into separate files)
- Auth wrapper: `src/KodaAuth.tsx`
- Storage shim: `src/lib/storage.ts` (window.storage — wraps Supabase KV + localStorage cache)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/Koda.tsx` | Main app shell — state, routing, home/feed/circles/rules/sync/settings |
| `src/KodaAuth.tsx` | Supabase auth wrapper, installs storage shim after sign-in |
| `src/lib/storage.ts` | `window.storage` shim: `get(key)`, `set(key, value, shared?)` |
| `src/lib/log.ts` | Centralised logger — forwards to Sentry if loaded. Use instead of bare `console.error`. |
| `src/lib/sentry.ts` | Optional Sentry init. No-op if `VITE_SENTRY_DSN` not set or `@sentry/react` not installed. |
| `src/lib/flags.ts` | Feature flag util backed by localStorage. `isFlagOn("name")`. Toggle via `window.kodaFlags.enableFlag("name")`. |
| `src/lib/tradovate.ts` | Client-side Tradovate helpers (auth, refresh, fills, FIFO matching). |
| `src/DataSourcesScreen.tsx` | **NEW** Sync tab UI — broker cards, connect/disconnect modal, CSV import, sync audit log. |
| `src/CsvImportPanel.tsx` | CSV import with auto-detect, analytics reveal, saved templates. Presets: Tradovate, Rithmic, TradingView, MT4/MT5, NinjaTrader 8, TopstepX, FTMO/MT5. |
| `src/SettingsScreen.tsx` | Settings tab — profile edit, dark mode, export, delete account. |
| `src/LogTradeScreen.tsx` | Log tab — trade entry form. |
| `src/TradingCircles.tsx` | Circles tab — create/join, leaderboard, chat. |
| `src/FriendsFeed.tsx` | Feed tab — follow activity. |
| `src/OnboardingFlow.tsx` | 5-step onboarding flow. |
| `src/ProfileModal.tsx` | Tap any name/avatar → profile modal with stats + follow/unfollow. |
| `src/charts.tsx` | All chart components: PnL, equity curve, win rate, heatmaps, MAE/MFE, etc. |
| `src/shared.tsx` | Shared constants (MONO, BODY fonts), AvatarCircle, stratCode helpers. |
| `src/types.ts` | Trade, Profile, Circle, EvalAccount interfaces. |
| `src/data/circles.ts` | Circles data layer — single source for circle key naming + RLS-safe writes. |
| `src/data/follows.ts` | Follows data layer — per-row follow edges. |
| `src/data/trades.ts` | v2 typed CRUD against `public.trades`. Behind `newTrades` flag when ready. |
| `src/data/profile.ts` | v2 typed CRUD against `public.profiles`. Behind `newProfile` flag when ready. |
| `src/data/bootstrap.ts` | v2 parallel typed loader. Will replace `loadAll()` when flags flip. |
| `src/LotSizeCalculator.tsx` | **NEW** Futures-only position size calculator — floating ⚖️ button, bottom-sheet modal, 16 contracts. |
| `src/BetaGate.tsx` | **NEW** Closed-beta password wall — shown before auth if `VITE_BETA_PASSWORD` is set. Unlock persists in localStorage. |
| `src/lib/posthog.ts` | **NEW** PostHog analytics wrapper — `initPostHog`, `phIdentify`, `phCapture`, `phReset`. No-op if key not set. |
| `src/main.tsx` | Mounts React, installs storage shim, calls `initSentry()` and `initPostHog()`. |
| `api/broker/connect.ts` | POST /api/broker/connect — authenticates with Tradovate, encrypts tokens, upserts broker_connections. |
| `api/broker/disconnect.ts` | POST /api/broker/disconnect — deletes connection (user_id guard). |
| `api/cron/sync.ts` | **NEW** GET (cron, every 5 min) + POST (manual) — FIFO fill matching, token refresh, idempotent trade upsert. |
| `api/lib/cryptoUtils.ts` | **NEW** AES-256-GCM encrypt/decrypt for broker token storage. Requires `TRADR_ENCRYPTION_KEY`. |
| `api/lib/supabaseAdmin.ts` | **NEW** Service-role Supabase client + JWT verifier for serverless functions. |
| `api/feedback.ts` | POST → Telegram bot. |
| `api/tradovate.ts` | Tradovate API proxy (auth, accounts, positions, fills, contracts). |
| `vercel.json` | CSP headers + Vercel Cron config (every 5 min → /api/cron/sync). |
| `supabase/migrations/001_rls_cleanup.sql` | Removes dead RLS branches, adds text_pattern_ops index. |
| `supabase/migrations/002_v2_schema_additive.sql` | Creates v2 tables (profiles, trades, circles, circle_members, follows). |
| `supabase/migrations/003_storage_bucket.sql` | Trade screenshot storage bucket + RLS. |
| `supabase/migrations/004_plan_jwt_claims.sql` | JWT plan claim hook for Stripe billing. |
| `supabase/migrations/005_broker_sync.sql` | **NEW** broker_connections + sync_events tables, external_id + review_status on trades. ✅ Run May 2026. |
| `.github/workflows/ci.yml` | Runs lint + tsc + build on every PR. |
| `DEPLOYMENT.md` | Step-by-step deploy runbook. |
| `MIGRATION.md` | Plan for migrating live data off KV onto v2 tables. |

---

## Supabase Data Model

### `user_kv` (private per-user)
- `uid` — Supabase auth user ID
- `key` — string key (e.g. `tradr_profile`, `tradr_trades`)
- `value` — JSON blob
- RLS: user can only read/write their own rows

### `shared_kv` (public-readable)
- `key` — string key
- `value` — JSON blob
- RLS: anyone can read, only the owner can write
- Used for: circle data, public profiles (`tradr_profile_pub_{handle}`), friend feeds

### Key storage keys
| Key | Table | Contents |
|-----|-------|----------|
| `tradr_profile` | user_kv | Full profile (private) |
| `tradr_trades` | user_kv | Trade history |
| `tradr_profile_pub_{handle}` | shared_kv | Public profile (name, handle, avatar, bio, publicTrades flag) |
| `tradr_feed_{uid}` | shared_kv | Published trade feed for social/circles |
| `tradr_circle_{code}` | shared_kv | Circle data + members + leaderboard |
| `tradr_following_{uid}` | user_kv | Who the user follows |

### `public.broker_connections` (v2 — live)
Stores one row per user+broker account. Tokens encrypted at rest with AES-256-GCM.
- `id` (uuid PK), `user_id` (FK auth.users), `broker` (text), `env` (demo/live)
- `account_id`, `account_name` — human-readable Tradovate account name
- `access_token_enc`, `refresh_token_enc` — AES-256-GCM encrypted, base64
- `token_expires_at` — checked 10 min before expiry; auto-refreshed in cron
- `sync_status` — connected / syncing / error / disconnected / paused
- `sync_error`, `last_sync_at`
- RLS: user can only see/modify their own rows

### `public.sync_events` (v2 — live)
Immutable audit log of every sync attempt (success or failure).
- `id`, `user_id`, `connection_id` (FK broker_connections), `broker`
- `started_at`, `completed_at`, `trades_found`, `trades_new`, `error`
- RLS: user can only read their own rows

### `public.trades` additions (migration 005)
- `external_id` — dedup key (format: `tv-{entryFillId}-{exitFillId}`)
- `source` — `'manual'` | `'api'` (auto-synced)
- `broker` — `'tradovate'` etc.
- `raw_data` (jsonb) — original fill objects
- `review_status` — `'draft'` | `'published'` | `'skipped'`
  - Auto-synced trades land as `'draft'` — not shown in main journal until user publishes
  - Manually logged trades default to `'published'`

---

## Vercel Environment Variables

All must be set in Vercel dashboard → Settings → Environment Variables (Production + Preview):

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe) |
| `SUPABASE_URL` | Same URL — used by serverless functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS in cron/api functions |
| `TRADR_ENCRYPTION_KEY` | 64 hex chars (32 bytes) — AES-256-GCM key for broker token storage. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Random string — sent as `x-cron-secret` header by Vercel Cron to authenticate GET /api/cron/sync |
| `TRADOVATE_APP_ID` | Tradovate app ID |
| `TRADOVATE_APP_VERSION` | Tradovate app version |
| `TRADOVATE_CID` | Tradovate CID (numeric) |
| `TRADOVATE_SEC` | Tradovate SEC secret |
| `TELEGRAM_BOT_TOKEN` | Feedback bot token |
| `TELEGRAM_CHAT_ID` | Feedback bot chat ID |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `STRIPE_PRICE_ID` | Stripe Pro price ID |
| `VITE_SENTRY_DSN` | Optional — leave blank to disable Sentry |
| `VITE_POSTHOG_KEY` | PostHog project API key (`phc_...`). Leave blank to disable analytics. |
| `VITE_POSTHOG_HOST` | PostHog host — `https://eu.i.posthog.com` (EU cloud) or `https://us.i.posthog.com` (US). |
| `VITE_BETA_PASSWORD` | Closed-beta invite code. If set, shows BetaGate before auth. Leave blank to disable the gate. |

> ⚠️ Never commit real credential values to CLAUDE.md or any tracked file. This file is in a public git repo.

---

## Profile Interface (key fields)

```tsx
interface Profile {
  name: string;
  handle: string;         // @username — auto-filled from name during onboarding
  avatar: string;         // emoji (e.g. "🎯") or data:image/ or https:// URL
  bio: string;
  broker: string;
  timezone: string;
  onboarded: boolean;
  publicTrades?: boolean; // toggle in settings — controls if trades show on public profile
  instruments?: string[]; // futures they trade: ["ES", "NQ", "CL", ...]
  socialLinks?: { twitter?: string }; // social handles collected at onboarding
  uid?: string;
  // ... targets, rules, checklist, etc.
}
```

`DEF_PROFILE` = default profile object with all fields, including `instruments: []` and `socialLinks: {}`.

**AvatarCircle** renders emoji avatars natively — if `avatar` is a short string (≤8 chars) that isn't a URL or data URI, it renders as an emoji at 50% of the circle size.

---

## App Screens (tabs)

- **Home / Overview** — dashboard, stats, feed sub-sections
- **Log** — add/view trades
- **Feed** — friend activity feed (FriendsFeed component)
- **Circles** — Trading Circles (leaderboard, chat, join/create)
- **Sync** — broker connections (Tradovate live sync) + CSV import + audit log
- **Settings** — profile, preferences, public trades toggle, delete account

Home tab has sub-nav: Overview · Circles · Execution · Rules · **Sync** · Settings

---

## Features Built

- Trade logging with P&L, R-multiple, notes, screenshots
- Stats dashboard (win rate, avg R, streak, equity curve, MAE/MFE, session heatmaps)
- Supabase persistence across devices via `window.storage`
- Trading Circles — create/join by code, leaderboard, circle chat
- Friend feed — follow by handle, see friends' trades
- Clickable public profiles — tap any name/avatar to see ProfileModal (stats, trades, follow/unfollow)
- "Public trades" privacy toggle in Settings
- **5-step onboarding** — name + handle + emoji avatar, bio + Twitter/X, instruments multi-select, strategy, ready summary. localStorage backup prevents re-loop on network failure.
- React Error Boundary wrapping the whole app
- Feedback button → modal → POST `/api/feedback` → Telegram bot
- Custom domain tradrjournal.xyz live via GoDaddy DNS → Vercel
- PWA manifest, icons, iOS/Android installable
- Stripe billing (Free / Pro / Elite) — checkout, portal, webhook, JWT plan claim
- **Tradovate live sync** — connect account, encrypted token storage, 5-min Vercel Cron, FIFO fill→trade matching, idempotent upsert, token auto-refresh, manual sync trigger, sync audit log. ⚠️ Live broker UI hidden behind "Coming Soon" banner — requires Tradovate partner/API credentials.
- **CSV import** — 7 broker presets with auto-detection: Tradovate, Rithmic, TradingView, MT4/MT5, NinjaTrader 8, TopstepX, FTMO/MT5. Analytics reveal, session auto-tagging, saved templates, dedup.
- **Lot Size Calculator** — futures-only position sizer. Floating ⚖️ button bottom-left, bottom-sheet modal. 16 contracts (ES, MES, NQ, MNQ, RTY, M2K, YM, MYM, CL, MCL, GC, MGC, SI, NG, ZN, ZB). Risk by % of balance or fixed $. Outputs: contracts, actual risk, stop ticks, stop points, risk/contract.
- **PostHog analytics** — `posthog-js` installed, init in `main.tsx`, EU cloud (`eu.i.posthog.com`). Key events: `trade_logged`, `trade_edited`, `csv_imported`, `calculator_opened`, user identified on load, reset on sign-out. Requires `VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST` in Vercel.
- **Beta access wall** — `BetaGate.tsx` shown before auth when `VITE_BETA_PASSWORD` is set. Matches platform aesthetic (warm dark palette, IBM Plex Mono, editorial style). Unlock stored in localStorage (`tradr_beta_unlocked`). Existing users unaffected until env var is set.

---

## Broker Sync Architecture

```
Vercel Cron (GET /api/cron/sync every 5 min)
  └─ x-cron-secret header auth
  └─ fetchAll broker_connections where status = connected/error
  └─ runWithConcurrency(10) → syncConnection(conn)
        ├─ decrypt access token (AES-256-GCM)
        ├─ refresh if expiring within 10 min
        ├─ GET /fill/list from Tradovate
        ├─ filter to fills newer than last_sync_at
        ├─ resolveSymbols (contract IDs → names)
        ├─ fillsToTradeRows() — FIFO queue matching per contract
        │     external_id = "tv-{entryFillId}-{exitFillId}"
        │     review_status = "draft"
        ├─ upsert to public.trades ON CONFLICT (user_id, external_id) ignoreDuplicates
        ├─ update broker_connections (sync_status, last_sync_at)
        └─ insert sync_events (audit row)

POST /api/cron/sync (manual trigger, JWT auth)
  └─ same flow but only for the authenticated user, concurrency 5
```

**Token security:** Tradovate credentials are used once to get a token — never stored. Tokens stored as `base64(IV[12] || AuthTag[16] || Ciphertext)` in Postgres text columns. Key lives only in `TRADR_ENCRYPTION_KEY` env var.

**Deduplication:** `external_id` = `tv-{entryFillId}-{exitFillId}` + unique index on `(user_id, external_id)`. Re-running sync is fully idempotent.

**Review Inbox pattern:** Auto-synced trades land as `review_status = 'draft'`. They don't appear in the main journal until the user enriches and publishes them. ⚠️ Review Inbox UI not built yet — this is the next priority.

---

## DNS Setup (tradrjournal.xyz)

Registrar: GoDaddy
Nameservers: ns39.domaincontrol.com / ns40.domaincontrol.com

GoDaddy DNS records:
- A record `@` → `76.76.21.21` (Vercel IP)
- CNAME `www` → `f084cb49980fd15b.vercel-dns-017.com`

Both `tradrjournal.xyz` and `www.tradrjournal.xyz` verified and live in Vercel.

---

## Key Bugs Fixed (history — don't re-introduce)

| Bug | Fix |
|-----|-----|
| `React is not defined` at runtime | `deleteConfirm` / `deletingAccount` used `React.useState` — changed to `useState` |
| Onboarding loop for new users | Write `localStorage.setItem("tradr_onboarded", "1")` immediately in `onComplete`, before async Supabase save |
| `isJoiningCircle is not defined` | State existed in Tradr but wasn't passed as prop to TradingCircles — add to JSX call and function signature. Same fix for `isCreatingCircle` |
| ProfileModal "Profile not found" | Users hadn't re-saved since `profile_pub` key was added. Fall back to feed data (authorName/authorAvatar) when `profile_pub` not found |
| Vercel runtime error `nodejs20.x` | Change all `api/*.ts` config to `runtime: "nodejs"` (not `"nodejs20.x"`) |
| Fragment crash in TradingCircles | Stray `</>` inserted by Python rfind in wrong component — removed |
| Unterminated string in CSV export | Literal newline inside join — changed to `"\\n"` |
| Koda.tsx truncated to 0 bytes | OneDrive write race condition. Always use Python atomic write: write to `.tmp`, then `os.replace()`. Recovered via git. |
| `Stripe.LatestApiVersion` TS error | Removed in Stripe SDK v22 — replace `as Stripe.LatestApiVersion` with `as any` in `api/stripe-checkout.ts` and `api/stripe-portal.ts`. |
| Supabase `.catch()` TS error | Query builder returns `PromiseLike`, not `Promise` — replace `.then(() => {}).catch(() => {})` with `.then(() => {}, () => {})` (api/feedback.ts). |
| git `index.lock` on OneDrive | Sandbox can't delete lock file via bash. User must run `Remove-Item .git\index.lock -Force` in their own PowerShell terminal. |
| Vercel not auto-deploying | Pushes to feature branches create Preview deploys only. Merge to `main` for Production. If `git push` says "Everything up-to-date", trigger manual redeploy in Vercel → Deployments (uncheck build cache). |

---

## Code Patterns

### Writing large files (Koda.tsx etc.)
Koda.tsx is ~4300 lines. OneDrive can truncate large writes. Always use Python atomic writes. After any large write, verify `wc -l src/Koda.tsx` is reasonable and `npm run build` passes.
```python
import os
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    f.write(content)
os.replace(tmp, path)
```

### Storage reads/writes (legacy KV — current prod code path)
```tsx
// Private (user only)
const data = await (window as any).storage.get("tradr_profile");
await (window as any).storage.set("tradr_profile", JSON.stringify(profile));

// Public (shared_kv)
await (window as any).storage.set("tradr_profile_pub_handle", JSON.stringify(pubProfile), true);
```

### Logging (use this instead of console.error)
```tsx
import { log, safe } from "./lib/log";

log.error("loadAll.trades", err, { userId });

// At an effect boundary:
const trades = await safe("loadAll.trades", () => listTrades(uid), [] as Trade[]);
```

### Feature flags (for v2 cutovers)
```tsx
import { isFlagOn } from "./lib/flags";

if (isFlagOn("newTrades")) {
  // v2 data layer
} else {
  // legacy KV path
}

// Toggle from devtools:
//   window.tradrFlags.enableFlag("newTrades"); location.reload();
```

### v2 data modules (when wiring in)
Do NOT replace existing reads. Add a flagged branch alongside them, ship behind the flag, flip on for yourself, confirm, then promote. See `MIGRATION.md`.

### Broker API calls (serverless only)
Always import from `api/lib/` — never from `src/`. Service role key and encryption key are server-only.
```ts
import { tryDecrypt, encrypt } from "../lib/cryptoUtils";
import { getAdminClient, getUserIdFromJwt } from "../lib/supabaseAdmin";
```

---

## What's Next / Backlog

### Broker sync follow-ups (highest priority)

- [ ] **Review Inbox UI** — trades land as `review_status = 'draft'` but there's no UI to see/publish them. Add a badge to the Log tab + a drawer or screen listing drafts with "Publish" / "Skip" actions. This is the most important missing piece.
- [ ] Update `.env.example` with the 4 new required vars (`SUPABASE_SERVICE_ROLE_KEY`, `TRADR_ENCRYPTION_KEY`, `CRON_SECRET`, `TRADOVATE_*`)
- [ ] Repo cleanup — delete one-off PowerShell/bat scripts, `tradr-redesign.html`, `dist-verify/` folder, `TRADR-BRAIN.md` (commit: `chore: remove stale scripts and committed build artifacts`)
- [ ] Add Rithmic/NinjaTrader 8/TopstepX live API connections (CSV covers import; API would enable live sync)

### v2 data layer migration

- [x] Run migration `001_rls_cleanup.sql` ✓ (May 2026)
- [x] Run migration `002_v2_schema_additive.sql` ✓
- [x] Run migration `005_broker_sync.sql` ✓ (May 2026)
- [ ] Verify v2 profile path: `localStorage.tradr_flags = "newProfile"; location.reload();` → save profile → `select * from profiles;`
- [ ] Wire follows v2 behind `newFollows` flag
- [ ] Wire circles v2 behind `newCircles` flag
- [ ] Wire trades v2 behind `newTrades` flag — riskiest, do last
- [ ] Backfill script for trades (template in MIGRATION.md)

### Architecture

- [ ] Split `Koda.tsx` further — extract remaining inline screens
- [ ] Move screenshots from base64-in-trade to Supabase Storage URLs
- [ ] Replace N+1 `fetchCircleLeaderboard` with single SQL query against v2 schema
- [ ] Set up branch protection on `main` (require CI `build` status check)
- [ ] Add Playwright smoke test (sign in → log trade → join circle) on every preview deploy

### Competitive roadmap

Key competitors: TraderSync ($30–80/mo), Tradezella ($29–89/mo), Edgewonk ($197/yr), TradesViz ($0–30/mo).
TRADR target pricing: Free tier · Pro $24.99/mo.

**Tech stack (May 2026)**
- Vercel — hosting + serverless + cron
- GitHub — source control, auto-deploys to Vercel on push to `main`
- Supabase — database, auth, storage
- Sentry — error monitoring (wired, needs `VITE_SENTRY_DSN`)
- PostHog — product analytics (wired, needs `VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST`)
- Stripe — billing (Free / Pro / Elite)
- Figma — UI/UX design

**Sprint 1 — Close the core gap**
- [x] Tradovate live sync — connect screen, fill→trade, 5-min cron ✓
- [x] CSV import — Rithmic, NinjaTrader 8, TopstepX, FTMO/MT5 presets ✓
- [x] Session time-of-day heatmap + day-of-week breakdown ✓
- [x] Lot Size Calculator — futures-only, floating button, 16 contracts ✓
- [x] PostHog analytics — wired, key events captured ✓
- [x] Beta access wall — BetaGate component, env-var controlled ✓
- [ ] Review Inbox — publish draft trades from auto-sync

**Sprint 2 — Psychology + Prop Firm**
- [ ] Per-trade emotional state field (Calm / FOMO / Revenge / Confident) + rule-adherence Y/N + mistake tag
- [ ] Prop firm account mode — evaluation targets (profit target, daily loss limit, max drawdown), live progress bars
- [ ] Discipline score card — "You followed your rules on 71% of trades this month"

**Sprint 3 — Advanced Analytics**
- [ ] Setup P&L breakdown — which setups actually make money
- [ ] MAE/MFE per trade (broker data now available via sync)
- [ ] Commission/fee tracking — gross vs. net P&L
- [ ] Weekly report card — in-app summary, shareable image

**Sprint 4 — Monetisation**
- [x] Stripe billing integration ✓
- [ ] Basic AI insights — rule-based pattern detection ("You make 80% of profit before 11am ET")
- [ ] TradingView chart embed on trade detail view (entry/exit markers)

### Other backlog

- Real-time circle updates (Supabase broadcast — currently manual refresh)
- Push notifications / email for circle activity
- Google OAuth (wired but not configured in Supabase — remove button or configure)
- Multiple accounts (prop eval 1, prop eval 2, personal)
- Weekly/monthly auto-generated report card (shareable)

---

## Deploying

**Never push directly to `main`.** Use feature branches + PRs.

```powershell
# From C:\Dev\tradr
git checkout -b feat/short-description
git add .
git commit -m "describe change"
git push -u origin feat/short-description
```

GitHub will print a PR URL. CI runs (`lint + tsc + build`). Vercel posts a preview URL — smoke-test on phone + desktop. If clean, **Merge** in GitHub. Vercel auto-deploys to prod.

Rollback: Vercel → Deployments → previous green deploy → Promote to Production.

Branch protection on `main` — required status check is the `build` job from `.github/workflows/ci.yml`.

See `DEPLOYMENT.md` for the full runbook including Supabase migrations and Sentry setup.

---

## People

- **Dylon** — founder/developer
- **Bruno** — early tester, helped test circles/onboarding
