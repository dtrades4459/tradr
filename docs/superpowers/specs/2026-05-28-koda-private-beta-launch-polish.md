# Kōda — Private Beta Launch Polish

**Date:** 2026-05-28  
**Goal:** Ship all remaining audit + visual pass work so Kōda is ready to invite 20–50 private beta traders.  
**Approach:** Polish then launch (Approach A). Live journaling / auto-positions is Sprint 1 post-launch.  
**Source audits:** `AUDIT.md`, `DEV_ENV_AUDIT.md`, `CSV_IMPORT_AUDIT.md`, `docs/superpowers/plans/2026-05-26-koda-visual-pass-v2.md`

---

## Batches

All four batches ship as independent PRs. Merge each before starting the next.

---

## Batch 1 — Commit existing work + quick code fixes

**Branch:** `feat/batch1-quick-fixes`  
**Est. time:** 20 min  
**Risk:** None — all changes are either already tested or trivially safe.

### 1.1 — Commit `localDateStr` timezone fix

Files already modified, just need staging and committing:
- `src/shared.tsx` — `localDateStr()` helper added
- `src/Koda.tsx` — 4 `new Date().toISOString().split("T")[0]` → `localDateStr()`
- `src/EvalAccountScreen.tsx` — same fix
- `src/tradeConstants.ts` — `EMPTY_TRADE.date` fix

Commit message: `fix: replace UTC date slicing with localDateStr() for correct timezone handling`

### 1.2 — Fix 2 bare `useEffect` calls

File: `src/Koda.tsx`

- **L414** — `useEffect` with no dep array, guarded by `_loadedRef`. Change to `useEffect(() => { ... }, [])`. The ref guard alone is fragile and confuses the React Compiler.
- **L429** — `useEffect` with no dep array, Stripe return URL handler guarded by `_stripeHandledRef`. Same fix: add `[]`.

Verification: `npm run build && npx tsc --noEmit` — no new errors.

### 1.3 — Add 5 missing `.env.example` entries

File: `.env.example`

Add these five entries (with placeholder values and comments):
```
APP_URL=https://tradrjournal.xyz           # Production URL — used in emails, Stripe redirects, CORS
SUPABASE_ANON_KEY=your-anon-key           # Server-side anon key (distinct from VITE_ prefix version)
VITE_APP_VERSION=0.1.0                    # Set by CI (git SHA); used in Sentry release tracking
STRIPE_PROMO_CODE_ID_FOUNDERS=promo_xxx   # Stripe promo code object ID for founders discount
STRIPE_PROMO_CODE_ID_BETA=promo_xxx       # Stripe promo code object ID for beta users
```

### 1.4 — Fix `.gitattributes` CRLF normalisation

File: `.gitattributes`

Add as the first line:
```
* text=auto eol=lf
```

This eliminates the CRLF warnings that appear on every Windows commit.

---

## Batch 2 — Brand sweep + domain migration

**Branch:** `feat/batch2-brand-sweep`  
**Est. time:** 40 min  
**Risk:** Low — string replacements only. No logic changes.  
**New domain:** `kodatrade.co.uk` (confirmed 2026-05-28)

> **Already done** (skip): export filenames, CSS class, BetaGate MONO/BODY import.

> **Vercel dashboard — Dylon must do before merging this PR:**
> 1. Add `kodatrade.co.uk` and `www.kodatrade.co.uk` as custom domains in Vercel project settings
> 2. Set `APP_URL=https://kodatrade.co.uk` in Vercel env vars (Production + Preview)
> 3. Add `KODA_ENCRYPTION_KEY` with the same value as the existing `TRADR_ENCRYPTION_KEY`

### 2.1 — BetaGate SVG mark (`src/BetaGate.tsx`)

`KodaMarkFilled` (L40–47) renders `"kd"` text. Replace with 4-chevron mark:
```tsx
function KodaMarkFilled({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 100 80" fill="none" style={{ display: "block", flexShrink: 0 }}>
      <polyline points="8,8 22,40 8,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="28,8 42,40 28,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="48,8 62,40 48,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
      <polyline points="68,8 82,40 68,72" stroke={TEXT} strokeWidth="3" strokeLinejoin="miter" />
    </svg>
  );
}
```

