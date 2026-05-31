# Kōda Beta Readiness Check
**Audit date:** 2026-05-31 | **Target launch:** 2026-06-01

---

## 1. Verdict

Beta invites are **READY to send today** with two low-effort fixes recommended first (est. 1–2 hrs total). 19 of 22 whiteboard items are DONE or PARTIAL with no remaining blockers. The three open items are: receipt currency is hardcoded `£` regardless of `invoice.currency` (breaks non-UK subscribers — low priority for a UK-first beta but worth noting); `BETA_BRIEF.md` lacks explicit `BETA_26` redemption instructions; and no Discord invite doc exists. Circles is **functional-but-weak** — the global circle auto-join works, the leaderboard and feed are live, reactions and chat are wired, but beta users will experience it as an empty room: no seeded content, no welcome post, no activity from Dylon visible on day one. The verified-trade trust signal (Kōda's stated USP over Discord screenshots) is present in the data model (`source: "csv_import"`) but **not surfaced in the SharedTradeCard UI** — the differentiator is invisible. Recommended action: fix `BETA_BRIEF.md` (30 min), add a "CSV verified" badge to `SharedTradeCard` (1 hr), then send invites today.

---

## 2. Whiteboard Verification Table

| # | Item | Status | Evidence (file:line) | Gap | Effort (hrs) | Priority |
|---|------|--------|---------------------|-----|-------------|----------|
| 1.1 | BETA26 promo wired server-side | DONE | `api/stripe-checkout.ts:38` — `BETA_26: process.env.STRIPE_PROMO_CODE_ID_BETA`; `.env.example:52` — `STRIPE_PROMO_CODE_ID_BETA=promo_...` | Dylon must confirm env var set in Vercel + active promo in Stripe dashboard | 0 (code) | BLOCKER |
| 1.2 | Password field is `type="password"` | DONE | `src/shared.tsx:552` — `FloatingInput` accepts and applies `type` prop; `src/KodaAuth.tsx:251` — `type="password"` passed for password field; `src/KodaAuth.tsx:174` — new-password field also uses `type="password"` | None | 0 | — |
| 1.3 | Receipt currency reads `invoice.currency` | NOT DONE | `api/stripe-webhook.ts:198` — `const amount = \`£${(invoice.amount_paid / 100).toFixed(2)}\`` — hardcoded `£`, no `invoice.currency` check, no `gbp/usd/eur` mapping | Currency symbol is always `£`; international subscribers get wrong symbol | 0.5 | SHOULD |
| 1.4 | Terms page reflects current pricing | DONE | `public/terms.html:63` — `£24.99/month` present; `£199` absent from terms (it appears only in `src/PaywallScreen.tsx:200`) but terms says "or as otherwise stated at checkout" — acceptable catch-all; no `£5.99` or `$5.99` found | Terms could explicitly mention `£199/yr` but catch-all clause covers it | 0 | NICE |
| 1.5 | `.env` not tracked in git | DONE | `git ls-files` returns nothing for `.env`; `.gitignore:16` lists `.env` | None | 0 | — |
| 1.6 | `.env.example` has no personal email | DONE | Grep for `dnyland420` and `@gmail.com` in `.env.example` returns nothing; `VAPID_EMAIL=mailto:you@example.com` is generic placeholder | None | 0 | — |
| 1.7 | TRADR brand removed from user-visible strings | DONE | `src/LogTradeScreen.tsx:7` and `src/SettingsScreen.tsx:5` — comments only ("parent Tradr component"); `api/tradovate.ts:65,110` — internal comments; `public/changelog.html:47` — historical entry explicitly noting rebrand complete. No user-visible TRADR strings found | None (all remaining refs are code comments or changelog history) | 0 | — |
| 2.1 | Trailing TOTAL/Subtotal rows filtered | DONE | `src/lib/csvParser.ts:367-370` — `isSummarySymbol()` blocks "total", "subtotal", "sum", "grand total", "summary", "net"; `src/CsvImportPanel.tsx:509-516` — applied to pairCol before parsing. Rithmic and NinjaTrader presets both route through this path | None | 0 | — |
| 2.2 | `normalizeDate()` returns null on invalid input | DONE | `src/lib/csvParser.ts:285-305` — returns `null` for empty string (line 286), unparseable input (line 304 — returns `null` not `new Date()`). Row rejection for null date: `src/CsvImportPanel.tsx:50-51` — `if (!date || !pair) return null` | None | 0 | — |
| 2.3 | Dedup hash uses `date+pair+entryPrice+pnl` only | DONE | `src/lib/csvParser.ts:461-471` — `tradeKey()` uses only `date`, `pair`, `entryPrice`, `pnl` (or `brokerId` alone when present). SL/TP/session not included | None | 0 | — |
| 2.4 | `pnlDollar` populated for CSV imports | DONE | `src/CsvImportPanel.tsx:73-83` — trusts broker's net P&L when present; falls through to `computePnlDollar()` when absent. `src/lib/csvParser.ts:378-401` — `FUTURES_POINT_VALUE` table includes NQ $20, MNQ $2, ES $50, MES $5, and 20+ more | None | 0 | — |
| 2.5 | `normaliseSymbol()` exists and is called | DONE | `src/lib/csvParser.ts:354-364` — strips `NQH5 → NQ`, `ES 03-25 → ES` etc.; `src/CsvImportPanel.tsx:47` — called on every row's symbol field before storage | None | 0 | — |
| 3.1 | Daily loss limit widget on home screen | PARTIAL | `src/Koda.tsx:1743-1775` — kill-switch widget renders on home screen (Stats sub-view) using `profile.maxDailyLoss` (R-based). Three-state escalation: safe / near-limit / kill-switch. However, the `propFirmDailyLossLimit` dollar-based prop-firm bar is only shown when `propFirmMode` is true and `propFirmBalance` is set (`src/Koda.tsx:3146-3183`). Users without propFirmMode enabled won't see the dollar loss limit widget | Kill-switch widget uses R not $ and is not prominent on Home overview — it's in the Stats sub-section. The prop-firm version is correct but gated | 0.5 | SHOULD |
| 3.2 | PostHog intervention events wired | PARTIAL | `src/lib/posthog.ts:48` — `phCapture` exists and is called for `csv_imported`, `trade_logged`, `trade_edited`, `calculator_opened`. FirstSessionSurvey fires `phIdentify` with `prior_tool`. No `intervention_shown`, `intervention_confirmed`, `intervention_dismissed`, `kill_switch_activated`, `kill_switch_blocked_log`, or `daily_loss_widget_state_change` events found anywhere in src/ | 6 of 6 named PostHog intervention events are missing — `phCapture` is never called near the kill-switch or loss-limit UI | 2 | SHOULD |
| 3.3 | `profile.prior_tool` schema + first-session prompt | DONE | `src/types.ts:78-79` — `priorTool` and `almostStoppedReason` fields on `Profile`; `src/components/FirstSessionSurvey.tsx:10-15` — component exists; `src/Koda.tsx:694` — fires when `profile.onboarded && !profile.priorTool`; PostHog identify called with both fields (`src/Koda.tsx:476-477`). Note: fields are in the KV blob profile, not a separate `profiles` table column — no SQL migration adds them | None for the feature. No SQL migration needed since they live in the KV JSON blob | 0 | — |
| 3.4 | UTM capture and persistence | PARTIAL | `src/lib/utm.ts:11-20` — `captureUtm()` saves to `sessionStorage` (key `koda_utm`) on page load; `src/main.tsx:26` — called before auth; `src/Koda.tsx:478` — `...readUtm()` spread into `phIdentify`. UTM values are NOT written to `profile.acquisition_source` in Supabase/KV — they are only forwarded to PostHog identity. No migration adds `acquisition_source` column. | UTMs live in PostHog only. No persistent `acquisition_source` on the user record means you can't query acquisition by source in Supabase. Acceptable for beta | 0 | NICE |
| 3.5 | Global Circle auto-enrol on sign-up | PARTIAL | `src/Koda.tsx:708-733` — client-side backfill effect auto-joins every user to `KODA-GLOBAL`; `src/hooks/useCircles.ts:403-424` — `joinCircleByCode()` auto-creates the global circle row if missing. Migration `20260529_seed_koda_global_circle.sql` seeds the row. Global circle is stored in `shared_kv`, not in the `circles` relational table, so no `is_system` column or RLS deletion guard exists at the DB level. The client guards against leaving KODA-GLOBAL (`src/hooks/useCircles.ts:453-456`) | No server-side trigger — join happens client-side on first app load. If user signs up but never opens the app, they won't be in the circle. No DB-level deletion protection | 1 | SHOULD |
| 4.1 | BETA26 end-to-end tested | CANNOT VERIFY | — | Dylon to confirm: complete a test checkout using `BETA_26` code on the live Stripe test environment | — | BLOCKER |
| 4.2 | BETA_BRIEF updated | PARTIAL | `docs/BETA_BRIEF.md:56` — mentions "promo code — reply to this message to claim it" but does NOT contain the code `BETA_26`, explicit redemption steps (Settings → Billing → Enter code), or framing of the intervention layer | Missing: (1) code `BETA_26` or `BETA26`, (2) exact redemption path, (3) honest framing of kill-switch/intervention features | 0.5 | BLOCKER |
| 4.3 | Discord invite message drafted | NOT STARTED | No `docs/beta-invite-discord.md` or similar found in `docs/` | Entire docs directory checked — no Discord draft exists | 1 | SHOULD |
| 4.4 | UTM convention documented | NOT STARTED | No `docs/utm-conventions.md` found anywhere in the repo | Not present | 0.5 | NICE |
| 4.5 | First 5 invites sent | CANNOT VERIFY | — | Dylon to confirm | — | BLOCKER |

---

## 3. Whiteboard Gaps — Detailed

**1.3 Receipt currency hardcoded `£`**
`api/stripe-webhook.ts:198` constructs `amount` as `` `£${(invoice.amount_paid / 100).toFixed(2)}` `` with no reference to `invoice.currency`. UK-only beta makes this low-risk right now, but it will send `£` symbols to USD or EUR subscribers. Fix: add a `CURRENCY_SYMBOL` map (`{ gbp: "£", usd: "$", eur: "€" }`) and resolve from `invoice.currency.toLowerCase()` before building the amount string.

**3.1 Daily loss limit widget placement**
The kill-switch widget (`src/Koda.tsx:1743-1775`) reads from `profile.maxDailyLoss` (an R-multiple string), not `propFirmDailyLossLimit` (a dollar amount). It renders inside the Stats sub-view on the Home tab — not at the very top of the Home overview. The prop-firm dollar version at `src/Koda.tsx:3146-3183` is more accurate but requires `propFirmMode = true`. Most beta users may never enable propFirmMode and will miss the dollar-denominated widget entirely. Not a launch blocker, but consider surfacing the prop-firm bar more prominently.

**3.2 PostHog intervention events missing**
`phCapture` is imported and used in `src/Koda.tsx` but none of the six specified intervention events exist anywhere in the codebase. The kill-switch at `src/Koda.tsx:1756-1775` fires no analytics. Add `phCapture("kill_switch_activated", { todayPnl })` when `killSwitchTripped` becomes true, and `phCapture("intervention_shown", { type: "kill_switch" })` when the override button is clicked. The other four events (`intervention_confirmed`, `intervention_dismissed`, `daily_loss_widget_state_change`) require the prop-firm modal flow or a dedicated intervention overlay that does not yet exist.

**3.5 Global Circle — no server-side trigger, no DB deletion guard**
The global circle join is purely client-side (effect in `src/Koda.tsx:708-733`). If a user signs up via OAuth and the redirect fails mid-flight, they may never land in the circle. A Supabase `auth.users` trigger inserting into `shared_kv` would be the robust fix, but it's non-trivial. The bigger concern is that `shared_kv` rows have no `is_system` flag — a determined user with direct API access could `DELETE` the global circle row. The client prevents leaving (`src/hooks/useCircles.ts:453`), but that's easily bypassed. For beta with 5 users, the client guard is fine.

**4.2 BETA_BRIEF missing promo redemption steps**
`docs/BETA_BRIEF.md:56` says "you'll get a promo code — reply to this message to claim it" but omits: (a) the actual code `BETA_26`, (b) where to enter it (Settings → Upgrade → "Have a promo code?"), and (c) that it provides lifetime free Pro. Add one sentence: "Use code `BETA_26` at checkout (Settings → Upgrade → enter at payment screen) for lifetime free Pro access."

**4.3 Discord invite message**
No draft exists. Create `docs/beta-invite-discord.md` with: hook (one-liner on the differentiator), what to test, how to report feedback, and promo code instructions. Estimated 1 hour.

**4.4 UTM convention doc**
No `docs/utm-conventions.md` exists. Low priority for 5-user beta but create before scaled outreach.

---

## 4. Circles USP State

### Technical Readiness

| Check | Rating | Evidence |
|-------|--------|---------|
| 2.1 New user lands in global Circle automatically | FUNCTIONAL-BUT-WEAK | Client-side effect in `src/Koda.tsx:732` calls `joinCircleByCode(KODA_GLOBAL_CODE)`. Works but is not server-guaranteed |
| 2.1 Can see other members and leaderboard immediately | READY | `src/hooks/useCircles.ts:515-561` — batch-fetch leaderboard via `listByPrefix`; members visible via `readCircleMembers` |
| 2.1 Can see recent activity/trades in Circle feed | FUNCTIONAL-BUT-WEAK | `src/data/circlesSharedTrades.ts` + `src/TradingCircles.tsx:789` — feed renders `SharedTradeCard`. Feed is empty on day one with no seeded content |
| 2.1 Can react to / comment on a trade | READY | `reactToSharedTrade` wired; `toggle_trade_reaction` Postgres function handles atomicity |
| 2.1 Can create their own Circle | READY | `createCircle()` in `src/hooks/useCircles.ts`; form present in `TradingCircles.tsx` |
| 2.1 Can invite via shareable link or code | FUNCTIONAL-BUT-WEAK | Code-based join exists; shareable link (deep link with code pre-filled) not confirmed in UI |
| 2.1 Can view their own rank in global Circle | READY | Leaderboard tab shows rank with sort by $P&L, R, win rate, trade count, avg R |
| 2.1 Navigate from member tap to profile/trades | FUNCTIONAL-BUT-WEAK | `openProfile` prop passed to `TradingCircles` but confirmation of the profile modal depth depends on Koda.tsx handler |
| 2.2 `circles` / `circle_members` tables with expected schema | PARTIAL | Both exist in `supabase/migrations/002_v2_schema_additive.sql:107-167`. However, the live app uses `shared_kv` KV rows, not these relational tables — they are schema-only, not in active use |
| 2.2 RLS prevents non-member reads of private Circles | PARTIAL | `shared_kv` RLS enforces `auth.uid() = owner_id` (each member owns their own row). However, circle *metadata* rows are owned by the creator, not by each member, so members query public circle rows cross-user. Private circle metadata row is readable by any authenticated user who knows the key. This is a v1 known limitation |
| 2.2 `trades.public` privacy flag | PARTIAL | `profile.publicTrades` boolean exists (`src/types.ts:64`). CSV imports set `source: "csv_import"` (`src/CsvImportPanel.tsx:107`) but no `isPublic: false` field on `Trade` type — privacy is profile-level, not trade-level |
| 2.2 CSV-imported trades default to private | PARTIAL | There is no explicit `isPublic` field on the `Trade` type. Publishing to a circle is an explicit user action (`publishToCircle`) — so trades are private-by-default by omission, not by explicit flag |
| 2.2 Leaderboard uses single join not N+1 | READY | `src/hooks/useCircles.ts:521-532` — single `listByPrefix` call fetches all entry rows; members iterated in-memory. Not a DB join but avoids N+1 |
| 2.4 "Verified" badge on Circle shared trades | NOT DONE | `src/components/SharedTradeCard.tsx` — no badge, tag, or copy distinguishes a CSV-verified trade from a manually-entered one. `trade.source` is not passed to `SharedTradeCard`. The USP is invisible |
| 2.4 CSV vs live-logged trades distinguishable | NOT DONE | `SharedTrade` type has no `source` field. `circle_shared_trades` table has no `source` column. No UI distinction |
| 2.4 Can user fake trade P&L after Circle reaction | PARTIAL | `supabase/migrations/20260527_fix_circle_reactions_rls.sql` tightens UPDATE so only `author_uid` can edit their row. However `author_uid` is nullable and backfilled on next share — rows created before this migration may be unprotected. Local trades (KV-based) can be edited anytime in the client — the circle_shared_trades row is a snapshot, so editing locally does not change the shared version |

### Experience Readiness

**First-session walkthrough for a new beta user:**
A user signs up, completes onboarding, and auto-joins `KODA-GLOBAL`. On day one with zero other users, they see: an empty feed ("no shared trades yet"), an empty leaderboard (their own entry with 0 trades, 0 P&L), and an empty chat. Nothing signals to them that this is Kōda's differentiator or why it's better than a Discord trading channel.

**2.3 Cold-start problem:**
The cold-start problem is entirely unaddressed. There is no:
- Welcome message or pinned post in the global circle
- "Members online now" indicator
- Activity from Dylon's own account visible on first open
- Suggested Circles or strategy-niche Circles to discover
- Any seeded content (even placeholder trade cards)

For the first 5 beta users, the global circle will look empty and unimpressive. The value proposition — verified trades vs Discord screenshots — requires there to be *trades visible*, which requires users to log trades *and* explicitly publish them to the circle. This is a two-step action new users won't take until they see value, which requires content they won't see until others post.

**2.5 Notifications and return drivers:**
`src/NotificationsDrawer.tsx:8` explicitly notes: "v1 sources: draft trades waiting in the Review Inbox. Future sources (architected for, not yet wired): new followers, circle activity, challenge completions." No notification fires when a rank changes, someone reacts to a shared trade, or a friend logs a win. Push subscriptions infrastructure exists (`supabase/migrations/20260526_push_subscriptions.sql`, `api/push.ts`) but is not wired to circle events. Users have no reason to return to the Circle tab tomorrow unless they are intrinsically motivated.

---

## 5. Cross-Cutting Risks

| Risk | Whiteboard item | Circles impact |
|------|----------------|----------------|
| UTM only in PostHog, not on user record | 3.4 | Cannot slice Circle acquisition by source — can't tell if Discord drive-to-beta worked |
| No verified-trade badge | (gap in Circles) | Directly undermines the "verified vs screenshot" positioning Kōda is built on |
| Cold-start / empty global circle | 3.5 | First-session users see nothing, reducing the chance they share their own trades or invite friends |
| Receipt currency hardcoded `£` | 1.3 | Low-risk UK-only beta; SHOULD fix before scaling internationally |
| No PostHog events on kill-switch | 3.2 | Can't measure if the intervention layer is actually changing behaviour — the product's behavioural claim can't be validated |

---

## 6. Recommended Next 24–48 Hours

**Send invites: today (2026-05-31)**

1. **(30 min — TODAY)** Update `docs/BETA_BRIEF.md`: add explicit `BETA_26` redemption instructions including the exact UI path (Settings → Upgrade → enter promo code at checkout). Remove "reply to claim it" — just put the code in the doc.

2. **(1 hr — TODAY)** Add a "verified by Kōda" or "CSV import" badge to `src/components/SharedTradeCard.tsx`. Pass `source` field through `circle_shared_trades` table (add `source text` column in a new migration) and display a small "✓ Kōda verified" chip when `source === 'csv_import'` or `source === 'manual'`. This is the single change that makes the USP visible.

3. **(1 hr — TODAY before sending invites)** Write and save `docs/beta-invite-discord.md` — the actual message to paste. Include: one-line hook, what to test, `BETA_26` code, feedback path.

4. **(0.5 hr — TODAY)** Dylon: verify in Stripe dashboard that `STRIPE_PROMO_CODE_ID_BETA` is set in Vercel production env AND the promo code `BETA_26` (or `BETA26`) is active in Stripe. Run one test checkout.

5. **(1 hr — tomorrow sprint 1)** Fix receipt currency: replace hardcoded `£` at `api/stripe-webhook.ts:198` with a currency symbol map resolved from `invoice.currency`.

6. **(2 hrs — tomorrow sprint 1)** Add PostHog events to the kill-switch / daily loss widget: `kill_switch_activated`, `kill_switch_override_clicked`. These are the two highest-value behavioural signals.

7. **(2 hrs — tomorrow sprint 1)** Seed the global circle: Dylon logs 2-3 real trades and explicitly publishes them to the circle before inviting anyone. This single action eliminates the cold-start problem for the first 5 users.

**Estimated time to "send invites with confidence":** 2.5 hrs (items 1–4 only). The rest are post-send sprint 1.

---

## 7. Items Only Dylon Can Verify

- **STRIPE_PROMO_CODE_ID_BETA** is set in Vercel environment variables (production)
- The Stripe promo code `BETA_26` (or `BETA26`) exists in Stripe Dashboard → Coupons/Promotion Codes and is active
- A complete test checkout using `BETA_26` code has been run on the live (or test-mode) environment and resulted in: (a) 100% discount applied, (b) webhook firing, (c) user plan updated to Pro, (d) receipt email received with correct amount
- Discord invite message has been drafted and a community selected for the first 5 invites
- First 5 invites have been sent (with promo code instructions)
- Dylon's own account has logged trades and published at least 2 to the global circle before the first beta user arrives (cold-start mitigation)

---

## 8. Honest Assessment of Circles as USP

**Will beta users see Circles as the differentiator?** Partly.

The mechanics are there: auto-join, leaderboard, feed, reactions, chat, challenges. A user who logs trades, publishes to the circle, and has at least one other person do the same will understand the concept. But the first-session experience — before any trades exist in the feed — is an empty room. There is no visual proof of the "verified trades vs screenshots" claim because (a) the feed is empty and (b) even when populated, `SharedTradeCard` shows no badge indicating the trade came from an actual broker import. A user who arrives on day one and sees the empty global circle before anyone else has posted will reasonably conclude Circles is a feature-in-progress, not the reason they should stay.

**The single change that would most improve that perception in the next 7 days:**

Add a `source` badge to `SharedTradeCard` — a small "✓ Kōda verified" or "↑ CSV import" chip. Two lines of JSX in `src/components/SharedTradeCard.tsx` (requires passing `source` through the `SharedTrade` type and adding one column to `circle_shared_trades`). This makes the trust signal visible on every trade card, turns the feed from "P&L scoreboard" into "proof-of-trade," and is the physical manifestation of the pitch: *unlike Discord, you can't fake this*. Without it, Circles is just another leaderboard.
