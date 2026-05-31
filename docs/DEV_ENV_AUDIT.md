# Kōda Dev Environment Audit
_Refreshed 2026-05-29 — read-only inspection, no files modified (except this report)._
_Previous audit: this same file, dated 2026-05-27._

---

## SECURITY

> No hardcoded secret values detected in the working tree.

**S1 — Real Supabase credentials in committed `.env` file**
`.env` is tracked by git. The `.gitignore` covers `.env.local` and `.env.*.local` but **not** `.env` itself. The committed file contains:
- `VITE_SUPABASE_URL` with the real project reference ID
- `VITE_SUPABASE_ANON_KEY` with a full JWT token

The anon key is technically public (it ships in the browser bundle and is safe by RLS design), but committing a `.env` file normalises the pattern and risks future accidental commits of `.env.local` or service-role keys.

**Action required:** Add `.env` to `.gitignore` and run `git rm --cached .env`. Purging from git history is optional given the anon key is already public.

**S2 — Personal email address in committed `.env.example`**
`VAPID_EMAIL=mailto:dnyland420@gmail.com` is hardcoded in `.env.example` (line 71), a tracked file in a public repo. Replace with `mailto:your-email@example.com`.

**S3 — Stale smoke-test domain in CI and playwright.config.ts**
Not a secret, but operationally broken: `playwright.config.ts` and `ci.yml` both hardcode `https://tradrjournal.xyz` as the E2E test target. The live production domain is now `kodatrade.co.uk`. Smoke tests run against the old domain and may be testing a stale deployment.

---

## 1 — Top 5 Quick Wins (under 30 minutes each)

| # | Action | File(s) | Est. |
|---|--------|---------|------|
| 1 | **Add `.env` to `.gitignore`** — closes the gap that allowed credentials to be committed; follow with `git rm --cached .env` | `.gitignore` | 3 min |
| 2 | **Add `--max-warnings 0` to `npm run lint`** — CI currently passes with unlimited ESLint warnings | `package.json` | 2 min |
| 3 | **Fix smoke-test domain** — update `playwright.config.ts` and `ci.yml` `BASE_URL` from `tradrjournal.xyz` → `kodatrade.co.uk` | 2 files | 5 min |
| 4 | **Extend `typecheck` to cover `api/`** — add `-p tsconfig.api.json` to the npm script; API code (billing, encryption, broker sync) is never type-checked in CI today | `package.json`, `ci.yml` | 5 min |
| 5 | **Fix `index.html` canonical URL** — `<link rel="canonical">` still points to `tradrjournal.xyz` | `index.html` | 2 min |

---

## 2 — Findings by Section

### 1 · Package Management

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Package manager | `npm` (lockfile v3, `package-lock.json`) — single lockfile, no mixed signals | No change needed | ✓ | — |
| `typecheck` script | `"typecheck": "tsc --noEmit"` present ✓ | Extend to also run `tsc --noEmit -p tsconfig.api.json` | High | S |
| `test` script | `"test": "vitest run"` present ✓ | — | ✓ | — |
| `lint` script | `"lint": "eslint ."` present but **no `--max-warnings 0`** — passes with any number of warnings | Add `--max-warnings 0` | High | S |
| `format` script | **Missing** — no Prettier, no `format` script | Add Prettier + `"format": "prettier --write ."` | Med | M |
| Node version pinned | `.nvmrc` (value: `20`) + `"engines": { "node": "20.x" }` in `package.json` ✓ | — | ✓ | — |
| `legacy-peer-deps=true` in `.npmrc` | Silently ignores peer dep conflicts; origin unknown | Investigate: `npm install` without flag; document which package requires it with a comment | Med | S |
| `stripe` in `dependencies` | Server-only; never imported from `src/`. Belongs in `devDependencies`. | Move to `devDependencies` | Low | S |
| `web-push` in `dependencies` | Same — only used in `api/push.ts` | Move to `devDependencies` | Low | S |
| `workbox-*` (5 packages) in `dependencies` | Bundled by `vite-plugin-pwa`; no runtime Node process imports them | Move to `devDependencies` | Low | S |

