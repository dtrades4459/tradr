# Trust Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six trust/polish issues across the Kōda app: mask password input, switch receipt/UI currency from $ to £, sync terms page price to current £24.99, harden `.env` from git, scrub personal email from `.env.example` and public legal pages, and clean up remaining stale `tradrjournal.xyz` strings in shipped artifacts.

**Architecture:** Each fix is a small, independent edit. They share no state and can ship together as one PR. The only structural change is adding an optional `type` prop to `FloatingInput` in `src/shared.tsx` so KodaAuth password fields can mask input.

**Tech Stack:** React 19 + TypeScript + Vite, HTML, Git, PowerShell.

---

## File Map

**Modify:**
- `src/shared.tsx` — add `type?: string` prop to `FloatingInput`, pass to `<input>`
- `src/KodaAuth.tsx` — pass `type="password"` to password and new-password `FloatingInput` instances
- `src/UpgradeModal.tsx` — `$24.99` → `£24.99` (2 places)
- `src/Koda.tsx` — `$24.99/mo →` → `£24.99/mo →` (1 place)
- `public/terms.html` — `£5.99/month` → `£24.99/month`; personal email → support email
- `public/privacy.html` — personal email → support email; `tradrjournal.xyz` → `kodatrade.co.uk`
- `public/faq.html` — personal email → support email
- `index.html` — canonical URL `tradrjournal.xyz` → `kodatrade.co.uk`
- `playwright.config.ts` — default `baseURL` `tradrjournal.xyz` → `kodatrade.co.uk`
- `.github/workflows/ci.yml` — smoke-test `BASE_URL` `tradrjournal.xyz` → `kodatrade.co.uk`
- `.env.example` — `VAPID_EMAIL=mailto:dnyland420@gmail.com` → `VAPID_EMAIL=mailto:you@example.com`

**Verify (no edits if clean):**
- `.gitignore` — confirm `.env` line is present
- Git index — confirm `.env` is NOT tracked

**Support email convention:** `support@kodatrade.co.uk` is used as the replacement for `dnyland420@gmail.com` in public pages (confirmed by Dylon 2026-05-29).

---

## Task 1: Add `type` prop to `FloatingInput`

**Files:**
- Modify: `src/shared.tsx:530-560`

- [ ] **Step 1: Add `type` to the prop type and `<input>`**

In `src/shared.tsx` at line 530, change:

```tsx
export function FloatingInput({ C, label, value, placeholder, action, onChange }: {
  C: Theme; label: string; value?: string; placeholder?: string;
  action?: React.ReactNode; onChange?: (v: string) => void;
}) {
```

to:

```tsx
export function FloatingInput({ C, label, value, placeholder, action, onChange, type }: {
  C: Theme; label: string; value?: string; placeholder?: string;
  action?: React.ReactNode; onChange?: (v: string) => void; type?: string;
}) {
```

Then in the same component at line 550, change:

```tsx
        {onChange ? (
          <input
            value={value || ""}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            style={{
```

to:

```tsx
        {onChange ? (
          <input
            type={type || "text"}
            value={value || ""}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            style={{
```

- [ ] **Step 2: Verify TypeScript compile**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS — no new errors.

---

## Task 2: Mask password fields in KodaAuth

**Files:**
- Modify: `src/KodaAuth.tsx:167-168` (new-password flow)
- Modify: `src/KodaAuth.tsx:228-229` (sign-in/sign-up flow)

- [ ] **Step 1: Mask the new-password input**

In `src/KodaAuth.tsx` around line 167, change:

```tsx
          <FloatingInput C={C} label="New password" placeholder="min. 6 characters" value={newPassword}
            onChange={v => setNewPassword(v)} />
```

to:

```tsx
          <FloatingInput C={C} label="New password" placeholder="min. 6 characters" value={newPassword}
            onChange={v => setNewPassword(v)} type="password" />
```

- [ ] **Step 2: Mask the sign-in/sign-up password input**

In `src/KodaAuth.tsx` around line 228, change:

```tsx
        <FloatingInput C={C} label="Password" value={password} placeholder={mode === "signup" ? "min. 6 characters" : "••••••••"}
          onChange={v => setPassword(v)} />
```

to:

```tsx
        <FloatingInput C={C} label="Password" value={password} placeholder={mode === "signup" ? "min. 6 characters" : "••••••••"}
          onChange={v => setPassword(v)} type="password" />
```

- [ ] **Step 3: Smoke-test in dev**

Run: `npm run dev`
Open browser to sign-in page → type in the password field → confirm characters appear as `•` not plain text. Open the "Forgot password" → reset → new-password flow and confirm the same. Close dev server.

- [ ] **Step 4: Commit**

```powershell
git add src/shared.tsx src/KodaAuth.tsx
git commit -m "fix(auth): mask password inputs with type=password"
```

---

## Task 3: Switch in-app pricing displays from $ to £

**Files:**
- Modify: `src/UpgradeModal.tsx:123` and `src/UpgradeModal.tsx:160`
- Modify: `src/Koda.tsx:2287`

- [ ] **Step 1: Replace `$` with `£` in UpgradeModal price**

In `src/UpgradeModal.tsx` around line 123, change:

```tsx
          <span style={{ fontFamily: DISPLAY, fontSize: "42px", fontWeight: 700, color: C.text ?? "#F2F2EE", lineHeight: 1, letterSpacing: "-0.03em" }}>$24.99</span>
```

to:

```tsx
          <span style={{ fontFamily: DISPLAY, fontSize: "42px", fontWeight: 700, color: C.text ?? "#F2F2EE", lineHeight: 1, letterSpacing: "-0.03em" }}>£24.99</span>
```

- [ ] **Step 2: Replace `$` with `£` in UpgradeModal CTA**

In `src/UpgradeModal.tsx` around line 160, change:

```tsx
            <span>{loading ? "Redirecting…" : "Upgrade Now — $24.99/mo"}</span>
```

to:

```tsx
            <span>{loading ? "Redirecting…" : "Upgrade Now — £24.99/mo"}</span>
```

- [ ] **Step 3: Replace `$` with `£` in Koda.tsx upsell label**

In `src/Koda.tsx` around line 2287, change:

```tsx
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.live }}>$24.99/mo →</span>
```

to:

```tsx
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.live }}>£24.99/mo →</span>
```

- [ ] **Step 4: Confirm no other `$24.99`, `$5.99`, or `$9.99` strings remain**

Run (PowerShell):
```powershell
Select-String -Path "src\*.tsx","src\**\*.tsx" -Pattern '\$\d+\.\d{2}'
```
Expected: empty output (no UI files reference `$NN.NN` strings). If any new hits appear, fix them inline before committing.

- [ ] **Step 5: Commit**

```powershell
git add src/UpgradeModal.tsx src/Koda.tsx
git commit -m "fix(pricing): show £ not $ in upgrade modal and upsell"
```

---

## Task 4: Update terms page price to £24.99

**Files:**
- Modify: `public/terms.html:63`

- [ ] **Step 1: Replace `£5.99/month` with `£24.99/month`**

In `public/terms.html` around line 63, change:

```html
    <p>Kōda OS Pro is a monthly subscription billed at £5.99/month (or as otherwise stated at checkout). Payments are processed by Stripe. By subscribing, you authorise Stripe to charge your payment method on a recurring monthly basis.</p>
```

to:

```html
    <p>Kōda OS Pro is a monthly subscription billed at £24.99/month (or as otherwise stated at checkout). Payments are processed by Stripe. By subscribing, you authorise Stripe to charge your payment method on a recurring monthly basis.</p>
```

- [ ] **Step 2: Confirm no other `5.99` strings remain in `public/`**

Run (PowerShell):
```powershell
Select-String -Path "public\*.html" -Pattern '5\.99|9\.99'
```
Expected: empty output.

- [ ] **Step 3: Commit**

```powershell
git add public/terms.html
git commit -m "fix(terms): update Pro price to £24.99/month"
```

---

