# Kōda — Waitlist Feature Design

**Date:** 2026-05-31  
**Status:** Approved  
**Scope:** Inline waitlist sign-up on the BetaGate screen

---

## Overview

Replace the "No code? DM @dylon.trades" footer in `BetaGate.tsx` with an inline email
capture form. On submit: store the email in Supabase, send the user a confirmation email
with their position number via Resend, and notify Dylon via Telegram. The invite-code form
above is unchanged.

---

## 1. Data Layer

**New migration:** `supabase/migrations/20260531_waitlist.sql`

```sql
create table public.waitlist (
  id          bigserial primary key,
  email       text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.waitlist enable row level security;
-- Service role only; no client-side access
```

- `id` (bigserial) doubles as the position number — monotonically increasing, returned on
  insert, no separate count query needed.
- RLS enabled; the table is only accessible via the service-role key in API functions.

---

## 2. API Endpoint

**New file:** `api/waitlist.ts`

```
POST /api/waitlist
Content-Type: application/json
Body: { email: string }
```

**Response codes:**

| Code | Meaning |
|------|---------|
| 200 | `{ ok: true, position: number }` — successfully added |
| 409 | `{ ok: true, position: number, existing: true }` — email already on list |
| 400 | `{ error: "email required" }` — missing or invalid email |
| 429 | `{ error: "Too many requests…" }` — rate limited |
| 500 | `{ error: "Internal error" }` — unexpected failure |

**Flow:**

1. CORS + rate limit (5 requests per IP per 15 min, via `api/lib/rateLimit.ts`)
2. Validate email (basic format check — not empty, contains `@`)
3. `INSERT INTO public.waitlist (email) VALUES ($1) RETURNING id` via `supabaseAdmin`
   - On unique-constraint violation (email already exists): query for existing `id`, return 409
4. Send confirmation email via `sendEmail` from `api/lib/email.ts` (new `waitlistConfirmHtml` helper)
5. Fire-and-forget Telegram notification: `📋 New waitlist signup: <email> (#<id>)`
6. Return `{ ok: true, position: id }`

**Dependencies:** `api/lib/supabaseAdmin.ts`, `api/lib/rateLimit.ts`, `api/lib/email.ts` — all existing, no new packages.

---

## 3. UI — `src/BetaGate.tsx`

The existing footer block is replaced with a 3-state micro-form. New parallel state vars
alongside existing invite-code state: `wlEmail`, `wlLoading`, `wlResult`.

**States:**

| State | UI |
|-------|----|
| `idle` | "No invite code?" label + email input + "Join waitlist →" button |
| `loading` | Button shows "Joining…", input disabled |
| `success` | Input/button replaced by `"You're #47 on the list."` (mint) + `"We'll email you when access opens."` subline |
| `already` (409) | Same success treatment: `"You're already on the list (#47)."` |
| `error` | Red inline message: "Something went wrong — try again" |

No new component file. All state lives in `BetaGate` alongside existing state.

---

## 4. Confirmation Email

New helper `waitlistConfirmHtml` added to `api/lib/email.ts`. Follows existing dark-theme
HTML style.

**Subject:** `You're on the Kōda waitlist`

**Body structure:**
- Kicker (monospace uppercase): `Kōda · Waitlist`
- Hero number (large, mint): `You're #47.`
- Body copy: "Kōda is in closed beta. You're on the list — we'll reach out when access opens."
- Pill CTA: `Open kodatrade.co.uk →` (links to `https://kodatrade.co.uk`)
- Footer: "You're receiving this because you joined the Kōda waitlist."

No unsubscribe link — this is a transactional one-off, not a marketing email.

---

## 5. Environment Variables

No new env vars required. Uses existing:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase writes
- `RESEND_API_KEY` — confirmation email
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — Dylon notification

---

## 6. Files Changed / Created

| File | Change |
|------|--------|
| `supabase/migrations/20260531_waitlist.sql` | **New** — waitlist table |
| `api/waitlist.ts` | **New** — POST endpoint |
| `api/lib/email.ts` | **Edit** — add `waitlistConfirmHtml` |
| `src/BetaGate.tsx` | **Edit** — replace footer with inline form |

---

## 7. Out of Scope

- Admin UI to view/export waitlist (use Supabase dashboard directly)
- Waitlist invite flow (manually DM codes for now)
- Referral / share-your-spot mechanic
- Unsubscribe / waitlist management emails
