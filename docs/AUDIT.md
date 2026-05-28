# Kōda — Codebase Audit

**Date:** 2026-05-27  
**Auditor:** Claude Code (read-only pass)  
**Branch:** `main` (post-merge of `feat/koda-visual-pass-v2`)

---

## 1. Executive Summary — Top 5 Issues

| Rank | Issue | Rationale |
|---|---|---|
| 1 | **TRADR brand still in user-facing strings** | Exported file names, social share URLs, CSS class, and BetaGate SVG all ship `tradr`/`TRADRG` to users — breaks launch narrative. 16 occurrences. |
| 2 | **`src/Koda.tsx` owns ~50 state values, all prop-drilled** | `SettingsScreen` receives 23 props; all screen components are stateless shells. No context or state lib. Every change to shared state causes full-tree re-renders. |
| 3 | **10+ unmemoized derivations run on every render** | `weekTrades`, `stratStats`, `pairStats`, `sessionStats`, `_allStratMap` etc. are recomputed inline on every render. On trade lists of any size this is a noticeable perf hit. |
| 4 | **`any` is the dominant type in `charts.tsx` and data layer** | All chart component props are `any`; `fromRow(r: any)` in `trades.ts` and `profile.ts` means Supabase schema changes are invisible to the compiler. Silent breakage risk. |
| 5 | **5 env vars undocumented in `.env.example`** | `APP_URL`, `SUPABASE_ANON_KEY`, `VITE_APP_VERSION`, `STRIPE_PROMO_CODE_ID_FOUNDERS`, `STRIPE_PROMO_CODE_ID_BETA` — missing from example file. New contributors and fresh Vercel deployments will silently fail. |

---

## 2. Component Map

### 2.1 `src/Koda.tsx` (4,200 lines)

#### Top-level symbols

| Symbol | Type | Lines | Notes |
|---|---|---|---|
| `useIsDesktop(breakpoint)` | Hook | 75–93 | Resize listener; `breakpoint` defaults to 900 |
| `EditInline` | Component | 97–112 | Controlled inline text editor; tiny, self-contained — **extraction candidate** |
| `StrategyEditor` | Component | 118–220 | Strategy create/edit form; receives all state as props — **extraction candidate** |
| `getViewportTier()` | Helper | 226–228 | Pure function — **move to `src/lib/viewport.ts`** |
| `useViewport()` | Hook | 229–242 | 4-tier resize hook — **move to `src/hooks/useViewport.ts`** |
| `ProLock` | Component | 244–262 | Paywall lock overlay; pure display — **extraction candidate** |
| `Koda` (default export) | Component | 264–4049 | Main monolith (see §2.2) |
| `HomeSectionTabs` | Component | 4054–4072 | **DEAD CODE** — defined but never called; actual nav uses `SubNavDropdown` |
| `ConfluenceTracker` | Component | 4075–4199 | Checklist tracker; receives 11 props — **extraction candidate** |

#### `Koda` default export internals

**State (50 `useState` calls, lines 265–407):**

`trades` · `draftCount` · `view` · `viewHistory` · `darkMode` · `form` · `editId` · `filter` · `loading` · `isOnline` · `expandedId` · `confirmDelete` · `tradeToShare` · `sharingToCircle` · `profile` · `editingProfile` · `profileDraft` · `commentInputs` · `pnlMode` · `timeMode` · `viewProfile` · `showTour` · `feedbackOpen` · `feedbackText` · `feedbackSending` · `feedbackSent` · `toast` (`any`) · `toastsV2` · `celebration` · `homeSection` · `accessToken` · `activeStrategy` · `stratChecklists` (`any`) · `stratRules` (`any`) · `checked` (`any`) · `checklistTab` · `editingCheckItem` (`any`) · `editingRule` (`any`) · `newCheckText` · `newRuleText` · `addingCheck` · `addingRule` · `calDayTrades` (`any`) · `statsTab` · `perfPnlMode` · `savingTrade` · `customStrategies` (`any[]`) · `showStrategyEditor` · `editingStrategy` (`any`) · `strategyDraft` (`any`) · `showCsvImport` · `isImportingCsv` · `showUpgrade` · `mandatoryUpgrade` · `showCalc` · `showLiveModal` · `fontScale` · `stratThresholds` (`any`) · `deleteConfirm` · `deletingAccount`

