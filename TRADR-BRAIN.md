# TRADR · Master Context Document

> Single source of truth for what TRADR is, how it's built, what's been fixed, and where it's going.
> Paste this into a new Claude conversation to get fully up to speed in one shot.
>
> Last updated: 2026-04-27

---

## 1. What TRADR Is

TRADR is a **mobile-first trading journal + social layer** delivered as an installable PWA.
Currently in **closed beta**, deployed on Vercel.

Three product loops:

**The Journal Loop.** Log trades (entry, exit, size, R:R, strategy, screenshot, notes). Stats roll up automatically — win rate, avg R, expectancy, streaks, equity curve, per-strategy breakdown.

**The Social Loop.** Each trader gets a stable 6-char code (FNV-1a hash of their auth UID, e.g. `A7F3B2`). Follow by code, see a feed of mutual-friend trades, react. One-way follow graph; mutual = friends.

**The Circles Loop (the USP).** Small private groups (~50 members) with a shared leaderboard. Each member publishes their own stats row; leaderboard computed client-side. Use cases: prop-firm cohorts, Discord trading groups, accountability pods.

**Target user:** retail/prop futures + crypto traders, age 22-40, already in a Discord or prop-firm cohort.

---

## 2. Current Features

- **Auth** — Supabase email/password + password reset (magic link). No OAuth.
- **Profile** — Name, handle, avatar (emoji or image), bio, strategy tags, custom circle alias (3-12 alphanumeric, uppercased). Auto-generated 6-char trader code, stable across devices.
- **Trade journal** — Add/edit/delete trades. Confirmation dialog on delete. Timestamps (`createdAt` + `updatedAt`). CSV import with djb2 dedup hash (7-field key — immune to single-field edits). Filter by strategy/outcome/pair.
- **Stats** — Win rate, total P&L, avg R, expectancy, current streak, best/worst trade, per-strategy breakdown, equity curve.
- **Insights** — AI-style pattern detection, minimum 10 trades per strategy before a signal fires; consistency threshold 20 trades.
- **Comments** — Per-trade comments. Author-only delete (checked client-side by `comment.author === profile.name`).
- **Reactions** — Per-user array (one reaction per user per trade), true toggle. Legacy number-count format migrated automatically.
- **Follow graph** — Follow by trader code. Per-row ownership: follower writes both edges so RLS never fights. Realtime subscription.
- **Circles** — Create/join/leave. Each member's leaderboard entry is its own row (per-row RLS). Circle owner can kick members via ban list pattern (see RLS section). Leaderboard auto-refreshes every 2 min + realtime subscription. Members can set a custom alias shown on the leaderboard.
- **Settings** — `← Overview` back button returns to feed without reloading. Dark mode toggle. Strategy thresholds and rules.
- **Error boundary** — `ErrorBoundary.tsx` wraps the whole app; uncaught React errors show a fallback UI with "Reload app →" instead of a blank screen.
- **Storage errors** — Supabase write failures surface as user-visible toasts via `onStorageError` callback chain.
- **PWA** — Installable on iOS/Android, safe-area insets, no iOS zoom-on-focus.

---

## 3. Tech Stack

**Frontend.** React 19, Vite 8, TypeScript ~5.9. Single monolithic component (`src/TRADR.tsx`, ~3600 lines).

**Data layer.** All reads/writes via `window.storage` shim (`src/lib/storage.ts`), wrapping:
- `user_kv (user_id, key, value)` — private per-user data. RLS: `auth.uid() = user_id`.
- `shared_kv (owner_id, key, value)` — cross-user data. RLS: `auth.uid() = owner_id` for writes, public read.
- `localStorage` — synchronous cache, instant reads, offline fallback.

Domain modules on top of the shim:
- `src/data/circles.ts` — circle meta, member rows, leaderboard entries, realtime.
- `src/data/follows.ts` — follow edges, legacy migration, realtime.

**Backend.** Supabase (Postgres + Auth + Realtime). Schema in `supabase-schema.sql`.

**Deployment.** Vercel, auto-deploy from `main`. Env vars currently hardcoded in `src/lib/supabase.ts`.

**Type-checking.** `npx tsc --noEmit` (Vite build has EPERM on Windows/OneDrive mount — run `vite build` from a Windows terminal or rely on Vercel).

---

## 4. The RLS Pattern (memorize this)

Every row in `shared_kv` has exactly one owner. **Only that owner can write to it.** This is enforced at the Postgres level — violations fail silently on the client.

| Action | Row key | Owner |
|--------|---------|-------|
| Following | `tradr_follow_<me>_<them>` + `tradr_follower_<them>_<me>` | The follower (me) — both rows |
| Joining a circle | `tradr_circle_member_<CIRCLE>_<me>` | The joiner (me) |
| Publishing stats | `tradr_circle_entry_<CIRCLE>_<me>` | The member (me) |
| Kicking a member | `tradr_circle_bans_<CIRCLE>` | The circle creator |

**Kicking works via ban list, not deletion.** The circle owner cannot delete a member's row (they don't own it). Instead they write/update `tradr_circle_bans_<CIRCLE>` (a row they do own) with a JSON array of banned member codes. `readCircleMembers()` fetches bans in parallel and filters them out on every load.

