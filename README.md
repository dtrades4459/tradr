# TRADR

Mobile-first trading journal + social layer, delivered as an installable PWA.

**Stack:** React 19 · TypeScript · Vite · Supabase · Vercel

---

## Dev

```bash
npm install
npm run dev        # localhost:5173
npx tsc --noEmit   # type-check (vite build has EPERM on Windows/OneDrive)
```

> **Note:** `vite build` fails in the Linux sandbox (EPERM on the OneDrive mount). Run it in a Windows terminal or let Vercel handle it on push.

---

## Project structure

```
src/
  main.tsx            — entry point, installs window.storage shim, mounts TradrAuth
  TradrAuth.tsx       — Supabase auth gate (sign-in / sign-up / password reset)
  TRADR.tsx           — the app (~3600 lines, component extraction on roadmap)
  ErrorBoundary.tsx   — class component fallback UI for uncaught runtime errors
  lib/
    supabase.ts       — Supabase client (credentials hardcoded — see Known Issues)
    storage.ts        — window.storage shim: user_kv + shared_kv + localStorage cache
  data/
    circles.ts        — circle meta / member rows / leaderboard entries + realtime
    follows.ts        — per-row follow edges + legacy migration + realtime
public/
  manifest.webmanifest
  icon.svg / apple-touch-icon.svg / favicon.svg
supabase-schema.sql   — user_kv + shared_kv table defs + RLS policies
TRADR-BRAIN.md        — master context doc (architecture, known issues, roadmap)
```

---

## The RLS pattern (important)

Every row in `shared_kv` is owned by exactly one user (`owner_id = auth.uid()`). Writes only succeed for the row's owner.

Rules that flow from this:
- **Following:** writer creates both `tradr_follow_<me>_<them>` and `tradr_follower_<them>_<me>`, both owned by the follower.
- **Joining a circle:** joiner creates `tradr_circle_member_<CIRCLE>_<me>`, owned by themselves.
- **Publishing leaderboard stats:** member creates `tradr_circle_entry_<CIRCLE>_<me>`, owned by themselves.
- **Kicking a member:** circle owner writes `tradr_circle_bans_<CIRCLE>` (a row they own); members are filtered on read — never try to delete another user's row.

If you need to modify a row owned by someone else, stop — add a new row you own instead.

---

## Known issues

- **Hardcoded Supabase credentials** in `src/lib/supabase.ts`. Low security risk (anon key is RLS-bounded), but should move to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars.
- **Monolithic TRADR.tsx** (~3600 lines). Extraction into `src/screens/` + `src/components/` is on the roadmap.
- **No test suite.** The data-layer modules (`circles.ts`, `follows.ts`) are the natural place to start.
- **No error monitoring.** No Sentry, no Vercel Analytics on errors.
- **No offline mode.** PWA installs but requires network.
- **OneDrive corrupting `.git/index`.** Delete `.git/index` and run `git reset` to rebuild if you hit `index uses *ޏ extension` errors.
