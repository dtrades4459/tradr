# Kōda — Funnel & Payments Audit

**Date:** 2026-05-29
**Auditor:** Claude Code (re-run; original sandbox write was blocked)
**Scope:** BetaGate → Auth → Onboarding → Paywall → Checkout → Webhook → Post-payment; analytics/consent; email flows

---

## 1. Executive Summary — Top 5 Issues

| Rank | Issue | Severity |
|---|---|---|
| 1 | **`BETA26` promo code passes client validation but fails silently on the server** | Critical |
| 2 | **Password field renders as plain text** — `FloatingInput` has no `type="password"` | High |
| 3 | **Terms of Service says £5.99/month; PaywallScreen shows £24.99** | High |
| 4 | **No cookie consent before PostHog fires** — autocapture + session recording on by default | High |
| 5 | **Weekly Email Digest is listed as a Pro feature but no cron sends it** | High |

---

## 2. Critical

### FUN-CRIT-1 · `BETA26` silently fails — user charged full price

**Files:**
- Client validates: `src/PaywallScreen.tsx:11` — `new Set(["K0DA", "FOUNDERS", "BETA26"])`
- Server maps: `api/stripe-checkout.ts:35-38` — `PROMO_CODE_MAP = { K0DA, FOUNDERS, BETA }`

**What happens:**
1. User enters `BETA26`. Client shows "Beta access applied — 100% off, forever." ✓ (green checkmark)
2. Client sends `promoCode: "BETA26"` to `/api/stripe-checkout`
3. Server: `PROMO_CODE_MAP["BETA26"]` → `undefined` → `stripePromoId` is falsy
4. Checkout session is created **without any discount**
5. User sees a Stripe checkout asking for £24.99 — in contradiction to the "100% off" message

**Fix:** Either add `BETA26: process.env.STRIPE_PROMO_CODE_ID_BETA26` to `PROMO_CODE_MAP` and create the Stripe promo code, or change the client code back to `"BETA"` to match the server.

**Effort:** S (5 min — one-line server change + Stripe dashboard promo code creation)

---

## 3. High

### FUN-HIGH-1 · Password field is plain text

**Files:**
- `src/shared.tsx:550-560` — `FloatingInput` renders `<input>` with no `type` attribute (defaults to `type="text"`)
- `src/KodaAuth.tsx:228` — Password field uses `FloatingInput`

**What happens:** The `placeholder="••••••••"` mimics a password input visually, but entered text is visible in plain text. Any shoulder-surfer, saved-form autocomplete, or browser extension reading the DOM sees the password.

**Fix:** Add `type?: React.HTMLInputTypeAttribute` prop to `FloatingInput`. Pass `type="password"` from `KodaAuth.tsx:228`.

**Effort:** S (15 min)

---

### FUN-HIGH-2 · £5.99 in Terms vs £24.99 in PaywallScreen

**Files:**
- `public/terms.html:63` — "Kōda OS Pro is a monthly subscription billed at £5.99/month"
- `src/PaywallScreen.tsx:200` — "£24.99" monthly / "£199" annual

**Risk:** In UK consumer contract law, the displayed price at checkout is binding. Terms still referencing £5.99 creates legal ambiguity and a poor support surface ("your Terms say £5.99!").

**Fix:** Update `public/terms.html:63` to reflect current pricing (£24.99/month or £199/year). Also update if there's a `dist/terms.html` (it's a build artefact — update source in `public/`).

**Effort:** S (5 min)

---

### FUN-HIGH-3 · PostHog fires before consent

**File:** `src/lib/posthog.ts:12-22`

```typescript
posthog.init(KEY, {
  autocapture:       true,          // DOM events, clicks, inputs
  capture_pageview:  true,
  capture_pageleave: true,
  session_recording: { maskAllInputs: false, maskInputOptions: { password: true } },
  ...
});
```