### 2 · TypeScript Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `strict: true` | Set in `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.api.json` ✓ | — | ✓ | — |
| `noUncheckedIndexedAccess` | **Not set** in any tsconfig | Add to `tsconfig.app.json` — catches silent `undefined` from array/object indexing | Med | M |
| `noImplicitAny` | Implied by `strict: true` ✓ | — | ✓ | — |
| `noUnusedLocals` / `noUnusedParameters` | Set in all three tsconfigs ✓ | — | ✓ | — |
| `noFallthroughCasesInSwitch` | Set ✓ | — | ✓ | — |
| `typecheck` covers `src/` only | `tsc --noEmit` resolves to `tsconfig.app.json` — `api/` is **never type-checked in CI** | Add `tsc --noEmit -p tsconfig.api.json` to the `typecheck` script and CI | High | S |
| Path aliases | None in tsconfig or Vite | `@/` → `src/` alias is optional but cuts `../../../` chains in large files like `Koda.tsx` | Low | M |
| Build target | `build.target: 'es2022'` in `vite.config.ts` ✓ | — | ✓ | — |
| `tsconfig.app.json` exclude list | Excludes `src/TRADR (1-4).tsx` — stale OneDrive backup paths | Confirm files don't exist locally; if they do, delete them | Low | S |

### 3 · Linting and Formatting

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| ESLint config | Flat config (ESLint 9), `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` ✓ | — | ✓ | — |
| All key rules set to `warn` | `no-explicit-any`, `exhaustive-deps`, 13 React Compiler rules — all `warn`. CI passes regardless of warning count. | Add `--max-warnings 0` to lint script. Consider promoting `no-explicit-any` → `error` after a cleanup sprint. | High | S |
| `api/` in lint-staged | `lint-staged` config covers both `src/**/*.{ts,tsx}` and `api/**/*.ts` ✓ | — | ✓ | — |
| No Prettier | No `.prettierrc`, no `prettier` devDependency, no `format` script | Add Prettier; wire `prettier --write` into lint-staged; add `.vscode/settings.json` with `editor.formatOnSave: true` | Med | M |
| ESLint–Prettier conflict prevention | No Prettier today, so no conflict. When added: install `eslint-config-prettier` to disable conflicting ESLint rules. | Plan for same session as Prettier | Med | S |
| React Compiler rules (13) | All `warn` — acceptable during migration | Add a TODO with a target date or issue number to track promotion to `error` | Low | S |

### 4 · Git Hygiene

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `.gitignore` — `.env` gap | `.env` is **not listed** — only `.env.local` and `.env.*.local` are covered. A `.env` file is currently committed. | Add `.env` to `.gitignore` immediately | High | S |
| `.gitignore` — standard covers | `dist`, `node_modules`, `.vscode/*`, `.DS_Store`, `.idea`, `.claude/`, `.vercel` ✓ | — | ✓ | — |
| `.gitignore` — Supabase artifacts | No entries for `supabase/.branches/` or `supabase/.temp/` | Add both | Low | S |
| `.gitattributes` | Present: `* text=auto eol=lf` normalisation + `.husky/*` and `*.sh` LF enforcement ✓ | — | ✓ | — |
| `tasks/lessons.md` | Does not exist. CLAUDE.md Rule 3 requires it. | Create and commit (even empty) or update Rule 3 to reflect the auto-memory system | Low | S |
| Git history scan for `.env` | Could not inspect in this session (shell blocked). The committed `.env` file should be reviewed. | Run: `git log --all --oneline -- ".env"` — see System Recommendations | High | S |
| Stale remote branches | Not inspectable without shell. Previous audit identified 25 remote branches, many stale. | `git remote prune origin`; delete merged branches from GitHub | Low | M |
| Commit conventions | Consistent `feat:`, `fix:`, `chore:`, `refactor:` prefix pattern ✓ | — | ✓ | — |