If you ever find yourself needing to UPDATE a row owned by someone else — stop. Add a new row you own instead.

---

## 5. Key Storage Keys

| Key | Table | Owner | Purpose |
|-----|-------|-------|---------|
| `tradr_profile` | `user_kv` | user | Profile (name, handle, avatar, alias…) |
| `tradr_trades` | `user_kv` | user | Trade array |
| `tradr_circles` | `user_kv` | user | My circle memberships |
| `tradr_circle_<CODE>` | `shared_kv` | creator | Circle metadata |
| `tradr_circle_member_<CODE>_<ME>` | `shared_kv` | member | My member record in a circle |
| `tradr_circle_entry_<CODE>_<ME>` | `shared_kv` | member | My published leaderboard stats |
| `tradr_circle_bans_<CODE>` | `shared_kv` | creator | Banned member codes (array) |
| `tradr_follow_<ME>_<THEM>` | `shared_kv` | follower | Outgoing follow edge |
| `tradr_follower_<THEM>_<ME>` | `shared_kv` | follower | Reverse index for follower lookup |

---

## 6. Known Issues

- **Hardcoded Supabase credentials** in `src/lib/supabase.ts`. Low security risk (anon key is RLS-bounded), but poor hygiene. Should migrate to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **Monolithic TRADR.tsx** (~3600 lines). Extraction into `src/screens/` + `src/components/` is the next structural milestone.
- **No test suite.** `circles.ts` and `follows.ts` are the natural place to start.
- **No error monitoring.** No Sentry, no Vercel Analytics on errors.
- **No offline mode.** PWA installs but requires network; no service worker caching.
- **No link previews.** Missing `og:image` + `twitter:card` meta tags in `index.html`.
- **OneDrive corrupting `.git/index`.** Workaround: delete `.git/index`, run `git reset`. Long-term: move repo off OneDrive.
- **`src/TRADR (1)/` stray folder** in `src/`. Contains `hero.png`, `react.svg`, `vite.svg` — not referenced by any code. Delete manually.

---

## 7. Fixes Shipped (in order)

1. React `ErrorBoundary` wrapping entire app — blank screen becomes a friendly fallback.
2. Supabase write errors surfaced as toasts via `onStorageError` callback.
3. `calcRR()` guarded against division by zero and capped at 100R.
4. Loading spinners on async ops (CSV import, create circle, join circle).
5. Password reset — full `resetPasswordForEmail` + `PASSWORD_RECOVERY` handler + new-password form.
6. Trade delete confirmation dialog.
7. Profile field validation before save.
8. CSV dedup via djb2 hash over 7 fields (immune to single-field edits).
9. `updatedAt` timestamp on every trade save.
10. Comment delete — author-only (checked by name match).
11. Reactions — per-user array with true toggle, legacy count migrated.
12. Insights — minimum 10 trades before signal fires; consistency threshold 20.
13. TypeScript interfaces — `Trade`, `Profile`, `Circle`, `CircleMember`, `TradeComment`, `ReactionMap`, `Insight`, `StrategyDef`.
14. Settings `← Overview` back button; circle kick (ban list, RLS-safe); custom profile alias; sharper minimal UI polish.
15. Circle kick leaderboard sync — kicked member removed from local leaderboard state immediately after ban write.

---

## 8. Roadmap

**Next (polish + correctness):**
- Migrate Supabase credentials to env vars.
- `og:image` + Twitter card meta tags so shared URLs preview.
- Onboarding flow for first-time users (currently lands on empty journal).
- Empty states across journal, friends, circles.
- Loading skeletons instead of blank flashes.

**v1.0 (things that justify a launch post):**
- Service worker + offline-first journal.
- Component extraction from `TRADR.tsx` into `src/screens/*` + `src/components/*`.
- Minimal test suite covering the per-row RLS pattern and data-layer modules.
- Sentry integration for production error visibility.
- Public read-only trader profile pages (shareable by code).

**v1.1+ (the moat):**
- Circle-level analytics (best strategy across the group, who's hot this week).
- Weekly digest emails per circle.
- Discord webhook — auto-post leaderboard to the circle's server.
- Trade-of-the-week voting.
- Prop-firm PDF export.

---

## 9. File Map

```
src/
  main.tsx              — entry, installs window.storage shim, mounts TradrAuth
  TradrAuth.tsx         — auth gate (sign-in / sign-up / reset / new-password)
  TRADR.tsx             — the app (~3600 lines)
  ErrorBoundary.tsx     — class component, catches uncaught React errors
  lib/
    supabase.ts         — Supabase client (hardcoded creds — known issue)
    storage.ts          — window.storage shim (user_kv + shared_kv + localStorage)
  data/
    circles.ts          — circle meta/member/entry + realtime subscribe
    follows.ts          — follow edges + legacy migration + realtime
public/
  manifest.webmanifest / icon.svg / apple-touch-icon.svg / favicon.svg / icons.svg
supabase-schema.sql     — table defs + RLS policies
BETA-SMOKE-TEST.md      — 5-tester smoke test protocol
GO-LIVE.md              — historical initial deployment checklist (reference only)
ROLLBACK-TO-WORKING.ps1 — OBSOLETE — targets commit 6b7df56, 4 good commits behind HEAD. Do not run.
```
