# TRADR — Project Context for Claude

> Read this file at the start of every session. It covers the full architecture, all decisions made, known issues, and what's next.

---

## What TRADR is

A trading journal PWA for retail traders. Users log trades, track stats (P&L, win rate, avg R), follow friends, and compete in Trading Circles. Built for mobile-first, installable as a home screen app on iOS and Android.

**Live URL:** https://tradrjournal.xyz (custom domain via GoDaddy → Vercel)
**Vercel project:** tradr.dt (dylnyland4459-1994s-projects)
**Supabase project ID:** vifwjwsndchnrpvfgrmg
**GitHub:** public repo, auto-deploys to Vercel on push to main

---

## Stack

- React 19 + TypeScript + Vite
- Supabase (auth + two KV tables: `user_kv` and `shared_kv`)
- Vercel (hosting + serverless functions in `api/`)
- Single-file app: `src/TRADR.tsx` (~5000+ lines, all UI + logic)
- Auth wrapper: `src/TradrAuth.tsx`
- Storage shim: `src/lib/storage.ts` (window.storage — wraps Supabase KV + localStorage cache)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/TRADR.tsx` | Entire app — all screens, state, logic |
| `src/TradrAuth.tsx` | Supabase auth wrapper, installs storage shim after sign-in |
| `src/lib/storage.ts` | `window.storage` shim: `get(key)`, `set(key, value, shared?)` |
| `src/lib/log.ts` | **NEW** Centralized logger — forwards to Sentry if loaded. Use instead of bare `console.error`. |
| `src/lib/sentry.ts` | **NEW** Optional Sentry init. No-op if `VITE_SENTRY_DSN` not set or `@sentry/react` not installed. |
| `src/lib/flags.ts` | **NEW** Feature flag util backed by localStorage. `isFlagOn("name")`. Toggle via `window.tradrFlags.enableFlag("name")`. |
| `src/data/circles.ts` | Circles data layer (existing) — single source for circle key naming + RLS-safe writes. |
| `src/data/follows.ts` | Follows data layer (existing) — per-row follow edges. |
| `src/data/trades.ts` | **NEW (v2 — not wired yet)** Typed CRUD against `public.trades`. Behind `newTrades` flag when ready. |
| `src/data/profile.ts` | **NEW (v2 — not wired yet)** Typed CRUD against `public.profiles`. Behind `newProfile` flag when ready. |
| `src/data/bootstrap.ts` | **NEW (v2 — not wired yet)** Parallel typed loader. Will replace `loadAll()` in `TRADR.tsx`. |
| `src/main.tsx` | Mounts React, installs storage shim before mount, calls `initSentry()`. |
| `api/feedback.ts` | Vercel serverless function — forwards feedback to Telegram |
| `vercel.json` | CSP + security headers |
| `supabase-schema.sql` | **LEGACY** Creates `user_kv` and `shared_kv` tables with RLS. New changes go in `supabase/migrations/` instead. |
| `supabase/migrations/001_rls_cleanup.sql` | **NEW** Removes dead `or like` branches from shared_kv RLS, adds `text_pattern_ops` index for `listByPrefix`. Idempotent. |
| `supabase/migrations/002_v2_schema_additive.sql` | **NEW** Creates v2 tables (`profiles`, `trades`, `circles`, `circle_members`, `follows`) ALONGSIDE the KV tables. No data is migrated. Live app behavior unchanged until flags flip. |
| `.github/workflows/ci.yml` | **NEW** Runs `lint + tsc --noEmit + build` on every PR. Status check should be required for `main`. |
| `DEPLOYMENT.md` | **NEW** Step-by-step runbook for shipping the audit changes safely. |
| `MIGRATION.md` | **NEW** Plan for migrating live data off KV onto v2 tables (dual-write → backfill → flag → cutover). |

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

---

## Profile Interface (key fields)

```tsx
interface Profile {
  name: string;
  handle: string;       // @username
  avatar: string;       // emoji or URL
  bio: string;
  broker: string;
  timezone: string;
  onboarded: boolean;
  publicTrades?: boolean; // toggle in settings — controls if trades show on public profile
  uid?: string;
  // ... targets, rules, checklist, etc.
}
```

`DEF_PROFILE` = default profile object with all fields.

---

## App Screens (tabs)

- **Home** — dashboard, stats overview
- **Log** — add/view trades
- **Feed** — friend activity feed (FriendsFeed component)
- **Circles** — Trading Circles (leaderboard, chat, join/create)
- **Settings** — profile, preferences, public trades toggle, delete account

---

## Features Built (as of last session)

- Trade logging with P&L, R-multiple, notes, screenshots
- Stats dashboard (win rate, avg R, streak, equity curve)
- Supabase persistence across devices via `window.storage`
- Trading Circles — create/join by code, leaderboard, circle chat
- Friend feed — follow by handle, see friends' trades
- Clickable public profiles — tap any name/avatar to see ProfileModal (stats, trades, follow/unfollow)
- "Public trades" privacy toggle in Settings
- Onboarding flow with localStorage backup (`tradr_onboarded = "1"`) to prevent re-loop on network failure
- React Error Boundary wrapping the whole app
- Feedback button (floating) → modal → POST `/api/feedback` → Telegram bot
- Custom domain tradrjournal.xyz live via GoDaddy DNS → Vercel
- PWA manifest, icons, iOS/Android installable

---

## Feedback → Telegram

`api/feedback.ts` sends feedback to Dylon's Telegram bot.

**Env vars needed in Vercel dashboard (Settings → Environment Variables):**
- `TELEGRAM_BOT_TOKEN` = `8693819106:AAENjfQhcWpCa1oNmFAzfWJKmWnOmVvvK0w`
- `TELEGRAM_CHAT_ID` = `7587404723`

**Important:** Dylon must open Telegram, find his bot, and send it `/start` once before messages will deliver.

Runtime config in `api/feedback.ts`:
```ts
export const config = { runtime: "nodejs" }; // NOT "nodejs20.x" — Vercel will reject that
```

---

## DNS Setup (tradrjournal.xyz)

Registrar: GoDaddy  
Nameservers: ns39.domaincontrol.com / ns40.domaincontrol.com

GoDaddy DNS records:
- A record `@` → `76.76.21.21` (Vercel IP)
- CNAME `www` → `f084cb49980fd15b.vercel-dns-017.com` (Vercel CNAME — check Vercel for exact value)

Vercel project: domain `tradrjournal.xyz` added and verified.

---

## Key Bugs Fixed (history — don't re-introduce)

| Bug | Fix |
|-----|-----|
| `React is not defined` at runtime | `deleteConfirm` / `deletingAccount` used `React.useState` — changed to `useState` |
| Onboarding loop for new users | Write `localStorage.setItem("tradr_onboarded", "1")` immediately in `onComplete`, before async Supabase save |
| `isJoiningCircle is not defined` | State existed in Tradr but wasn't passed as prop to TradingCircles — add to JSX call and function signature. Same fix for `isCreatingCircle` |
| ProfileModal "Profile not found" | Users hadn't re-saved since `profile_pub` key was added. Fall back to feed data (authorName/authorAvatar) when `profile_pub` not found |
| Vercel runtime error `nodejs20.x` | Change `api/feedback.ts` config to `runtime: "nodejs"` |
| Fragment crash in TradingCircles | Stray `</>` inserted by Python rfind in wrong component — removed |
| Unterminated string in CSV export | Literal newline inside join — changed to `"\\n"` |

---

## Code Patterns

### Writing to Python (large file edits)
TRADR.tsx is ~5000 lines. OneDrive can truncate large writes. Always use Python atomic writes:
```python
import os, tempfile
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

