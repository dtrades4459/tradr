# Kōda — Full Audit Index

**Run date:** 2026-05-29
**Orchestrator:** Claude Code (5-agent parallel pass)

---

## 1. Run Summary

| Agent | Report | Status | Critical | High | Medium | Low |
|---|---|---|---|---|---|---|
| 1 — Codebase | `docs/AUDIT.md` | ✅ Complete | 0 | 7 | 16 | 9 |
| 2 — Dev Environment | `docs/DEV_ENV_AUDIT.md` | ✅ Complete | 0 | 5 | 8 | 4 |
| 3 — UX | `docs/UX_AUDIT.md` | ✅ Complete | 8 | 24 | 28 | 12 |
| 4 — Funnel & Payments | `docs/FUNNEL_AUDIT.md` | ✅ Complete | 1 | 4 | 4 | 3 |
| 5 — CSV Import | `docs/CSV_IMPORT_AUDIT.md` | ✅ Complete | 6 | 10 | 18 | 6 |
| **Total** | | | **15** | **50** | **74** | **34** |

> Note: Agents 1, 3, 4, 5 hit a sandbox write block. Reports were saved by orchestrator directly.

---

## 2. Headline Findings

### Fix today (before sharing with any beta tester)

| # | Finding | Report | File | Effort |
|---|---|---|---|---|
| 1 | **`BETA26` promo code shows "100% off" on client but charges full price** | Funnel | `api/stripe-checkout.ts:38` | S |
| 2 | **Password field renders as plain text** — `FloatingInput` missing `type="password"` | Funnel | `src/shared.tsx:550`, `src/KodaAuth.tsx:228` | S |
| 3 | **Receipt emails show `$` not `£`** | Funnel | `api/stripe-webhook.ts:198` | S |
| 4 | **Terms say £5.99/month; app charges £24.99** | Funnel | `public/terms.html:63` | S |
| 5 | **`pnlDollar` always `""` for CSV imports** — Prop Firm daily loss reads $0 for all imported trades | CSV | `src/CsvImportPanel.tsx:73` | S–M |
| 6 | **`.env` is committed to git** — normalises credential-in-repo pattern | Dev Env | `.gitignore` | S |
| 7 | **TRADR brand in user-visible export filenames and share text** | Codebase | `src/Koda.tsx:1155,1174,3133` | S |

### Week 1 (before beta wave 2)

| # | Finding | Report | Effort |
|---|---|---|---|
| 8 | **No cookie/consent banner** — PostHog autocapture + session recording fire before consent (GDPR/PECR) | Funnel | M |
| 9 | **Weekly Email Digest listed as Pro feature but no cron sends it** | Funnel | M |
| 10 | **Kill switch doesn't block Log screen** — trader can keep logging after kill switch fires | UX | S |
| 11 | **Daily loss tracker not glanceable mid-session** — buried in Prop Firm tab | UX | M |
| 12 | **Pre-trade checklist not wired to trade log** — can log a trade without completing checklist | UX | M |
| 13 | **CSV trailing summary rows imported as trades** (Rithmic/NinjaTrader "TOTAL" row → phantom +$12K trade) | CSV | S |
| 14 | **CSV missing dates silently default to today** — distorts daily stats and kill-switch | CSV | S |
| 15 | **Smoke tests still target `tradrjournal.xyz`** | Dev Env | S |

### Post-launch (scheduled work)

| # | Finding | Report | Effort |
|---|---|---|---|
| 16 | **2 `useEffect` calls missing `[]` dep array** — fragile initialisation guards | Codebase | S |
| 17 | **10+ unmemoized derivations on every render** | Codebase | M |
| 18 | **MM/DD vs DD/MM date ambiguity** — silently wrong for EU traders days 1–12 | CSV | S |
| 19 | **Contract code normalisation missing** — NQ stats split across `NQZ4`/`NQH5`/etc | CSV | S |
| 20 | **Discipline score Pro-gated + retrospective only** — no live feedback during session | UX | L |
| 21 | **Post-loss cooldown cosmetic only** — trader can keep clicking Log | UX | M |
| 22 | **No `type` checking for `api/` in CI** | Dev Env | S |

---

## 3. Cross-Audit Dependencies