### 5 · Pre-commit Hooks

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Husky installed | `husky` v9 + `prepare` script ✓ | — | ✓ | — |
| lint-staged scope | `src/**/*.{ts,tsx}` and `api/**/*.ts` — both covered ✓ | — | ✓ | — |
| Pre-commit: typecheck | `npm run typecheck` on every commit ✓ — but only covers `src/`. When `typecheck` script is extended to include `api/`, the hook will automatically cover both. | No change needed beyond extending the npm script | ✓ | — |
| Pre-commit: pattern guards | Blocks `: any` annotations and `eslint-disable` (except `exhaustive-deps`) ✓ | — | ✓ | — |
| No pre-push hook | No `.husky/pre-push` | Optional: run `npm test` on pre-push to prevent broken unit tests reaching CI | Low | S |
| No commit-msg hook | No conventional commit enforcement | Optional: `commitlint` — low value given consistent manual discipline | Low | M |

### 6 · Environment Variables

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `.env` file committed | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are tracked in git (see SECURITY S1) | Add `.env` to `.gitignore`; run `git rm --cached .env` | High | S |
| `.env.example` completeness | All `import.meta.env.*` and `process.env.*` keys used in source are present ✓ | — | ✓ | — |
| `KODA_ENCRYPTION_KEY` | Correctly named in code (`api/lib/cryptoUtils.ts`) and `.env.example` ✓ | Confirm Vercel dashboard also uses the new name (not old `TRADR_ENCRYPTION_KEY`) | ✓ | — |
| `SUPABASE_URL` fallback in `api/lib/supabaseAdmin.ts` | Falls back to `process.env.VITE_SUPABASE_URL` if `SUPABASE_URL` is not set. `VITE_*` vars are not available server-side on Vercel unless explicitly set as a server variable. | Ensure `SUPABASE_URL` is always set in Vercel; the fallback masks misconfiguration | Med | S |
| `VAPID_EMAIL` hardcodes personal email | `mailto:dnyland420@gmail.com` in `.env.example` | Replace with `mailto:your-email@example.com` | Low | S |
| Two `.env.example` files | Both `.env.example` (complete) and `.env.local.example` (sparse, 3 vars) exist | Delete `.env.local.example` or clearly label it "minimal quick-start" | Low | S |
| `STRIPE_PRICE_ID_MONTHLY` missing from CLAUDE.md table | Listed in `.env.example` and code; absent from the CLAUDE.md env var table | Add to CLAUDE.md env var table | Low | S |

### 7 · Vite Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| Build target | `build.target: 'es2022'` ✓ | — | ✓ | — |
| Sourcemaps | **Not configured** — defaults to `false` in prod. Sentry is wired but will receive minified stack traces. | Add `build: { sourcemap: 'hidden' }`. Configure `sentry-cli` upload in CI. | Med | M |
| Manual chunks | React + Supabase vendor chunks ✓ | Could add Stripe + PostHog but current split is reasonable | Low | S |
| PWA `devOptions.enabled: true` | Service worker active in dev — can interfere with HMR | Set to `false` unless actively testing offline behaviour | Low | S |
| Path aliases | None — all imports are relative | Add `resolve: { alias: { '@': '/src' } }` + matching `tsconfig` `paths` | Low | M |
| All plugins active and needed | `@vitejs/plugin-react` + `vite-plugin-pwa` — both used ✓ | — | ✓ | — |

### 8 · Claude Code Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `CLAUDE.md` present at repo root | ✓ Current, comprehensive, Kōda-branded throughout | — | ✓ | — |
| TRADR → Kōda rebrand in CLAUDE.md | Complete. Remaining `TRADRG-HB1U` constant is intentional (live DB value) ✓ | — | ✓ | — |
| `.claude/` folder | **Does not exist** at repo root | Create `.claude/settings.json` to pin allowed tools and reduce per-session permission prompts | Low | S |
| `tasks/lessons.md` | Does not exist; Rule 3 requires it | Create empty file and commit, or update Rule 3 | Low | S |
| `STRIPE_PRICE_ID_MONTHLY` in env table | Absent from CLAUDE.md env var table | Add | Low | S |
| `(window as any).storage` code pattern | If `window.storage` is now declared via `declare global`, the cast is stale | Check `src/lib/storage.ts` for `declare global`; remove cast if typed | Low | S |
| Backlog accuracy | Sprint 3 marked ✓ (2026-05-29). Sprint 4 active. Competitive pricing correct. | Keep current ✓ | ✓ | — |