### 2.2 — USERNAME_DOMAIN (`src/KodaAuth.tsx`)

- L44: `USERNAME_DOMAIN = "users.tradr.app"` → `"users.kodatrade.co.uk"`

### 2.3 — Hardcoded CORS origins in 5 API files

Files: `api/broker/[action].ts`, `api/feedback.ts`, `api/cron/complete-challenges.ts`, `api/cron/sync.ts`, `api/reset-password.ts`
```ts
const ALLOWED_ORIGINS = [
  process.env.APP_URL ?? "https://kodatrade.co.uk",
  "https://www.kodatrade.co.uk",
].filter(Boolean);
```

### 2.4 — All `tradrjournal.xyz` domain references

- `src/SettingsScreen.tsx` L311: profile URL → `kodatrade.co.uk/@${handle}`
- `src/TradingCircles.tsx` L365, L1078: circle join URLs → `kodatrade.co.uk/?join=`
- `src/Koda.tsx` L1318 (PDF footer): → `kodatrade.co.uk`
- `src/Koda.tsx` L3104 (share button): → `https://kodatrade.co.uk`
- `src/FriendsFeed.tsx` L424 (share): → `https://kodatrade.co.uk`
- `src/Koda.tsx` L366 (comment): update example URL

### 2.5 — Email FROM address (`api/lib/email.ts`)

- `FROM = "Kōda <noreply@tradrjournal.xyz>"` → `"Kōda <noreply@kodatrade.co.uk>"`
- All `tradrjournal.xyz` links inside HTML templates → `kodatrade.co.uk`

### 2.6 — Encryption key rename (`api/lib/cryptoUtils.ts`)

- Replace `TRADR_ENCRYPTION_KEY` with `KODA_ENCRYPTION_KEY` everywhere in the file (3 occurrences)
- `.env.example`: rename `TRADR_ENCRYPTION_KEY` → `KODA_ENCRYPTION_KEY`
- `.env.example`: update `APP_URL` default → `https://kodatrade.co.uk`

Verification: `npm run build` — no new errors.

---

## Batch 3 — Visual pass

**Branch:** `feat/batch3-visual-pass`  
**Est. time:** 2–3 hours  
**Risk:** Medium — visual-only changes, but many files touched. Build + manual smoke test after each task group.

All task content (exact code) is in `docs/superpowers/plans/2026-05-26-koda-visual-pass-v2.md`. This spec maps tasks to that plan.

### Task order (mirrors the plan)

| Task | Plan ref | Files | Commit message |
|---|---|---|---|
| 3.1 — 9 missing keyframes | Task 1 | `src/index.css` | `feat: add 9 missing design-spec keyframes` |
| 3.2 — Empty/skeleton/error states in shared.tsx | Task 2 | `src/shared.tsx` | `feat: empty/skeleton/error state components` |
| 3.3 — Wire empty states into Koda.tsx + offline | Task 3 | `src/Koda.tsx` | `feat: offline detection + empty states wired` |
| 3.4 — EmptyCircles into TradingCircles + CornerGlow | Task 4 | `src/TradingCircles.tsx` | `feat: empty circles state + CornerGlow visual pass` |
| 3.5 — Celebration overlays | Task 5 | `src/shared.tsx`, `src/Koda.tsx` | `feat: trade/streak/pro celebration overlays` |
| 3.6 — EvalAccountScreen visual pass | Task 6 | `src/EvalAccountScreen.tsx` | `feat: EvalAccountScreen visual pass` |
| 3.7 — LotSizeCalculator polish | Task 7 | `src/LotSizeCalculator.tsx` | `feat: LotSizeCalculator glass header + kDrawer` |
| 3.8 — ReviewInboxScreen visual pass | Task 8 | `src/ReviewInboxScreen.tsx` | `feat: ReviewInboxScreen mint dot + draft pill rows` |
| 3.9 — LogTradeScreen visual pass | Task 9 | `src/LogTradeScreen.tsx` | `feat: LogTradeScreen FloatingInput + emotion pills` |
| 3.10 — SettingsScreen visual pass | Task 10 | `src/SettingsScreen.tsx` | `feat: SettingsScreen Kicker headers + Card grouping` |
| 3.11 — KodaAuth marketing screen visual pass | Task 11 | `src/KodaAuth.tsx` | `feat: KodaAuth landing hero + sign-in card` |
| 3.12 — DataSourcesScreen visual pass | Task 12 | `src/DataSourcesScreen.tsx` | `feat: DataSourcesScreen broker card + CSV grid` |
| 3.13 — App icon set regeneration | Task 13 | `public/icon.svg`, `public/favicon.svg`, `public/apple-touch-icon.svg`, `public/icon-maskable.svg` | `feat: regenerate all icons to 4-chevron mark` |
| 3.14 — OG share card | Task 14 | `public/og-image.svg` | `feat: regenerate og-image.svg from OGCard spec` |
| 3.15 — Static pages | Task 15 | `public/faq.html`, `public/changelog.html`, `public/404.html` | `feat: add /faq /changelog /404 static pages` |

