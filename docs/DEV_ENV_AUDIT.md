# Kōda Dev Environment Audit
_Generated 2026-05-27 — read-only inspection, no config was modified._

---

## SECURITY

> No plaintext secrets found in the current git tree. Two findings related to committed example files:

**S1 — Real Supabase project URL in tracked `.env.local.example`**
Commit `95fbe4f` added `.env.local.example` with:
```
VITE_SUPABASE_URL=https://vifwjwsndchnrpvfgrmg.supabase.co
```
The actual project reference ID is baked into the file. This URL is not a secret (it appears in the browser bundle too), but committing the real project ID to a public repo's `.env.local.example` is poor hygiene. Replace with `https://your-project.supabase.co`.

**S2 — `.gitignore` duplicate entry**
`.gitignore` has `.claude/` listed twice (lines 30–31). Cosmetic only; no security risk.

---

## 1 — Top 5 Quick Wins

| # | Action | File | Time |
|---|--------|------|------|
| 1 | Add `"typecheck": "tsc --noEmit"` npm script | `package.json` | 2 min |
| 2 | Add `api/**/*.ts` to `lint-staged` scope — API files skip pre-commit lint today | `package.json` | 3 min |
| 3 | Add `.nvmrc` (content: `20`) + `"engines": { "node": ">=20" }` to package.json | new file + `package.json` | 5 min |
| 4 | Rebrand `CLAUDE.md` header "TRADR →" to "Kōda", fix 3 outdated references | `CLAUDE.md` | 15 min |
| 5 | Replace real Supabase URL in `.env.local.example` with generic placeholder | `.env.local.example` | 2 min |

---

## 2 — Findings by Section

### 1 · Package Management

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Package manager | `npm` (lockfile v3, `package-lock.json`) — single lockfile, no conflicts | No change needed | ✓ | — |
| Missing `typecheck` script | `package.json` has no `typecheck` script; CI calls `npx tsc --noEmit` directly | Add `"typecheck": "tsc --noEmit"` | Med | S |
| Node version not pinned | No `.nvmrc`; no `engines` field; CI hardcodes `node-version: 20` in YAML | Add `.nvmrc` with `20`; add `"engines": { "node": ">=20" }` | Med | S |
| `legacy-peer-deps=true` in `.npmrc` | Silently ignores peer dependency conflicts across all installs | Investigate root cause; remove once resolved. If still needed, add a comment explaining which conflict requires it. | Med | S |
| `stripe` + `web-push` in `dependencies` | Both are server-only (used in `api/` functions only) | Could move to `devDependencies`; Vercel bundles them regardless, so it's cosmetic. Low priority. | Low | S |
| `STRIPE_PRICE_ID_ANNUAL` in `.env.example` | Documented; `api/stripe-checkout.ts` reads it. But no annual pricing UI exists yet. | Keep; add a comment saying "annual pricing — not live yet". | Low | S |

### 2 · TypeScript Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `strict: true` | Set in both `tsconfig.app.json` and `tsconfig.node.json` ✓ | — | ✓ | — |
| `noFallthroughCasesInSwitch` | Set ✓ | — | ✓ | — |
| `noUncheckedIndexedAccess` | **Not set** in either tsconfig | Add to `tsconfig.app.json`. Catches many silent `undefined` bugs from array indexing. Will surface some existing issues — plan a fix session. | Med | M |
| `noUnusedLocals` / `noUnusedParameters` | Only in `tsconfig.node.json` (covers `vite.config.ts` only), **not** in `tsconfig.app.json` | Add to `tsconfig.app.json`; ESLint `no-unused-vars` is only a warning today. | Med | M |
| Build target mismatch | `tsconfig.app.json` targets ES2023 but Vite `build.target` is unset (defaults to ES2015) | Add `build: { target: 'es2022' }` to `vite.config.ts` to align with tsconfig and drop unnecessary polyfills | Low | S |
| `tsconfig.app.json` exclude list | Excludes `src/TRADR (1-4).tsx` — suggests OneDrive backup copies exist locally | Confirm these don't exist; if they do, delete them. The exclude is correct. | Low | S |
| `tsconfig.json` root | Is a project-references wrapper delegating to `tsconfig.app.json` + `tsconfig.node.json` ✓ | — | ✓ | — |
| Path aliases | None defined in tsconfig or Vite | `@/` → `src/` alias is a common quality-of-life improvement; not blocking | Low | S |