**Effects:**

| Line | Dep Array | Purpose | Problem? |
|---|---|---|---|
| 299 | `[]` | online/offline event listeners | Clean |
| 345 | `[]` | Supabase session token + realtime subscription | Clean |
| 401 | `[showToast]` | Storage error callback | Clean |
| 414 | **none** | `loadAll()` behind `_loadedRef` | **Bug risk** — missing `[]`; ref guard is not a substitute |
| 420 | `[fontScale]` | Apply font scale to `<html>` | Clean |
| 429 | **none** | Stripe return URL handler, `_stripeHandledRef` | **Bug risk** — same issue |
| 447 | `[]` | `?join=` deep-link handler | Clean |
| 480 | `[loading, profile.uid]` | Draft count query | Clean |
| 857 | `[]` | Swipe gesture listener (non-passive) | Clean |

**Memos / Callbacks:**

| Line | Type | Purpose |
|---|---|---|
| 334 | `useCallback` | `showToastV2` |
| 339 | `useCallback` | `dismissToast` |
| 396 | `useCallback` | `showToast` |
| 463 | `useMemo` | `statsFingerprint` |
| 735 | `useMemo` | `circleStats` + `stratStats` |
| 1239 | `useMemo` | Win/loss/BE/total stats |
| 1275 | `useMemo` | `filteredTrades` |
| 1288 | `useMemo` | `insights` |

#### Other large files

| File | Lines | Notes |
|---|---|---|
| `src/TradingCircles.tsx` | 1,176 | Circles/social; receives hooks output as props. Reasonably scoped. |
| `src/shared.tsx` | 956 | ~25 shared UI primitives + helpers. Should be split into per-primitive files. |
| `src/charts.tsx` | 729 | 12 chart components; all props typed `any` — needs typing. |
| `src/DataSourcesScreen.tsx` | 648 | CSV import + broker sync. Self-contained. |
| `src/KodaAuth.tsx` | 616 | Auth wrapper + Koda mount. Contains `USERNAME_DOMAIN` TRADR relic. |
| `src/CsvImportPanel.tsx` | 624 | CSV parsing and column mapping. Pervasive `any`. |

### 2.2 Extraction candidates in `src/Koda.tsx`

These items are low-coupling and can be moved without touching the main component logic:

| Symbol | Target Path | Effort |
|---|---|---|
| `useIsDesktop` | `src/hooks/useViewport.ts` | S |
| `useViewport` + `getViewportTier` | `src/hooks/useViewport.ts` | S |
| `EditInline` | `src/components/EditInline.tsx` | S |
| `ProLock` | `src/components/ProLock.tsx` | S |
| `StrategyEditor` | `src/components/StrategyEditor.tsx` | M |
| `ConfluenceTracker` | `src/components/ConfluenceTracker.tsx` | M |
| `HomeSectionTabs` | **Delete** (dead code) | S |

### 2.3 Proposed target folder structure

```
src/
  components/
    EditInline.tsx
    StrategyEditor.tsx
    ConfluenceTracker.tsx
    ProLock.tsx
    shared/          ← split from shared.tsx
      AvatarCircle.tsx
      Badge.tsx
      Toast.tsx
      ...
  hooks/
    useViewport.ts   ← + getViewportTier
    useCircles.ts    (already exists)
    useFeed.ts       (already exists)
    useFollows.ts    (already exists)
    useTradovate.ts  (already exists)
  data/              (already exists)
  lib/               (already exists)
  screens/           ← rename from flat src/ screen files
    LogTradeScreen.tsx
    SettingsScreen.tsx
    ...
```