**Verification after each task:** `npm run build` — no errors. After all tasks: `npx tsc --noEmit` — no new type errors.

**Manual smoke test before merging Batch 3:**
- Open preview URL on phone
- Check home dashboard (empty state visible if no trades)
- Log a trade → celebration overlay fires
- Navigate to each main tab — no visual regressions
- Install PWA → check icon on home screen (4-chevron, no "tr")

---

## Batch 4 — Email + cron

**Branch:** `feat/batch4-email-cron`  
**Est. time:** 30 min  
**Risk:** Low for new files. Medium for Stripe webhook change (existing file).

### 4.1 — Email helper

Create `api/lib/email.ts` — Resend helper + `weeklyRecapHtml()` + `receiptHtml()` templates.  
Exact code in visual pass plan Task 16, Step 1.

### 4.2 — Weekly recap cron

Create `api/cron/weekly-recap.ts` — runs Sunday 20:00 UTC.  
Exact code in visual pass plan Task 16, Step 2.

Add to `vercel.json` crons array:
```json
{ "path": "/api/cron/weekly-recap", "schedule": "0 20 * * 0" }
```

### 4.3 — Stripe receipt email

In `api/stripe-webhook.ts`, find the `invoice.paid` handler (search for `case "invoice.paid"` or `invoice.paid`). Read what variables are already in scope at that point — `invoice`, `customerId`, etc. Then add the receipt send after the plan claim update:
```ts
import { sendEmail, receiptHtml } from "./lib/email";
// ... inside invoice.paid handler, after existing plan logic:
const userEmail = invoice.customer_email;
const userName = String(invoice.customer_name ?? "Trader");
const planLabel = invoice.lines?.data?.[0]?.description ?? "Pro";
if (userEmail) {
  await sendEmail({
    to: userEmail,
    subject: "Your Kōda receipt",
    html: receiptHtml({
      name: userName.split(" ")[0],
      plan: planLabel,
      amount: `$${((invoice.amount_paid as number) / 100).toFixed(2)}`,
      date: new Date((invoice.created as number) * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    }),
  });
}
```
Note: read the existing handler first to confirm field names — `invoice.customer_email` and `invoice.amount_paid` are standard Stripe `Invoice` fields but verify they're typed correctly in context.

### 4.4 — Update `.env.example`

Confirm `RESEND_API_KEY` is already present (added in Batch 1 if missing). No new vars needed.

**Verification:** `npm run build && npx tsc --noEmit`. Deploy preview → check Vercel function logs.

---

## What this does NOT include

These are explicitly out of scope for this sprint (post-launch work):

- Live positions / in-progress journal entries (Sprint 1 post-launch)
- `TRADR_ENCRYPTION_KEY` → `KODA_ENCRYPTION_KEY` rename (blocked until domain confirmed)
- Domain-dependent brand changes (profile URLs, circle join URLs) — TODO comments added instead
- Koda.tsx state decomposition / Zustand migration
- Follow system v2 migration cleanup
- CSP header hardening
- Rate limiting on broker endpoints

---

## Definition of done

- [ ] All 4 PRs merged to `main`
- [ ] CI green on all PRs (lint + tsc + build)
- [ ] Vercel production deploy green
- [ ] App opens on phone, no visual regressions
- [ ] Beta invite sent to first tester