### 3 · Linting and Formatting

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| ESLint config | Flat config (`eslint.config.js`), ESLint 9, typescript-eslint, react-hooks, react-refresh ✓ | — | ✓ | — |
| All key rules set to `warn` | `no-explicit-any`, `exhaustive-deps`, all React Compiler rules — all `warn`. CI passes regardless of warning count. | Promote `no-explicit-any` → `error` (or `"warn"` with `--max-warnings 0` in CI lint script). At minimum, add `--max-warnings 0` to `npm run lint` or the CI step. | High | S |
| No Prettier | No `.prettierrc`, no `prettier` package | Add Prettier with `@trivago/prettier-plugin-sort-imports`; wire into pre-commit. Without it, formatting is not enforced and will diverge. | Med | M |
| `api/` not in lint-staged | `lint-staged` only runs ESLint on `src/**/*.{ts,tsx}`. API files are checked in CI but not on commit. | Add `"api/**/*.ts": "eslint"` to `lint-staged` config | Med | S |
| React Compiler rules | 11 React Compiler-specific rules all set to `warn` | These are fine as-is while you're mid-migration. Add a comment with a target date or flag to promote them. | Low | S |

### 4 · Git Hygiene

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `.gitignore` | `.env`, `.env.local`, `.env.*.local`, `dist`, `node_modules`, `.vscode/*`, `.DS_Store` all covered ✓ | Remove duplicate `.claude/` entry (appears twice) | Low | S |
| `.env.local.example` tracked with real URL | Contains `https://vifwjwsndchnrpvfgrmg.supabase.co` (actual project ID) | Replace with `https://your-project.supabase.co` | Med | S |
| No `.gitattributes` global normalisation | Only `.husky/*` and `*.sh` get LF enforcement. No `* text=auto`. CI is seeing CRLF warnings on Windows commits. | Add `* text=auto eol=lf` as first line in `.gitattributes` to normalise all text files | Med | S |
| Stale remote branches | 25 remote branches; many old feature branches (`feat/tradr-os-redesign`, `feat/premium-polish-v1`, `feat/analytics-desktop-social`, `refactor/split-components`, `fix/accessibility-d`, `dtrades4459-patch-1`, etc.) | Run `git remote prune origin` then delete merged stale branches from GitHub | Low | M |
| Local `feat/koda-rename` branch | Exists locally; merged equivalent exists remotely | Delete: `git branch -d feat/koda-rename` | Low | S |
| Commit conventions | Pattern is clear and consistent: `feat:`, `fix:`, `chore:`, `refactor:` with body on PRs ✓ | — | ✓ | — |
| `tasks/lessons.md` | Referenced in `CLAUDE.md` Rule 3 but not in tracked files list | Create the file and commit it, or update Rule 3 if the pattern has changed | Low | S |

### 5 · Pre-commit Hooks

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Husky + lint-staged | Both present and wired ✓ | — | ✓ | — |
| Pre-commit: runs lint-staged | `npx lint-staged` → ESLint on staged `src/**/*.{ts,tsx}` | Add `api/**/*.ts` to scope (see §3) | Med | S |
| Pre-commit: runs tsc | `npx tsc --noEmit` — full project typecheck on every commit ✓ | Once you have a `typecheck` script, change to `npm run typecheck` | Low | S |
| Pre-commit: pattern guards | Blocks `: any` annotations and `eslint-disable` comments (except `exhaustive-deps`) — excellent practice ✓ | — | ✓ | — |
| No pre-push hook | Currently no pre-push checks | Could add `npm test` on pre-push for unit tests | Low | S |