### Public profile written on every saveProfile
```tsx
const norm = u.handle.replace(/^@/, "").toLowerCase();
await (window as any).storage.set(
  `tradr_profile_pub_${norm}`,
  JSON.stringify({ name, handle: norm, avatar, bio, publicTrades }),
  true
);
```

### Logging (use this instead of console.error)
```tsx
import { log, safe } from "./lib/log";

// Instead of: console.error("[TRADR][bla]", err);
log.error("loadAll.trades", err, { userId });

// At an effect boundary, wrap with `safe` to log + return a fallback:
const trades = await safe("loadAll.trades", () => listTrades(uid), [] as Trade[]);
```

### Feature flags (for v2 cutovers)
```tsx
import { isFlagOn } from "./lib/flags";

if (isFlagOn("newTrades")) {
  // new code path (v2 data layer)
} else {
  // existing KV code path
}

// Toggle from devtools:
//   window.tradrFlags.enableFlag("newTrades"); location.reload();
```

### v2 data modules (when wiring in)
Do NOT replace existing reads. Add a flagged branch alongside them, ship behind the flag, flip on for one user (yourself), confirm, then promote. See `MIGRATION.md` for the per-resource plan.

---

## Feedback Button (current state)

States: `feedbackOpen`, `feedbackText`, `feedbackSending`, `feedbackSent`