### 9 · CI / Deploy

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| CI runs lint + typecheck + build on every PR | ✓ | — | ✓ | — |
| `api/` never type-checked in CI | `npm run typecheck` only covers `src/` via `tsconfig.app.json` | Add `tsc --noEmit -p tsconfig.api.json` to CI Typecheck step | High | S |
| Lint allows unlimited warnings | `npm run lint` exits 0 regardless of warning count | Add `--max-warnings 0` to the lint script | High | S |
| Unit test job | Separate `test` job runs `vitest run` ✓ | — | ✓ | — |
| Node version from `.nvmrc` | All three CI jobs use `node-version-file: .nvmrc` ✓ | — | ✓ | — |
| Dual cron conflict | `sync-cron.yml` = GitHub Actions every 5 min. `vercel.json` = nightly `complete-challenges` only. No conflict. ✓ | — | ✓ | — |
| E2E smoke test domain | `BASE_URL: https://tradrjournal.xyz` in `ci.yml` — stale domain | Update to `https://kodatrade.co.uk` | Med | S |
| E2E secrets | `SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` referenced; unknown if set in GitHub secrets | Confirm in GitHub → Settings → Secrets; if unset, tests pass vacuously | Med | S |
| `continue-on-error: true` on E2E | Prevents broken smoke tests from blocking merges | Acceptable while test account setup is in progress | ✓ | — |
| Branch protection on `main` | Documented as backlog item — not yet enabled | Enable in GitHub → Settings → Branches: require `build` job to pass | Med | S |
| PR preview deploys | Vercel auto-deploys on every branch push ✓ | — | ✓ | — |

### 10 · Editor Config

| Area | Current state | Recommended change | Sev | Effort |
|------|---------------|--------------------|-----|--------|
| `.editorconfig` | Present: 2-space indent, LF, UTF-8, final newline, trim trailing whitespace ✓ | — | ✓ | — |
| `.vscode/` directory | **Does not exist** despite `.gitignore` excluding `.vscode/*` (with an exemption for `extensions.json`) | Create `.vscode/extensions.json` (ESLint, Prettier, TypeScript Hero) | Low | S |
| `.vscode/settings.json` | Not present | Create with `eslint.validate`, `editor.formatOnSave` (once Prettier is added), `typescript.tsdk` | Low | S |

---

## 3 — Suggested Sequencing

### Session A — Security + critical gaps (20 min)
_Do first. Two of these are security hygiene; two prevent silent CI lies._

1. Add `.env` to `.gitignore`; run `git rm --cached .env`; commit
2. Add `--max-warnings 0` to `"lint"` script in `package.json`
3. Update `"typecheck"` script: `"tsc --noEmit && tsc --noEmit -p tsconfig.api.json"`
4. Update CI Typecheck step: add `tsc --noEmit -p tsconfig.api.json` after existing command
5. Replace `mailto:dnyland420@gmail.com` in `.env.example` with `mailto:your-email@example.com`

### Session B — Stale domain cleanup (15 min)
_Pure find-and-replace. No dependencies._

1. `index.html` canonical URL: `tradrjournal.xyz` → `kodatrade.co.uk`
2. `playwright.config.ts` `baseURL` default: `tradrjournal.xyz` → `kodatrade.co.uk`
3. `ci.yml` `BASE_URL` env var: `tradrjournal.xyz` → `kodatrade.co.uk`
4. `public/robots.txt` sitemap URL
5. `public/sitemap.xml` all entries
6. `public/privacy.html` domain references

### Session C — TypeScript strictness (45 min)
_May surface new TS errors. Plan for a fix pass._

1. Add `"noUncheckedIndexedAccess": true` to `tsconfig.app.json`
2. Run `npm run typecheck` — fix any new errors (typically array index access in charts/data)
3. Verify `tsconfig.api.json` also passes cleanly after the typecheck script extension

### Session D — Prettier + editor setup (30 min)
_Independent. Purely additive._

1. `npm install -D prettier eslint-config-prettier`
2. Add `.prettierrc` (2 spaces, double quotes, semicolons — match existing code style)
3. Add `eslint-config-prettier` to `eslint.config.js` extends
4. Add `"format": "prettier --write ."` to `package.json` scripts
5. Add `prettier --write` to lint-staged for `*.{ts,tsx,json,md}`
6. Create `.vscode/extensions.json` + `.vscode/settings.json`