**What happens:** `initPostHog()` is called on app mount unconditionally (once `VITE_POSTHOG_KEY` is set). Autocapture + session recording begins before the user has acknowledged any data collection. This affects:
- Unauthenticated visitors on the BetaGate screen
- EU/UK users subject to GDPR / UK PECR

`person_profiles: "identified_only"` prevents profile creation before identify — good — but it does **not** prevent analytics cookies being set or session data being collected.

**Fix (minimum):** Show a cookie consent banner on first visit. On rejection: either skip `initPostHog()` entirely, or init with `{ autocapture: false, disable_session_recording: true, opt_out_capturing_by_default: true }` and re-enable after consent.

**Effort:** M (2–4 hours for a minimal banner + consent store)

---

### FUN-HIGH-4 · Weekly Email Digest is Pro-gated but never sent

**Files:**
- `src/PaywallScreen.tsx:14` — "Weekly Email Digest — your edge, summarised" listed as Pro feature
- `api/lib/email.ts:21-56` — `weeklyRecapHtml()` template fully built
- No cron route exists that calls `weeklyRecapHtml()` or `sendEmail()` for weekly recaps

**What happens:** Pro users expect a weekly email. None arrive. This is a silent feature gap that erodes trust in the product.

**Fix:** Create `api/cron/weekly-recap.ts` that:
1. Fetches all active Pro users from `user_kv` where `profile.plan === "pro"` and `profile.weeklyEmail !== false`
2. Reads their trades from the past 7 days
3. Calls `weeklyRecapHtml()` and `sendEmail()`

Wire up in `.github/workflows/` or Vercel Cron (once on Pro Vercel plan). Minimum viable: run Monday 8am UTC.

**Effort:** M (3–5 hours)

---

## 4. Medium

### FUN-MED-1 · Receipt emails use USD currency symbol

**File:** `api/stripe-webhook.ts:198-200`

```typescript
const amount = `$${(invoice.amount_paid / 100).toFixed(2)}`;
```

Kōda charges in GBP (£). Receipt emails will show `$24.99` instead of `£24.99`.

**Fix:** Resolve the currency from `invoice.currency` (Stripe provides `"gbp"`, `"usd"`, etc.) and map to the correct symbol.

```typescript
const currencySymbols: Record<string, string> = { gbp: "£", usd: "$", eur: "€" };
const symbol = currencySymbols[invoice.currency ?? "usd"] ?? invoice.currency?.toUpperCase() ?? "$";
const amount = `${symbol}${(invoice.amount_paid / 100).toFixed(2)}`;
```

**Effort:** S (10 min)

---

### FUN-MED-2 · UpgradeModal always defaults to monthly plan

**File:** `src/UpgradeModal.tsx:30`

```typescript
body: JSON.stringify({ userId, email: userEmail, stripeCustomerId }),
// no `billing` field → defaults to "monthly" in the API
```

Mid-session upgrade modal has no annual option. Users who want the annual plan must use the onboarding paywall flow or navigate back to settings.

**Fix:** Add a billing toggle to `UpgradeModal`, mirroring `PaywallScreen`'s. Pass `billing` in the POST body.

**Effort:** M (1–2 hours)

---

### FUN-MED-3 · No post-payment plan verification on return

**Files:**
- `api/stripe-checkout.ts:174-175` — `success_url: ${APP_URL}?upgraded=1&cid=${customerId}`
- `src/Koda.tsx` handles `?upgraded=1` param but reads plan from the profile, which is updated by webhook

**What happens:** If the Stripe webhook arrives 5–30 seconds after the user returns to the app (normal), the user sees the app in "free" mode briefly. There is no polling or retry for the plan state.

**Fix (minimal):** On `?upgraded=1`, show a "Confirming your subscription…" skeleton for up to 10 seconds while polling `storage.get("koda_profile")` for `plan === "pro"`. Fall back to a "Refresh if your plan hasn't updated" message.

**Effort:** M

---

### FUN-MED-4 · No explicit free-tier feature list at the paywall

**File:** `src/PaywallScreen.tsx`

