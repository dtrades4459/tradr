# TRADR · Master Context Document ("Tradr Brain")

> Single source of truth for what TRADR is, how it's built, what's broken, and where it's going.
> Paste this into a new Claude conversation to get fully up to speed in one shot.
>
> Last updated: 2026-04-25

---

## 1. What TRADR Is

TRADR is a **mobile-first trading journal + social layer** delivered as an installable PWA.
It is currently in **closed beta**, deployed on Vercel.

The product is built around three loops:

**The Journal Loop.** A trader logs every trade (entry, exit, size, R:R, strategy, screenshot, notes). Stats roll up automatically — win rate, avg R, expectancy, streaks, equity curve, per-strategy breakdown. The journal is the foundation; everything else is layered on top.

**The Social Loop.** Traders get a stable shareable code (FNV-1a hash of their auth UID, e.g. `A7F3B2`). They can follow other traders by code, see a feed of mutual-friend trades, and react. One-way follow graph; mutual follows = friends.

**The Circles Loop (the USP).** A circle is a small private group (up to ~50 members) with a shared leaderboard. Each member publishes their own stats row (per-row Supabase RLS); the leaderboard is computed client-side by reading every member's published entry. Use cases: prop-firm cohorts, Discord trading groups, accountability pods.

The product thesis: existing journals (TraderSync, Edgewonk) are solo tools; existing social (Twitter, Discord) has no structured stats. TRADR sits in the middle — a stats-first journal where the unit of social proof is your *actual published numbers*, not screenshots and bravado.

**Target user:** retail/prop futures + crypto traders, age 22-40, already in a Discord or prop-firm cohort, frustrated that their group's "performance" is tracked in a Google Sheet someone forgets to update.

---

## 2. Current Features

**Authentication.** Supabase email/password via `TradrAuth.tsx`. Session persisted; sign-out wipes the local cache. No OAuth yet.

**Profile.** Name, handle, avatar (emoji or uploaded image), bio, strategy tags. Auto-generated 6-char trader code derived deterministically from the auth UID via FNV-1a, so the same account always gets the same code across devices.

**Trade journal.** Add/edit/delete trades with: instrument, direction (long/short), entry, exit, size, R:R, P&L (auto or manual), strategy tag, screenshot upload, free-form notes. Trades render as a chronological feed with filter chips (strategy, win/loss, date range).

**Stats dashboard.** Win rate, total P&L, avg R, expectancy, current streak, best/worst trade, per-strategy breakdown table, equity curve sketch. Updates live as trades are added.

**Friends / follow graph.** Follow by trader code. One-way edges stored as two rows in `shared_kv` (`tradr_follow_<me>_<them>` + `tradr_follower_<them>_<me>`), both owned by the follower so RLS never fights you. Mutual follows surface as "friends." Realtime subscription via Supabase `postgres_changes` on `shared_kv`.

**Circles.** Create a circle (auto-generated code), invite by code, join/leave. Each member's leaderboard entry is its own row (`tradr_circle_entry_<CIRCLE>_<MEMBER>`) owned by that member — this is the per-row RLS pattern that prevents the "Jason can't update Dylon's circle row" bug. Leaderboard sorts by total P&L by default.

**Realtime sync.** Supabase Realtime listeners on `shared_kv` for both follows and circles. Any change pushed by another device or another user triggers a local refresh.

**PWA.** Installable on iOS/Android home screen, mobile-first viewport, no horizontal scroll, touch-optimized hit targets. No service worker / offline mode yet (see Known Issues).

---

## 3. Tech Stack

**Frontend.** React 19, Vite 8, TypeScript ~5.9. Tailwind for styling. Single monolithic component (`src/TRADR.tsx`, ~3271 lines) plus thin wrappers — extraction into smaller components is on the roadmap but not blocking beta.

**Data layer.** All Supabase reads/writes funnel through `window.storage`, a shim installed in `src/lib/storage.ts` that wraps `user_kv` (per-user private) and `shared_kv` (cross-user with RLS). Local `localStorage` cache layered underneath for instant reads. Two domain modules sit on top of the shim:
- `src/data/circles.ts` — circle meta, member rows, leaderboard entries, realtime subscribe.
- `src/data/follows.ts` — per-row follow edges, legacy migration, realtime subscribe.

Both modules enforce the per-row ownership pattern by API surface, so callers can't accidentally re-introduce the RLS bug.

**Backend.** Supabase (Postgres + Auth + Realtime + Storage). Two key tables:
- `user_kv` — `(user_id, key, value)`, RLS: `auth.uid() = user_id`. Private per-user blob store.
- `shared_kv` — `(owner_id, key, value)`, RLS: `auth.uid() = owner_id` for write, public read. Cross-user data lives here, but every row is owned by exactly one user.

Schema lives in `supabase-schema.sql`.

**Deployment.** Vercel, auto-deploy from `main`. Env vars currently hardcoded in `src/lib/supabase.ts` (rolled back from the env-var migration during the crash incident — this is technical debt to revisit).

**Local dev.** OneDrive folder at `C:\Users\Dylon\OneDrive\Desktop\tradr`. OneDrive virtualization periodically corrupts `.git/index`; recovery scripts live in the repo root (`SHIP-BETA-POLISH.ps1`, `ROLLBACK-TO-WORKING.ps1`).

---

## 4. Known Issues