### Session E — Git hygiene (20 min)
_Terminal work. Can be done any time after Session A._

1. `git remote prune origin`
2. Delete merged stale branches (see System Recommendations)
3. Create `tasks/lessons.md` and commit it
4. Add `supabase/.branches/` and `supabase/.temp/` to `.gitignore`

### Session F — `.npmrc` investigation (15 min)

1. Temporarily remove `legacy-peer-deps=true` from `.npmrc`
2. `npm install` — observe the conflict
3. Restore flag with a comment naming the conflicting package, or fix root cause

---

## 4 — System-level Recommendations

Run these in your own terminal (`C:\Users\Dylon\OneDrive\Desktop\tradr-fresh`):

```powershell
# ── SECURITY: untrack committed .env ──────────────────────────────────────────
# After adding ".env" to .gitignore:
git rm --cached .env
git commit -m "chore: untrack .env (was accidentally committed)"

# ── Optional: check what the .env file contained in history ───────────────────
git log --all --oneline -- ".env"
# Then inspect a specific commit:
# git show <hash>:.env

# ── Optional: purge .env from git history (install git-filter-repo first) ─────
# pip install git-filter-repo
# git filter-repo --path .env --invert-paths

# ── Stale branch cleanup ──────────────────────────────────────────────────────
git remote prune origin
git branch --merged main | Where-Object { $_ -notmatch "^\*|main" } | ForEach-Object { git branch -d $_.Trim() }

# ── Verify API typecheck passes before adding to CI ───────────────────────────
npx tsc --noEmit -p tsconfig.api.json

# ── Confirm lint max-warnings enforcement ─────────────────────────────────────
# After adding --max-warnings 0:
npm run lint
# Should exit non-zero if any warnings remain

# ── npmrc investigation ───────────────────────────────────────────────────────
# Temporarily comment out legacy-peer-deps=true, then:
npm install
# If it fails, note the package name and restore the flag with a comment
```

---

## 5 — Questions for Dylon

1. **Committed `.env` file** — The `.env` at repo root is tracked by git because `.gitignore` only covers `.env.local`. Is this intentional (e.g. sharing between machines), or an oversight? Should we purge it from git history, or just untrack it going forward?

2. **`api/` type-check gap** — The `typecheck` script and CI only cover `src/`. The `api/` folder (billing, encryption, broker sync, auth) has `tsconfig.api.json` but it is never run in CI. Type errors in API code are only caught at Vercel build time. Should `typecheck` cover `api/` too?

3. **`legacy-peer-deps=true`** — Do you know what originally required this flag? Running `npm install` without it takes 5 minutes and either works (flag removable) or names the exact conflict so we can document or fix it.

4. **Sourcemaps** — Sentry is wired but `vite.config.ts` has no `sourcemap` setting (defaults to `false`). Production error reports will show minified stack traces. Should we add `sourcemap: 'hidden'` and configure sourcemap upload in CI?

5. **`tasks/lessons.md`** — CLAUDE.md Rule 3 says "every lesson learned gets appended to `tasks/lessons.md`". The file does not exist in the repo. Has this been superseded by the auto-memory system, or should the file be created and committed?

6. **E2E test account** — CI references GitHub secrets `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`. Are these configured in GitHub → Settings → Secrets? If not, the smoke-test job passes vacuously on every push to `main`, giving false confidence.

7. **Two `.env.example` files** — Both `.env.example` (complete, 30+ vars) and `.env.local.example` (sparse, 3 vars) exist. New contributors won't know which to copy. Should `.env.local.example` be deleted, relabelled, or consolidated into `.env.example`?

8. **Annual pricing / Elite tier** — `STRIPE_PRICE_ID_ANNUAL` is in code and `.env.example`. CLAUDE.md mentions "Free / Pro / Elite" tiers but no `STRIPE_PRICE_ID_ELITE` exists anywhere. Is the Elite tier still on the roadmap? Should the annual pricing code path be kept or removed to reduce complexity?
