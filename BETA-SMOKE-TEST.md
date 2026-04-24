# TRADR · Beta Smoke Test (5 testers)

This is the social-first smoke test. **Run in order — each step depends on the
last one passing.** Anyone can drive; everyone observes.

> **Cast**: Tester A (Dylon), B, C, D, E.
> **Setup**: Each tester signs in on their own device, sets their name in
> Profile, and refreshes once.

---

## Phase 0 — Identity (60s)

| # | Step | Pass condition |
|---|------|----------------|
| 0.1 | Each tester opens **Profile** and notes their **CODE** (top of profile, e.g. `DYLON-abc123…` or `T-XXXXXXXX` for new users) | Code is short, stable, and survives a page refresh |
| 0.2 | Tester A renames themselves from "Dylon" to "Dyl" and refreshes | **Code does not change.** This is the rename-bug fix. |

If 0.2 fails (code changes on rename), STOP. The new `getMyCode()` lock didn't
trigger; check `profile.code` is being persisted in user_kv.

---

## Phase 1 — Circle creation + cross-user visibility (3 min)

| # | Step | Pass condition |
|---|------|----------------|
| 1.1 | Tester A creates circle "BETA-1" with strategy "ICT" | Circle appears in A's `MY CIRCLES` list, A is owner |
| 1.2 | A reads the circle code aloud (or pastes in chat) | All testers can see/copy it |
| 1.3 | B, C, D, E join via Circles → ⤵ Join | Join toast appears for each. **Within 5s** the circle's member count on A's screen ticks to 5 (Realtime). If it takes >30s, Realtime is offline and we're falling back to the 2-min poll — investigate. |
| 1.4 | Each tester opens BETA-1 → leaderboard | All 5 see the same 5 members in the leaderboard, in P&L order |

If 1.3 takes longer than 5s consistently, run the SQL block below in Supabase
(makes Realtime explicit):

```sql
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='shared_kv'
  ) then
    execute 'alter publication supabase_realtime add table public.shared_kv';
  end if;
end $$;
```

---

## Phase 2 — Leaderboard publish (2 min)

| # | Step | Pass condition |
|---|------|----------------|
| 2.1 | Each tester logs ONE trade (any pair, any outcome, any P&L) | Trade appears in their own Logs |
| 2.2 | Each tester opens BETA-1 → tap **PUBLISH MY STATS** | Toast: "Stats published" |
| 2.3 | All testers re-open BETA-1 leaderboard | All 5 entries show non-zero stats. **Within 5s of any publish, every other client sees the new P&L.** |
| 2.4 | Tester C taps another member's row in leaderboard | Row expands, showing member CODE, COPY button, FOLLOW button |

---

## Phase 3 — Follow graph (2 min)

| # | Step | Pass condition |
|---|------|----------------|
| 3.1 | Tester A taps **FOLLOW** on B in the leaderboard | Button changes to "Following" |
| 3.2 | B opens Profile (or wherever followers are shown) | **Within 5s**, B sees A in their followers list |
| 3.3 | B follows A back | Both A and B now appear as **mutual / friends** in each other's friend list |
| 3.4 | C follows B | B's follower count goes from 1 → 2 within 5s. **This is the per-row RLS test** — the original bug was that the second follower's UPDATE was rejected. |
| 3.5 | A unfollows B | B's followers list drops A within 5s |

If 3.4 fails: open browser console, look for `[TRADR][storage.set][shared] tradr_follower_…` errors. If you see "row-level security policy" errors, the per-row pattern was bypassed somewhere — likely a stale `tradr_followers_<…>` write. Open `src/data/follows.ts` and confirm `followUser` is being called (not the old inline path).

---

## Phase 4 — Friends feed (2 min)

| # | Step | Pass condition |
|---|------|----------------|
| 4.1 | A and B (now mutual follows) each tap **PUBLISH** on their friends feed | Toast: "Published" |
| 4.2 | A opens friends feed → ↻ Refresh | A sees B's recently published trades |
| 4.3 | A taps a reaction emoji on one of B's trades | Reaction count increments |

---

## Phase 5 — Currency + persistence (60s)

| # | Step | Pass condition |
|---|------|----------------|
| 5.1 | Each tester opens Profile → set Currency to their preference (USD, EUR, ZAR, etc.) | Saves without error |
| 5.2 | Refresh the app | Currency persists; all P&L on Home, Logs, Calendar, Leaderboard re-renders with the chosen symbol |
| 5.3 | Tester A on Circles BETA-1 sees **their own** P&L in their currency, but **other members** in the leaderboard show in their published number (no FX conversion is done — this is by design for v1) | Documented behavior matches |

---

## Phase 6 — Resilience (offline-first sanity)

| # | Step | Pass condition |
|---|------|----------------|
| 6.1 | Tester A goes offline (DevTools → Network → Offline) | App keeps rendering from localStorage cache |
| 6.2 | A logs a trade while offline | Trade appears locally |
| 6.3 | A goes back online and refreshes | Trade syncs to Supabase, visible from another device |

---

## Reporting back

For each phase, paste the result in the tester chat as:

```
PHASE 1: ✅
PHASE 2: ✅ (2.4 a bit slow for me, ~8s)
PHASE 3: ❌ — step 3.4: B's follower count stayed at 1 after C followed
```

Include device (iOS/Android/Desktop) + browser. Console logs are gold —
TRADR now logs every storage failure with `[TRADR]…` prefix; copy any of
those into the report.