On success: sets `feedbackSent(true)`, button turns green and shows "Sent! ✓", then after 1500ms closes modal and resets all state.

---

## What's Next / Backlog

### Audit follow-ups (post phase 1 — see DEPLOYMENT.md / MIGRATION.md)

- [ ] Run migration `001_rls_cleanup.sql` in Supabase
- [ ] Run migration `002_v2_schema_additive.sql` in Supabase (creates v2 tables, no data migrated)
- [ ] Set up branch protection on `main` (require CI `build` status check)
- [ ] (Optional) Install `@sentry/react` + set `VITE_SENTRY_DSN` in Vercel
- [ ] Replace silent `try { } catch { }` blocks in `TRADR.tsx` with `log.error("scope", e)`
- [ ] Wire `getProfile`/`upsertProfile` from `src/data/profile.ts` behind the `newProfile` flag
- [ ] Backfill script for trades (template in MIGRATION.md), behind `newTrades` flag
- [ ] Split `TRADR.tsx` — start with `SettingsScreen.tsx`, one screen per PR
- [ ] Move screenshots from base64-in-trade to Supabase Storage URLs
- [ ] Replace N+1 `fetchCircleLeaderboard` (TRADR.tsx:1607) with a single SQL query against the v2 schema
- [ ] Add a Playwright smoke test (sign in → log trade → join circle) that runs on every preview deploy

### Other backlog

- Real-time circle updates (Supabase broadcast — currently manual refresh)
- Push notifications / email for circle activity
- Roadmap progress widget (TRADR vs TraderSync / Tradezella / Edgewonk)
- Google OAuth (wired but not configured in Supabase — remove button or configure)
- Landing on Circles tab by default (change `useState("home")` → `useState("circles")`)

---

## Deploying

**Never push directly to `main` again.** Use feature branches + PRs so the
Vercel preview URL becomes your staging environment.

```powershell
# From C:\Users\Dylon\OneDrive\Desktop\tradr
git checkout -b feat/short-description
git add .
git commit -m "describe change"
git push -u origin feat/short-description
```

GitHub will print a PR URL. Open it. CI runs (`lint + tsc + build`).
Vercel posts a preview URL — open that on phone + desktop, smoke-test
sign-in, log a trade, join/leave a circle. If clean, **Merge** in GitHub.
Vercel auto-deploys to prod on merge.

Rollback: Vercel → Deployments → click previous green deploy → Promote to Production.

Branch protection is set on `main` — required status check is the `build`
job from `.github/workflows/ci.yml`. If CI is red, the PR can't merge.

See `DEPLOYMENT.md` for the full runbook including running Supabase
migrations and turning on Sentry.

---

## People

- **Dylon** — founder/developer
- **Bruno** — early tester, helped test circles/onboarding
