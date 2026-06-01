# Kōda — Cleanup, Waitlist & Welcome Letter
**Date:** 2026-05-31  
**Status:** Approved  
**Scope:** Three independent work streams to ship post-beta-launch

---

## 1. Waitlist

### Goal
Let visitors who don't have a beta invite code join a newsletter/pre-launch waitlist directly from the gate screen.

### Entry point
`BetaGate.tsx` footer currently reads: *"No code? DM @dylon.trades on Instagram"*  
Replace with: *"No code? Join the waitlist →"* (same mono style, mint colour, clickable text).  
Clicking sets `showWaitlist = true` in BetaGate, which renders `<WaitlistSignup onBack={…} />` — full-screen, same slide-up pattern as `<BetaWelcome />`.

### Component
New file: `src/WaitlistSignup.tsx`  
Matches BetaGate/BetaWelcome visual language (palette, fonts, animation).

**Form fields:**
- First name (text input)
- Email (email input)
- Trading style (select): Day trader / Swing trader / Prop firm trader / Investor / Other

**Submit:** Client-side Supabase insert — no new Vercel function. Stays at 12/12 function limit.

**States:**
- Idle: form with "Join the waitlist →" CTA
- Loading: button shows "Adding you…", disabled
- Success: form replaced with "You're on the list. We'll be in touch." + back link to gate
- Error: inline error below CTA ("Something went wrong — try again.")

**Back link:** Small "← Back" at top of WaitlistSignup returns to the gate (sets `showWaitlist = false`).

### Database
New migration: `supabase/migrations/20260531_waitlist.sql`

```sql
create table public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  trading_style text not null,
  source       text not null default 'beta-gate',
  created_at   timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Anyone can add themselves; nobody can read entries from the client
create policy "anon insert" on public.waitlist
  for insert to anon with check (true);
```

Run in Supabase SQL Editor after code ships.

---

## 2. Welcome Letter

### Goal
Shift `BetaWelcome.tsx` from a single-founder voice ("I", "— Dylon") to a Kōda team voice ("we", "— The Kōda team"), and add a brief origin sentence to section 01 that explains *why* this was built.

### Copy changes

**Header:** Keep *"You're in. Let's build this together."*

**Section 01 — What is Kōda:**  
Add 1–2 sentences on origin before or after the current description. Theme: the spreadsheet problem — serious retail traders deserve a purpose-built tool, not a cobbled-together tracker.

**Section 02 — What the beta is for:**  
- "I want real feedback" → "we want real feedback"
- "before opening up to the public" — keep

**Section 03 — What we need from you:**  
- Header: "What I need from you" → "What we need from you"
- "tell me" → "tell us"
- DM link stays as `@dylon.trades` (real channel)

**Section 04 — A few things to know:**  
No changes needed.

**Footer sign-off:**  
"— Dylon, founder of Kōda" → "— The Kōda team"

---

## 3. Cleanup

Three passes in order. Run `npm run typecheck && npm test -- --run` after each pass.

### Pass 1 — Project hygiene

**Audit docs:** Move the six pre-launch audit files to `archive/audits/`:
- `AUDIT_INDEX.md`
- `AUDIT.md`
- `DEV_ENV_AUDIT.md`
- `UX_AUDIT.md`
- `FUNNEL_AUDIT.md`
- `CSV_IMPORT_AUDIT.md`

**NEXT_SESSION.md:** Rewrite to reflect post-beta state. The blocking items (§3) are done. Carry forward: Batch 2 compliance (still needs UK Ltd details), M2 signed URLs, M7 sender trigger. List what was extracted this session as it completes.

**CLAUDE.md:** Verify storage keys table and line counts are current. Update any stale references.

### Pass 2 — Monolith extractions

Execute in this order (safest-first — each is a leaf or near-leaf in the JSX tree):

| # | What | Source location | Destination |
|---|------|----------------|-------------|
| 1 | `<TradeDetailCard>` | `Koda.tsx` ~line 2895–3090 (~200 lines) | `src/components/TradeDetailCard.tsx` |
| 2 | `<TradovateLiveModal>` | `Koda.tsx` modal section (~135 lines) | `src/components/TradovateLiveModal.tsx` |
| 3 | `useStripeReturn`, `useDeepLink`, `useDraftCount` effects → hooks | `Koda.tsx` effects section | `src/hooks/useStripeReturn.ts`, `useDeepLink.ts`, `useDraftCount.ts` |
| 4 | HOME route sections: `HomeHeroCard`, `DailyRiskDashboard`, `MonthlyReportCard`, `PlanRow` | `Koda.tsx` ~line 1687–2686 (~1000 lines) | `src/components/` |

**Process per extraction:**
1. Identify the exact line range and all props the block needs
2. Create the new file with the extracted component
3. Import and call it from `Koda.tsx` in place of the inlined JSX
4. `npm run typecheck && npm test -- --run`
5. `wc -l src/Koda.tsx` — confirm reduction
6. Commit

Target: `Koda.tsx` ~2800 lines after all extractions (from 4101).

### Pass 3 — TypeScript hygiene

Fix `: any` / `as any` casts in files touched during Pass 2 first. Then sweep remaining flagged files from `AUDIT.md §3.4`. Replace with proper types or `unknown` + narrowing. Do not introduce new type assertions.

---

## Out of scope for this session

- Batch 2 compliance (needs UK Ltd details from Dylon)
- M2 signed URLs
- M7 sender trigger
- Resend email setup
- Marketing pixels
- Full TS migration for untouched files (defer to post-extraction sprint)