**Production crash on existing accounts (CRITICAL, partially mitigated by rollback to `6b7df56`).** Symptom: blank black/white screen on existing accounts after login. Suspected cause: `getMyCode` was calling `setState` during render, and there was no `ErrorBoundary` to catch the cascade. Mitigation in progress: roll deploy back to `6b7df56` (last known-good commit), then carefully re-introduce the polish work *with* an `ErrorBoundary` wrapped around `<TradrAuth />` in `src/main.tsx`. The ErrorBoundary code was written and then reverted by user pending re-test.

**No link previews on shared URLs.** Vercel deploy URL pasted into iMessage / Discord / Twitter shows no thumbnail. Cause: missing `og:image` and `twitter:card` meta tags in `index.html`. A 1200×630 SVG was created at `public/og-image.svg` but the meta-tag wiring in `index.html` was reverted alongside the rollback. Re-apply when polish is re-introduced.

**No service worker / no offline mode.** PWA installs but has zero offline capability. Acceptable for beta; flag for v1.0.

**Monolithic `TRADR.tsx`.** ~3271 lines in one file. Hard to navigate, slow to type-check incrementally. Data-layer extraction (circles + follows modules) was the first cut — UI-component extraction is the next.

**OneDrive corrupting `.git/index`.** Periodic `index uses *ޏ extension` errors. Workaround documented in `ROLLBACK-TO-WORKING.ps1` (delete `.git/index`, `git reset` to rebuild). Long-term fix: move repo out of OneDrive, or pause OneDrive sync during dev sessions.

**Hardcoded Supabase credentials.** `src/lib/supabase.ts` has the URL + anon key inline. `.env.example` exists but the migration to `import.meta.env.VITE_SUPABASE_*` was rolled back. Low security risk (anon key is RLS-bounded), but it's still poor hygiene.

**No test suite.** Zero unit tests, zero integration tests. The data-layer extraction makes the per-row RLS pattern testable in isolation — this is the natural place to start.

**No error monitoring.** No Sentry, no Vercel Analytics on errors. Crashes are only visible when a user reports them.

---

## 5. Roadmap

**Right now (this week): stabilize.**
1. Confirm rollback to `6b7df56` is live and crash is gone.
2. Re-introduce the `ErrorBoundary` in `src/main.tsx` first, *before* anything else, so the next regression has a safety net.
3. Re-apply the og:image + Twitter card meta tags so shared URLs preview properly.
4. Re-apply the env-var migration for Supabase credentials.

**Beta polish (next 2 weeks): make it feel finished.**
- Re-introduce `getMyCode` refactor (pure `computeMyCode` + `useEffect` for the persist write) — but this time behind the ErrorBoundary.
- Onboarding flow for first-time users (currently lands them on an empty journal with no guidance).
- Empty states across the app (journal, friends, circles).
- Loading skeletons instead of blank flashes.
- Avatar upload sizing/cropping.

**v1.0 (next 4-6 weeks): the things that justify a launch post.**
- Service worker + offline-first journal (you can log a trade on the subway, syncs when you're back online).
- Component extraction from `TRADR.tsx` into `src/screens/*` and `src/components/*`.
- A minimal test suite covering the per-row RLS pattern and the data-layer modules.
- Sentry integration for production error visibility.
- Public profile pages (shareable read-only view of any trader's stats by code).

**v1.1+ (the moat): make Circles indispensable.**
- Circle-level analytics (best strategy across the group, who's hot this week).
- Weekly digest emails per circle.
- Circle chat (or, more likely, a Discord webhook integration so the circle's existing Discord gets the leaderboard auto-posted).
- Trade-of-the-week voting.
- Prop-firm-friendly export (PDF report a trader can hand to their funded-account provider).

**Long term (the bet):** become the default "trading group OS" — the place every Discord trading server, every prop-firm cohort, every accountability pod ends up because the alternative is a Google Sheet someone forgets to update.

---

## Appendix: File Map

```
src/
  main.tsx              — entry point, installs window.storage shim, mounts TradrAuth
  TradrAuth.tsx         — Supabase auth gate, hands off to TRADR on success
  TRADR.tsx             — the entire app (3271 lines, extraction in progress)
  lib/
    supabase.ts         — Supabase client (currently hardcoded creds)
    storage.ts          — window.storage shim wrapping user_kv + shared_kv + cache
  data/
    circles.ts          — circle meta/member/entry rows + realtime subscribe
    follows.ts          — per-row follow edges + legacy migration + realtime
public/
  og-image.svg          — link-preview thumbnail (1200×630, not wired up yet)
supabase-schema.sql     — user_kv + shared_kv table defs + RLS policies
ROLLBACK-TO-WORKING.ps1 — emergency rollback to 6b7df56
SHIP-BETA-POLISH.ps1    — git-index repair + commit + push helper
.env.example            — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (not yet used)
```

## Appendix: The RLS Pattern (memorize this)

Every row in `shared_kv` has exactly one owner, and only that owner can write to it. This means:

- **Following someone:** I write `tradr_follow_<me>_<them>` AND `tradr_follower_<them>_<me>` — both rows owned by *me*. The followed user does nothing.
- **Joining a circle:** I write `tradr_circle_member_<CIRCLE>_<me>` — owned by me. The circle creator's row is untouched.
- **Publishing my leaderboard stats:** I write `tradr_circle_entry_<CIRCLE>_<me>` — owned by me. Other members' entries are untouched.
- **Reading is always cheap:** `listByPrefix("tradr_circle_member_<CIRCLE>_")` enumerates every member by reading every row in the prefix.

If you ever find yourself needing to UPDATE a row owned by someone else, **stop** — you're about to re-introduce the bug that broke Jason's circle updates. Add a new owned-by-me row instead.