### 6 · Environment Variables

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `.env.example` completeness | All `import.meta.env.*` and `process.env.*` vars used in source have entries ✓ | — | ✓ | — |
| Missing `STRIPE_PRICE_ID_MONTHLY` in CLAUDE.md | `.env.example` and code both use it; CLAUDE.md env var table only lists `STRIPE_PRICE_ID` | Update CLAUDE.md table | Low | S |
| CLAUDE.md env table incomplete | Missing: `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`, `STRIPE_PROMO_CODE_ID_*` (3 keys), `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `VAPID_*` (3 keys) | Add all missing vars to the table in CLAUDE.md | Med | S |
| `TRADR_ENCRYPTION_KEY` rename pending | Both `.env.example` and CLAUDE.md note the rename to `KODA_ENCRYPTION_KEY` | Schedule this with the next Vercel env var update session. Requires: update `api/lib/cryptoUtils.ts`, update `.env.example`, update Vercel dashboard. | Med | M |
| `VITE_SUPABASE_URL` used in api handler | `api/stripe-checkout.ts` reads `process.env.VITE_SUPABASE_URL` — Vite-prefixed vars are not available server-side on Vercel unless explicitly set as a server env var | Confirm this var is also set as a non-`VITE_` var in Vercel (it is — `SUPABASE_URL` is also set), then remove the `VITE_` read from the API handler | Med | S |

### 7 · Vite Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Build target unset | Vite defaults to ES2015 transform. TS targets ES2023. Mismatch = unnecessary polyfills. | Add `build: { target: 'es2022' }` | Low | S |
| Sourcemaps disabled | No `sourcemap` config; defaults to `false` in prod. Sentry is wired but will report minified stacks. | Add `build: { sourcemap: true }` (or `'hidden'` for security). This also requires configuring `vite-plugin-sentry` or uploading sourcemaps in CI. | Med | M |
| Chunk strategy | Manual chunks for react + supabase vendors ✓ | Could also extract Stripe + posthog but current split is reasonable | Low | S |
| PWA dev mode enabled | `devOptions.enabled: true` — service worker runs in dev. Can cause HMR confusion. | Set `devOptions.enabled: false` unless you actively need to test offline behaviour during dev | Low | S |
| No path aliases | All imports use relative paths (`../../`) | Add `resolve: { alias: { '@': '/src' } }` and matching `tsconfig` paths | Low | M |
| All plugins used | `@vitejs/plugin-react` + `vite-plugin-pwa` — both active and needed ✓ | — | ✓ | — |

### 8 · CLAUDE.md

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Title says "TRADR" | `# TRADR — Claude Code Operating Rules` | Change to `# Kōda — Claude Code Operating Rules` | High | S |
| "What TRADR is" section | Still says "TRADR" throughout | Rename to "What Kōda is"; update description to reflect current branding | High | S |
| API broker file references | Lists `api/broker/connect.ts` and `api/broker/disconnect.ts` as separate files | Update to `api/broker/[action].ts` (merged in audit Day 1) | Med | S |
| Cron schedule mismatch | CLAUDE.md Broker Sync diagram shows "every 5 min" but `vercel.json` is now `*/15 * * * *` | Update diagram comment to "every 15 min via Vercel Cron" | Med | S |
| `tradr-redesign.html`, `dist-verify/` in backlog | CLAUDE.md backlog item mentions deleting these | If they don't exist locally, remove the backlog item | Low | S |
| Env var table incomplete | See §6 — missing 10+ vars | Update the table | Med | S |
| Code pattern shows `(window as any).storage` | Legacy pattern; `window.storage` is now typed via the shim | Update example to not require the cast | Low | S |
| Feature flag example uses `window.tradrFlags` | Should be `window.kodaFlags` per the rebrand | Update the example | Low | S |

### 9 · CI / Deploy

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| CI jobs | `build` (lint + tsc + build) + `test` (unit tests) + `e2e` (Playwright, non-blocking) ✓ | — | ✓ | — |
| Lint allows warnings | `npm run lint` exits 0 with any number of warnings | Add `--max-warnings 0` to the lint script or CI lint step | High | S |
| No `typecheck` script | CI runs `npx tsc --noEmit` directly, not via npm script | Standardise with `npm run typecheck` after adding the script | Low | S |
| Node version not from `.nvmrc` | CI hardcodes `node-version: 20` in both jobs (duplicated). Not derived from a single source. | After adding `.nvmrc`, use `node-version-file: .nvmrc` in all CI jobs | Med | S |
| Dual cron conflict | `sync-cron.yml` fires every **5 min** via GitHub Actions; `vercel.json` fires every **15 min** via Vercel Cron. Both are active — sync runs at 5-min intervals regardless of which triggers it. The comment says GH Actions "replaces" the Vercel Cron, but Vercel Cron was set to 15 min in the last audit session. | Decide: if GH Actions at 5 min is the intended schedule, remove the Vercel cron entry for `sync`. If 15 min is fine, disable `sync-cron.yml`. Running both is harmless but wasteful. | Med | S |
| E2E smoke test secrets | `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD` referenced; `continue-on-error: true` | Confirm secrets are set in GitHub repo settings. If not, the job passes vacuously. | Med | S |
| Branch protection | CLAUDE.md says "Set up branch protection on main" is a backlog item | Enable required status check for `build` job on `main` in GitHub → Settings → Branches | Med | S |