The paywall lists what Pro includes but never shows what Free includes. "Skip for now — start free" gives no indication of what the user gets on free. This makes the value proposition one-sided and reduces conversion confidence.

**Fix:** Add a brief "Free includes: X trades, basic stats, 1 circle" row below the skip button.

**Effort:** S

---

## 5. Low

### FUN-LOW-1 · `APP_URL` fallback still referenced in env comment

**File:** `api/stripe-checkout.ts:19` — comment says `APP_URL: https://kodatrade.co.uk`

Line 31: `const APP_URL = process.env.APP_URL ?? "https://kodatrade.co.uk"` — current default is correct. Confirm the `APP_URL` env var is set in Vercel (if not set, this falls back correctly, but relying on the fallback is fragile).

**Action:** Verify `APP_URL=https://kodatrade.co.uk` is set in Vercel → Settings → Environment Variables.

**Effort:** XS

---

### FUN-LOW-2 · Stripe promo ID env vars undocumented

**File:** `.env.example`

`STRIPE_PROMO_CODE_ID_K0DA`, `STRIPE_PROMO_CODE_ID_FOUNDERS`, and `STRIPE_PROMO_CODE_ID_BETA` are referenced in `api/stripe-checkout.ts` but missing from `.env.example`. A new deployment will silently skip all promo codes without error.

**Action:** Add all three (plus `STRIPE_PROMO_CODE_ID_BETA26` once added) to `.env.example` with placeholder values.

**Effort:** S

---

### FUN-LOW-3 · No unsubscribe mechanism in weekly email

**File:** `api/lib/email.ts:52`

```html
<a href="https://kodatrade.co.uk" style="color:#65655F">Unsubscribe</a>
```

The unsubscribe link points to the homepage, not an unsubscribe handler. Under UK PECR (and Resend's own ToS), marketing emails must have a functioning unsubscribe mechanism.

**Fix:** Create `/api/email-unsubscribe?token=<signed-jwt>` that sets `profile.weeklyEmail = false`. Use it in the email template.

**Effort:** M

---

## 6. Funnel Flow Map

```
[BetaGate] → password prompt (if VITE_BETA_PASSWORD set)
     ↓
[KodaAuth] → sign up / sign in / OAuth
     ↓
[OnboardingFlow] → welcome → instruments → strategy → ready (4 steps)
     ↓
[PaywallScreen] → billing toggle → promo code → "Start Trading Smarter"
     ↓  (skip)
[Koda main app] — free plan
     ↓  (checkout)
[Stripe Hosted Checkout] → payment
     ↓
[success_url?upgraded=1] → plan promoted by webhook
     ↓
[Koda main app] — pro plan
```

**Drop-off risks (in order):**
1. BetaGate friction — anyone without the password cannot enter
2. Onboarding feels long (4 steps) — no skip per step
3. Paywall cold — no social proof, no trial offer
4. BETA26 discount surprise — see FUN-CRIT-1
5. Post-payment plan latency — see FUN-MED-3

---

## 7. Recommended Sequencing

| Priority | Item | File | Effort |
|---|---|---|---|
| 1 (today) | Fix `BETA26` server map | `api/stripe-checkout.ts:38` | S |
| 2 (today) | Fix password field type | `src/shared.tsx:550`, `src/KodaAuth.tsx:228` | S |
| 3 (today) | Fix receipt currency symbol | `api/stripe-webhook.ts:198` | S |
| 4 (today) | Update Terms pricing | `public/terms.html:63` | S |
| 5 (week 1) | Add cookie consent banner | new component | M |
| 6 (week 1) | Weekly recap cron | `api/cron/weekly-recap.ts` | M |
| 7 (week 2) | Billing toggle in UpgradeModal | `src/UpgradeModal.tsx` | M |
| 8 (week 2) | Post-payment plan poll | `src/Koda.tsx` | M |
| 9 (post-launch) | Unsubscribe handler | new API route | M |