## Task 5: Verify `.env` is gitignored and untracked

**Files:**
- Verify: `.gitignore`
- Verify: git index

- [ ] **Step 1: Confirm `.env` line is in `.gitignore`**

Run (PowerShell):
```powershell
Select-String -Path .gitignore -Pattern '^\.env$'
```
Expected: one match — `.gitignore:14:.env` (line number may differ).

If no match, append `.env` to `.gitignore` and continue.

- [ ] **Step 2: Confirm `.env` is NOT tracked by git**

Run (PowerShell):
```powershell
git ls-files --error-unmatch .env
```
Expected: error — `error: pathspec '.env' did not match any file(s) known to git`. This means the file is already untracked. **Skip Step 3.**

If the command succeeds (prints `.env`), `.env` is tracked and must be removed from the index — continue to Step 3.

- [ ] **Step 3 (only if Step 2 succeeded): Remove `.env` from the git index**

Run (PowerShell):
```powershell
git rm --cached .env
git commit -m "chore(security): stop tracking .env"
```

The file stays on disk; only the index entry is removed. Future pushes will not include it.

- [ ] **Step 4: Confirm `.env.local` and `.env.*.local` are also covered**

Run (PowerShell):
```powershell
Select-String -Path .gitignore -Pattern '\.env\.local|\.env\.\*\.local'
```
Expected: two matches — both already present from the existing `.gitignore`. If missing, add them.

---

## Task 6: Scrub personal email from `.env.example` and public legal pages

**Files:**
- Modify: `.env.example:71`
- Modify: `public/terms.html:85`
- Modify: `public/privacy.html:34, 82, 94`
- Modify: `public/faq.html:50`

- [ ] **Step 1: Replace personal email in `.env.example`**

In `.env.example` at line 71, change:

```
VAPID_EMAIL=mailto:dnyland420@gmail.com
```

to:

```
VAPID_EMAIL=mailto:you@example.com
```

- [ ] **Step 2: Replace personal email in `public/terms.html`**

In `public/terms.html` around line 85, change:

```html
    <p>Questions about these Terms? Email <a href="mailto:dnyland420@gmail.com">dnyland420@gmail.com</a>.</p>
```

to:

```html
    <p>Questions about these Terms? Email <a href="mailto:support@kodatrade.co.uk">support@kodatrade.co.uk</a>.</p>
```

- [ ] **Step 3: Replace personal email in `public/privacy.html` (3 places)**

In `public/privacy.html` around line 34, change:

```html
    <p>Kōda OS ("we", "us", "our") is a trading journal application available at <a href="https://tradrjournal.xyz">tradrjournal.xyz</a>. We are operated by an independent developer (Dylon Nyland). For privacy enquiries, contact us at <a href="mailto:dnyland420@gmail.com">dnyland420@gmail.com</a>.</p>
```

to:

```html
    <p>Kōda OS ("we", "us", "our") is a trading journal application available at <a href="https://kodatrade.co.uk">kodatrade.co.uk</a>. We are operated by an independent developer (Dylon Nyland). For privacy enquiries, contact us at <a href="mailto:support@kodatrade.co.uk">support@kodatrade.co.uk</a>.</p>
```

In `public/privacy.html` around line 82, change:

```html
    <p>To exercise any of these rights, email <a href="mailto:dnyland420@gmail.com">dnyland420@gmail.com</a>.</p>
```

to:

```html
    <p>To exercise any of these rights, email <a href="mailto:support@kodatrade.co.uk">support@kodatrade.co.uk</a>.</p>
```

In `public/privacy.html` around line 94, change:

```html
    <p>Questions about this policy? Email us at <a href="mailto:dnyland420@gmail.com">dnyland420@gmail.com</a>.</p>
```

to:

```html
    <p>Questions about this policy? Email us at <a href="mailto:support@kodatrade.co.uk">support@kodatrade.co.uk</a>.</p>
```

- [ ] **Step 4: Replace personal email in `public/faq.html`**

In `public/faq.html` around line 50, change:

```html
  <p style="font-family:'Geist Mono',monospace;font-size:11px;color:#45453F;letter-spacing:0.10em">Still have questions? <a href="mailto:dnyland420@gmail.com">Email us</a></p>
```

to:

```html
  <p style="font-family:'Geist Mono',monospace;font-size:11px;color:#45453F;letter-spacing:0.10em">Still have questions? <a href="mailto:support@kodatrade.co.uk">Email us</a></p>
```

- [ ] **Step 5: Confirm no other `dnyland420@gmail.com` strings remain**

Run (PowerShell):
```powershell
Select-String -Path ".env.example","public\*.html","src\*.tsx","src\**\*.tsx" -Pattern 'dnyland420'
```
Expected: empty output.

- [ ] **Step 6: Commit**

```powershell
git add .env.example public/terms.html public/privacy.html public/faq.html
git commit -m "fix(privacy): replace personal email with support@kodatrade.co.uk in public pages"
```

---

## Task 7: Replace remaining `tradrjournal.xyz` strings with `kodatrade.co.uk`

**Files:**
- Modify: `index.html:31` (canonical URL)
- Modify: `public/privacy.html:34` (anchor + display) — *already done in Task 6, Step 3*
- Modify: `playwright.config.ts:20`
- Modify: `.github/workflows/ci.yml:85`

- [ ] **Step 1: Update canonical URL in `index.html`**

In `index.html` around line 31, change:

```html
    <link rel="canonical" href="https://tradrjournal.xyz/" />
```

to:

```html
    <link rel="canonical" href="https://kodatrade.co.uk/" />
```

- [ ] **Step 2: Update Playwright default base URL**

In `playwright.config.ts` around line 20, change:

```ts
    baseURL: process.env.BASE_URL ?? "https://tradrjournal.xyz",
```

to:

```ts
    baseURL: process.env.BASE_URL ?? "https://kodatrade.co.uk",
```

- [ ] **Step 3: Update smoke-test BASE_URL in CI**

In `.github/workflows/ci.yml` around line 85, change:

```yaml
          BASE_URL: https://tradrjournal.xyz
```

to:

```yaml
          BASE_URL: https://kodatrade.co.uk
```

- [ ] **Step 4: Confirm no other `tradrjournal.xyz` strings remain in shipped surfaces**

Run (PowerShell):
```powershell
Select-String -Path "index.html","public\*.html","src\**\*.tsx","src\**\*.ts","playwright.config.ts",".github\workflows\*.yml" -Pattern 'tradrjournal\.xyz'
```
Expected: empty output. (Strings inside `DEPLOYMENT.md` / `CLAUDE.md` are docs and out of scope.)

- [ ] **Step 5: Smoke-test build still passes**

Run: `npm run build`
Expected: build succeeds with no new errors.

- [ ] **Step 6: Commit**

```powershell
git add index.html playwright.config.ts .github/workflows/ci.yml
git commit -m "fix(branding): point canonical URL and CI smoke-test at kodatrade.co.uk"
```

---

## Final Verification

- [ ] **Step 1: Run lint + typecheck + build**

```powershell
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.api.json --noEmit
npm run build
```
Expected: all four PASS with no new errors or warnings introduced by this PR.

- [ ] **Step 2: Manual UI verification in dev**

```powershell
npm run dev
```

Open browser to localhost dev URL and confirm:
- Sign-in password field shows `•` characters, not plain text.
- Upgrade modal shows `£24.99`, not `$24.99`.
- Upsell pill in Koda.tsx shows `£24.99/mo →`.
- `/terms.html` shows `£24.99/month` and `support@kodatrade.co.uk`.
- `/privacy.html` references `kodatrade.co.uk` and shows `support@kodatrade.co.uk`.
- `/faq.html` "Email us" link points at `support@kodatrade.co.uk`.

- [ ] **Step 3: Push and open PR**

```powershell
git checkout -b fix/trust-fixes-may-29
git push -u origin fix/trust-fixes-may-29
```

Open PR, watch CI, smoke-test the Vercel preview URL, merge once green.