### 10 · Editor Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `.editorconfig` | **Not present** at repo root | Add `.editorconfig` with `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `charset = utf-8`, `trim_trailing_whitespace = true`, `insert_final_newline = true` | Med | S |
| `.vscode/` directory | **Not present** — only `.vscode/extensions.json` is excluded from `.gitignore` (implying it should exist but doesn't) | Add `.vscode/extensions.json` with recommended extensions: ESLint, Prettier (once added), TypeScript, Tailwind (if used), Vite. Add `.vscode/settings.json` with `editor.formatOnSave`, `eslint.validate: ["typescript", "typescriptreact"]`. | Low | S |

---

## 3 — Suggested Sequencing

### Session A — Baseline hygiene (30 min)
_Everything here is independent and safe to do in one pass._

1. Add `"typecheck": "tsc --noEmit"` script to `package.json`
2. Add `api/**/*.ts` to `lint-staged` in `package.json`
3. Add `.nvmrc` (content: `20`); add `"engines": { "node": ">=20" }` to `package.json`
4. Add `* text=auto eol=lf` as first line of `.gitattributes`
5. Remove duplicate `.claude/` line from `.gitignore`
6. Replace real Supabase URL in `.env.local.example`
7. Add `.editorconfig`

### Session B — CI hardening (20 min)
_Depends on Session A for consistent `typecheck` script._

1. Add `--max-warnings 0` to `npm run lint` (or to the CI lint command)
2. Change CI `node-version: 20` → `node-version-file: .nvmrc` in both jobs
3. Decide on dual-cron conflict: keep GH Actions at 5 min OR Vercel at 15 min, disable the other
4. Confirm `SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` secrets exist in GitHub

### Session C — CLAUDE.md rebrand + accuracy (20 min)
_No code dependencies._

1. Rename "TRADR" → "Kōda" in title, "What TRADR is" section, code pattern examples
2. Update API file references: `broker/connect.ts` + `broker/disconnect.ts` → `broker/[action].ts`
3. Fix cron schedule in Broker Sync diagram (5 min → 15 min)
4. Add missing env vars to the CLAUDE.md table
5. Create and commit `tasks/lessons.md` (even if empty initially)

### Session D — TypeScript strictness (45 min)
_May surface new TS errors that need fixes._

1. Add `"noUnusedLocals": true, "noUnusedParameters": true` to `tsconfig.app.json`
2. Add `"noUncheckedIndexedAccess": true` to `tsconfig.app.json`
3. Fix any new TS errors that surface (likely in chart/data access patterns)
4. Align Vite build target: add `build: { target: 'es2022' }`

### Session E — Prettier + editor experience (30 min)
_Independent; Prettier config only needs to match existing code style._

1. `npm install -D prettier`
2. Add `.prettierrc` (match existing style: 2 spaces, double quotes, semicolons)
3. Add `prettier --write` to lint-staged for `*.{ts,tsx,json,md}`
4. Add `.vscode/extensions.json` and `.vscode/settings.json`

### Session F — Env var cleanup (20 min)
_Coordinate with Vercel dashboard session._

1. Rename `TRADR_ENCRYPTION_KEY` → `KODA_ENCRYPTION_KEY` in code + Vercel + `.env.example`
2. Remove `VITE_SUPABASE_URL` read from `api/stripe-checkout.ts` (use `SUPABASE_URL` instead)
3. Delete stale remote branches from GitHub

---

## 4 — Questions for Dylon

1. **`legacy-peer-deps=true`** in `.npmrc` — do you know what conflict originally required this? Running `npm install` without it and seeing if it still passes would tell us if it can be removed.

2. **Dual cron** — `sync-cron.yml` (GH Actions, 5 min) AND `vercel.json` (Vercel Cron, 15 min) are both active for the sync endpoint. The comment in `sync-cron.yml` says it "replaces" the Vercel Cron, but both are running. Which schedule is correct: 5 min or 15 min?

3. **`src/TRADR (1-4).tsx`** — these are in the `tsconfig.app.json` exclude list, which means they exist on your local machine but aren't committed (correct, `.gitignore` has `.bak` and `.tmp` but not these). Are these safe to delete from your local disk?

4. **`tasks/lessons.md`** — CLAUDE.md Rule 3 tells Claude to append lessons here, but the file doesn't exist in the repo. Should it be committed (even if empty), or has Rule 3 been superseded by the auto-memory system?

5. **`SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`** — are these set as GitHub repo secrets? If not, the E2E job passes vacuously on every push to `main`.

6. **Annual pricing** — `STRIPE_PRICE_ID_ANNUAL` is in `.env.example` and read in `api/stripe-checkout.ts`. Is annual pricing coming soon, or should the code path be removed to simplify?

7. **Sourcemaps** — Sentry is wired but sourcemaps aren't uploaded. Error reports from production will show minified stack traces. Is this acceptable for now, or should we add sourcemap generation + upload to CI?

---

## System-level Recommendations

These are one-off commands to run in your own terminal (not repo changes):

```powershell
# Clean up stale remote-tracking refs
git remote prune origin

# Delete merged / stale local branches (review first)
git branch --merged main | Where-Object { $_ -notmatch "^\*|main" } | ForEach-Object { git branch -d $_.Trim() }

# Verify no peer-dep conflicts without the legacy flag
# (Run once; if it errors, the flag is still needed)
# npm install --legacy-peer-deps=false
```

```bash
# On macOS/Linux CI runner — confirm Node version alignment
node --version  # should match .nvmrc
```

```powershell
# If you want to confirm the real Supabase project ref before replacing it in .env.local.example
# (it's already in your browser bundle anyway, so this is safe to grep)
grep -r "vifwjwsndchnrpvfgrmg" src/ --include="*.ts" --include="*.tsx"
```