---

## 3. Findings

### Section 2 — Dead Code

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/Koda.tsx` | 4054–4072 | med | `HomeSectionTabs` defined but never called | Delete | S |
| `src/Koda.tsx` | 3587 | low | `"import_legacy_unused"` dead view block (explicitly preserved in comment) | Confirm and delete | S |
| `src/Koda.tsx` | 1250–1289 | med | 10+ unmemoized derivations recomputed every render (`weekTrades`, `stratStats`, `pairStats`, `sessionStats`, `_allStratMap`, etc.) | Wrap in `useMemo` | M |

### Section 3 — Supabase Usage

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/data/trades.ts` | 53 | high | `fromRow(r: any)` — Supabase row untyped | Generate typed DB types via `supabase gen types` | M |
| `src/data/profile.ts` | 30 | high | `fromRow(r: any)` — same issue | Same | M |
| `src/data/follows.ts` | 132, 165 | med | `"postgres_changes" as any` + `(data as any)?.user_id` to work around TS overload | Fix with proper channel type narrowing | S |
| `src/data/circles.ts` | 224, 226 | med | Same `"postgres_changes" as any` pattern | Same | S |
| `src/hooks/useCircles.ts` | 128, 457 | med | `(profileRef.current as any).alias` + `(p as any).alias` | Add `alias` to `Profile` type | S |
| `src/lib/storage.ts` | 62–84 | med | `remoteGet()` cannot distinguish network error from no-row; double JSON serialization (stringify then re-parse at call site) | Return `{ data, notFound }` discriminated union | M |
| `src/Koda.tsx` | 480 | low | Draft count query runs on every `[loading, profile.uid]` change — runs during initial load | Add `if (!profile.uid) return` guard | S |

**TRADR branding in Supabase / API layer:**

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `api/lib/cryptoUtils.ts` | 23, 26 | med | `process.env.TRADR_ENCRYPTION_KEY` — old brand in env var name | Rename to `KODA_ENCRYPTION_KEY` (requires Vercel env update + `.env.example` update) | S |
| `.env.example` | 12 | med | `TRADR_ENCRYPTION_KEY` | Update after renaming | S |

### Section 4 — Type Safety

#### `src/Koda.tsx` — `any` state

| Line | Pattern | Recommended Type |
|---|---|---|
| 329 | `useState<any>` — toast | `Toast \| null` (define `Toast` interface) |
| 353 | `useState<any>` — stratChecklists | `Record<string, CheckItem[]>` |
| 354 | `useState<any>` — stratRules | `Record<string, string[]>` |
| 355 | `useState<any>` — checked | `Record<string, boolean>` |
| 357 | `useState<any>` — editingCheckItem | `CheckItem \| null` |
| 358 | `useState<any>` — editingRule | `string \| null` |
| 363 | `useState<any>` — calDayTrades | `Trade[] \| null` |
| 370 | `useState<any[]>` — customStrategies | `StrategyDef[]` |
| 374–375 | `useState<any>` — editingStrategy, strategyDraft | `StrategyDef \| null`, `Partial<StrategyDef>` |
| 407 | `useState<any>` — stratThresholds | `Record<string, number>` |

#### `src/Koda.tsx` — unnecessary `as any` casts

| Line | Pattern | Fix |
|---|---|---|
| 1602–1626 | `(C as any).live`, `(C as any).orb1`, etc. | These keys exist on `typeof DARK` — remove casts |
| 2156–2187 | Multiple `as any` in JSX prop spreading | Type the spread props explicitly |

#### `src/charts.tsx`

| Severity | Finding | Action | Effort |
|---|---|---|---|
| high | All 12 exported component props typed `any` (L44, 54, 75, 104, 165, 201, 231, 264, 298, 359, 399) | Define prop interfaces for each chart | L |