| Issue | Blocks | Blocked by |
|---|---|---|
| FUN-CRIT-1 (BETA26 promo) | Beta invite wave | Fix `api/stripe-checkout.ts` + create Stripe promo |
| CSV-CRIT (pnlDollar always "") | Prop Firm mode credibility | Tick-value table decision (Codebase §8) |
| CSV-CRIT-1 (trailing rows) | All R-based stats for Rithmic users | None |
| CSV-CRIT-3 (MM/DD ambiguity) | EU user stats accuracy | Per-preset `dateLocale` field |
| CSV-CRIT-4 (contract normalisation) | Per-pair analytics for all users | Symbol normalisation function |
| UX kill switch | Prop Firm mode integrity | Kill switch gate needs to intercept `view` state setter |
| Cookie consent | GDPR compliance | Must ship before public launch (not just beta) |
| Weekly email digest | Pro feature promise | `weeklyRecapHtml()` template already done; just needs cron |
| `TRADR_ENCRYPTION_KEY` rename | Clean rebrand | Coordinate Vercel env var update + redeploy |

---

## 4. Recommended Sequencing

### Session 1 — Launch blockers (2–3 hours total)

1. **FUN-CRIT-1**: Add `BETA26` to `PROMO_CODE_MAP` in `api/stripe-checkout.ts` + create Stripe promo code object
2. **FUN-HIGH-1**: Add `type` prop to `FloatingInput`, pass `type="password"` from `KodaAuth.tsx`
3. **FUN-MED-1**: Fix currency symbol in receipt email (`invoice.currency` → symbol)
4. **FUN-HIGH-2**: Update `public/terms.html:63` to £24.99/month or £199/year
5. **DEV-S1**: Add `.env` to `.gitignore`, run `git rm --cached .env`
6. **DEV-S2**: Replace personal email in `.env.example:71` with placeholder
7. **COD-HIGH**: Rename TRADR export filenames (`koda-export-`, `koda-trades-`) + share text

### Session 2 — CSV / Prop Firm integrity (3–4 hours)

1. **CSV-CRIT-1**: Filter trailing "TOTAL/Subtotal" rows in `csvParser.ts:56`
2. **CSV-CRIT-2**: Return `null` on empty/invalid dates in `normalizeDate()`; reject those rows
3. **CSV-CRIT-5**: Fix dedup hash to use `date+pair+entryPrice+pnl` (drop SL/TP/session)
4. **CSV-pnlDollar**: Decide gross/net approach; fix `CsvImportPanel.tsx:73`
5. **CSV-CRIT-4**: Add `normaliseSymbol()` stripping contract month/year suffixes

### Session 3 — UX quick wins (2 hours)

1. Kill switch should block Log screen navigation
2. Daily loss limit: surface as persistent banner in the main nav when within 20% of limit
3. Post-loss cooldown: enforce with a timed lock on the Log button, not just a colour change

### Week 1 — Compliance + engagement (8–12 hours)

1. Cookie consent banner (cookie-first, minimal — no third-party library needed)
2. Weekly email recap cron (`api/cron/weekly-recap.ts`)
3. Fix smoke-test domain + `--max-warnings 0` in CI

### Post-launch (sprints)

- Tick-value table + R:R calculation from dollar P&L
- Contract code normalisation
- UpgradeModal annual plan toggle
- `useEffect` dep arrays + `useMemo` for inline derivations
- TRADR→Kōda env var rename (`TRADR_ENCRYPTION_KEY`)

---

## 5. Suggested Next Prompts

To action these findings in Claude Code, use the following prompts:

```
Fix FUN-CRIT-1: in api/stripe-checkout.ts add BETA26 to PROMO_CODE_MAP and update
PaywallScreen.tsx to keep client and server in sync.
```

```
Fix FUN-HIGH-1: add a `type` prop to FloatingInput in src/shared.tsx and pass
type="password" from KodaAuth.tsx line 228.
```

```
Fix CSV-CRIT-1 and CRIT-2: in src/lib/csvParser.ts filter trailing summary rows
(TOTAL/Subtotal/empty symbol) and return null from normalizeDate() for empty/invalid dates.
```

```
Fix CSV-CRIT-5: change the dedup hash in src/CsvImportPanel.tsx to use
date+pair+entryPrice+pnl instead of the current keys that include empty SL/TP fields.
```

```
Fix DEV-S1: add .env to .gitignore (between .env.local and .env.*.local lines)
and run git rm --cached .env.
```

```
Create the weekly recap cron at api/cron/weekly-recap.ts that calls weeklyRecapHtml()
from api/lib/email.ts for all Pro users and wire it up as a Monday 8am UTC GitHub
Actions workflow alongside sync-cron.yml.
```