#### Other files

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/shared.tsx` | 47 | med | `outcomeColor(outcome: string, C: any)` | Type `C` as `Theme` | S |
| `src/CsvImportPanel.tsx` | 21, 33, 71, 220 | med | Pervasive `any` in CSV parsing + props | Type CSV row shape | M |
| `src/DataSourcesScreen.tsx` | 102–107 | med | `supabase: any`, `existingTrades: any[]` | Import `SupabaseClient` type | S |
| `src/hooks/useFeed.ts` | 186 | med | `(p as any[]).map((item: any)` | Type feed item shape | S |
| `src/hooks/useCircles.ts` | 461 | low | `parseFloat(s.winRate as any)` | Ensure `winRate` is typed as `string \| number` | S |

### Section 5 — State and Effects

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/Koda.tsx` | 414 | high | `useEffect` with no dep array — `loadAll()` guarded by ref only | Add `[]` dep array | S |
| `src/Koda.tsx` | 429 | high | `useEffect` with no dep array — Stripe URL handler guarded by ref only | Add `[]` dep array | S |
| `src/Koda.tsx` | 1250–1289 | med | `weekTrades`, `stratStats`, `pairStats`, `sessionStats`, `_allStratMap` computed inline every render | Wrap in `useMemo` with `[trades]` dep | M |
| `src/Koda.tsx` | 265–407 | med | 50 `useState` — no context or state lib; `SettingsScreen` receives 23 props | Extract logical state slices into custom hooks or context | L |

### Section 6 — Mobile and Design

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/shared.tsx` | 28 | med | `MONO = "'Geist Mono', 'IBM Plex Mono', ..."` — Geist Mono is primary, IBM Plex Mono is fallback. If Geist Mono loads (it does via CDN in prod), IBM Plex Mono never renders. | Decide: is Geist Mono intentional as primary? Document. | S |
| `src/BetaGate.tsx` | 38–39 | low | Defines its own `MONO`/`BODY` constants instead of importing from `shared.tsx` | Import from `shared.tsx` | S |
| `src/BetaGate.tsx` | 47 | low | SVG `<text>` inside `KodaMarkFilled` uses `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif` — bypasses both font stacks | Remove or align with `BODY` | S |
| `src/Koda.tsx` | 2505, 2507 | low | `C.green ?? "#22c55e"` — hardcoded Tailwind green fallback (unreachable since `C.green` exists, but drift risk) | Remove the fallback | S |
| `api/lib/email.ts` | 51–52 | low | Email templates use hardcoded hex colors not imported from theme | Extract to constants or note as intentional | S |
| `src/theme.ts` | 27 | info | Accent is `oklch(0.74 0.16 250)` — confirm this matches the design spec `#89CFF0` | Verify with designer | S |

**Touch targets:** Compliant — `minHeight: "44px"` consistently applied. No violations found.  
**Layout breakpoints:** 4-tier viewport system used correctly. 480px scope limited to modals/sheets — correct per design intent.  
**CSS:** `src/index.css` is 58 lines of keyframes and resets. No orphaned rules.

### Section 7 — Config and Env

**Missing from `.env.example`:**

| Var | Used In | Severity | Action | Effort |
|---|---|---|---|---|
| `VITE_APP_VERSION` | `src/lib/sentry.ts:25` | med | Add to `.env.example` | S |
| `SUPABASE_ANON_KEY` | `api/push/subscribe.ts:17` | high | Add to `.env.example` (distinct from `VITE_SUPABASE_ANON_KEY`) | S |
| `STRIPE_PROMO_CODE_ID_FOUNDERS` | `api/stripe-checkout.ts:37` | med | Add to `.env.example` | S |
| `STRIPE_PROMO_CODE_ID_BETA` | `api/stripe-checkout.ts:38` | med | Add to `.env.example` | S |
| `APP_URL` | `api/reset-password.ts:25`, `api/stripe-checkout.ts:31`, `api/stripe-portal.ts:26` | high | Add to `.env.example`; remove hardcoded `"https://tradrjournal.xyz"` default | S |

**Hardcoded URLs that should reference `APP_URL`:**

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `api/broker/[action].ts` | 22–23 | low | `ALLOWED_ORIGINS` hardcodes `tradrjournal.xyz` | Derive from `APP_URL` or env | S |
| `api/feedback.ts` | 22–23 | low | Same pattern | Same | S |
| `api/cron/complete-challenges.ts` | 33 | low | Same | Same | S |
| `api/cron/sync.ts` | 34–35 | low | Same | Same | S |
| `api/reset-password.ts` | 30–31 | low | Same | Same | S |
| `api/lib/email.ts` | 5 | low | `FROM = "Kōda <noreply@tradrjournal.xyz>"` hardcoded | Move to env or `APP_URL`-derived | S |

**Path aliases:** No `@/` aliases configured in `vite.config.ts`. All imports are relative. Not a blocker; consistency is fine either way — but worth adding before the codebase grows further.

### Section 8 — Pre-Launch Blockers

#### TRADR brand residue (shipping to users) — HIGH PRIORITY

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/Koda.tsx` | 1155 | high | `a.download = \`tradr-export-...\`` — exported JSON filename | Rename to `koda-export-...` | S |
| `src/Koda.tsx` | 1174 | high | `a.download = \`tradr-trades-...\`` — exported CSV filename | Rename to `koda-trades-...` | S |
| `src/Koda.tsx` | 1461–1486 | med | `className=".tradr-app"` on main wrapper div | Rename to `koda-app` | S |
| `src/Koda.tsx` | 3133 | high | X/Twitter share text: `@tradrjournal https://tradrjournal.xyz` | Update to Kōda handle + domain | S |
| `src/Koda.tsx` | 42 | low | `LEGACY_GLOBAL_CODE = "TRADRG-HB1U"` | Keep for backwards compat but document clearly | S |
| `src/Koda.tsx` | 446 | low | Comment example URL uses `tradr-` join code format | Update comment | S |
| `src/KodaAuth.tsx` | 44 | med | `USERNAME_DOMAIN = "users.tradr.app"` | Update to `users.koda.app` or current domain | S |
| `src/BetaGate.tsx` | 48 | high | SVG logo renders old `"tr"` text mark | Update to Kōda mark | S |
| `src/FriendsFeed.tsx` | 424 | high | Share tweet includes `@tradrjournal` | Update to Kōda handle | S |
| `src/SettingsScreen.tsx` | 311 | med | Profile URL: `https://tradrjournal.xyz/@${handle}` | Update domain | S |
| `src/TradingCircles.tsx` | 365, 1078 | med | Circle join URLs: `https://tradrjournal.xyz/?join=...` | Update domain | S |
| `api/lib/cryptoUtils.ts` | 23, 26 | med | `process.env.TRADR_ENCRYPTION_KEY` | Rename env var (coordinate with Vercel) | S |
| `.env.example` | 12 | med | `TRADR_ENCRYPTION_KEY` | Update after renaming | S |

#### TODO / FIXME / HACK

| File | Line | Severity | Finding | Action | Effort |
|---|---|---|---|---|---|
| `src/Koda.tsx` | 916 | low | `// TODO: streak celebration — fire when streakCount hits 3/7/14/30/100` | Schedule or delete | S |

No other `FIXME`, `HACK`, or `XXX` markers found.

#### BetaGate

- Gate bypassed if `VITE_BETA_PASSWORD` is unset (resolves immediately). Acceptable for internal deploys.
- `localStorage` key: `koda_beta_unlocked` — correctly branded.
- SVG logo inside gate still renders old `"tr"` mark — see branding table above.

#### Console output in production

- `src/lib/log.ts` — intentional structured logging, not bare debug prints. Acceptable.
- `src/lib/storage.ts:35` — bare `console.error` not routed through `log`. Low priority.
- `api/stripe-webhook.ts:115` — `console.log` for webhook plan assignment. Acceptable; appears in Vercel function logs only.

---

## 4. Suggested Sequencing

### Day 1 — Foundation and launch blockers (no risky refactors)

1. Add 5 missing `.env.example` entries (`APP_URL`, `SUPABASE_ANON_KEY`, `VITE_APP_VERSION`, 2 Stripe promo codes)
2. Fix 2 bare `useEffect` calls missing `[]` dep arrays (L414, L429)
3. Rename all user-visible TRADR strings: export filenames, share text, BetaGate SVG, `@tradrjournal` handle references
4. Delete `HomeSectionTabs` dead component (L4054–4072)
5. Fix `useEffect` dep arrays — 30-min task, high safety impact

### Day 2 — Type safety (data layer first)

1. Run `supabase gen types typescript > src/types/db.ts` and type `fromRow()` in `trades.ts` and `profile.ts`
2. Type the 5 most-used `useState<any>` values: `checked`, `calDayTrades`, `customStrategies`, `stratThresholds`, `toast`
3. Remove unnecessary `(C as any).live` / `(C as any).orb1` casts — these keys already exist on `Theme`
4. Type `charts.tsx` component props (start with the 3 most-used: `PnLChart`, `TradeStatCards`, `CalendarView`)
5. Add `alias` to `Profile` type, eliminate `(p as any).alias` casts

### Day 3 — Performance and extraction

1. Wrap 10 inline derivations in `useMemo`: `weekTrades`, `stratStats`, `pairStats`, `sessionStats`, `_allStratMap`
2. Extract `useViewport` / `getViewportTier` to `src/hooks/useViewport.ts`
3. Extract `EditInline` and `ProLock` to `src/components/`
4. Rename `TRADR_ENCRYPTION_KEY` → `KODA_ENCRYPTION_KEY` (requires Vercel dashboard update + redeploy)

### Later (post-launch, L effort)

- Introduce a state management solution (Zustand recommended) to eliminate 23-prop drilling into `SettingsScreen`
- Extract `StrategyEditor` and `ConfluenceTracker` from `Koda.tsx`
- Type all `charts.tsx` components fully
- Split `src/shared.tsx` into per-primitive files

---

## 5. Questions for Dylon

1. **Font stack:** `MONO` uses `'Geist Mono'` as primary with `'IBM Plex Mono'` as fallback. In production, Geist loads via CDN, so IBM Plex Mono never renders. Is Geist Mono the intended primary font, or should IBM Plex Mono be primary? The design spec says IBM Plex Mono — is this intentional drift?

2. **`api/lib/email.ts:5`** — `FROM = "Kōda <noreply@tradrjournal.xyz>"`. Is `tradrjournal.xyz` the permanent sender domain post-rebrand, or will this move to `kodajournal.xyz` / another domain?

3. **`USERNAME_DOMAIN = "users.tradr.app"` (`src/KodaAuth.tsx:44`)** — This looks like a magic auth suffix. Where is this domain used (Supabase custom SMTP config? Auth redirect URL?)? Is `tradr.app` still the correct domain, or does this need to change?

4. **`LEGACY_GLOBAL_CODE = "TRADRG-HB1U"`** — Is there an existing user base on this code that would be broken if it were removed? Or can it be cleaned up safely?

5. **Accent colour:** Theme `src/theme.ts:27` defines accent as `oklch(0.74 0.16 250)` which renders as a blue-violet. The design spec says `#89CFF0` (baby blue). Are these the same colour (different colour space encoding of the same hex), or has the accent drifted from spec?

6. **`api/cron/sync.ts`** — The file comment says "Called by Vercel Cron every 5 minutes (see vercel.json)" but there is no cron entry for it in `vercel.json`. Is the Tradovate auto-sync intentionally disabled, or was this cron accidentally removed?

7. **`STRIPE_PROMO_CODE_ID_FOUNDERS` and `STRIPE_PROMO_CODE_ID_BETA`** — Are these active promo codes in Stripe's dashboard? Should they be documented publicly in `.env.example` or are they intentionally undocumented?
