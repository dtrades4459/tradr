# Lessons Learned — TRADR

Rules accumulated from past mistakes, corrections, and surprising codebase behaviors. Read before starting any task. Append new lessons here per Rule 3 of CLAUDE.md.

Format: `- [YYYY-MM-DD] [category] Rule in imperative form.`

## Codebase
- [SEED] [architecture] Treat TRADR.tsx as a component map exercise before any structural change — do not refactor in-place without first producing a component inventory.
- [SEED] [design-system] Use only IBM Plex Mono and the baby blue accent #89CFF0 against the dark background — do not introduce new fonts or accent colors.

## Workflow
- [SEED] [process] Never mark a task done without test output and log check evidence pasted into the report.
- [SEED] [process] When something surprises you mid-task, stop and re-plan — do not improvise forward.

## Security
- [2026-05-21] [security] Always fail closed on env-var-gated auth checks — `if (secret && header !== secret)` passes when secret is undefined; use `if (!secret) return 500` first.
- [2026-05-21] [security] Never log one-time tokens or reset links to external channels (Telegram, Slack); log only the username and delivery status.
- [2026-05-21] [security] Verify column names in ownership checks against the actual schema before shipping — a single wrong column name (uid vs user_id) can turn an auth check into a bypass.
- [2026-05-21] [security] CSP `unsafe-inline` on script-src completely negates XSS protection — React/Vite does not require it; remove it.
- [2026-05-21] [security] Serverless API routes that proxy third-party APIs (Tradovate) must verify the caller's TRADR JWT, not just forward whatever token the client sends.

## Data / Sync
- [2026-05-21] [sync] Guard against `last_sync_at = NULL` returning unbounded history on first sync — cap or paginate the initial fill fetch.
- [2026-05-21] [sync] Concurrency helpers that increment a shared index are subject to logical races across parallel invocations (two cron triggers); add an advisory DB lock on the connection row before processing.
- [2026-05-21] [sync] Token refresh failure must set sync_status = 'error' and skip the API call immediately — do not fall through with an expired token.

## Storage / State
- [2026-05-21] [storage] The dual-write pattern (localStorage + Supabase) silently swallows Supabase write errors — propagate the error to the caller so the UI can show a failure state.
- [2026-05-21] [storage] localStorage cache has no TTL; stale data will be served to returning users on a different device until the cache is explicitly invalidated.

## Frontend
- [2026-05-21] [frontend] Every JSON.parse on externally-stored values (Supabase, localStorage) must be wrapped in try/catch — corrupted data otherwise crashes the component tree to the Error Boundary.
- [2026-05-21] [frontend] Win rate filters must use outcome === "Win" only — a pnl > 0 fallback counts Breakeven trades as wins and inflates public profile stats.
- [2026-05-21] [frontend] Interval-based sync (useCircles 2-min interval) must be cancelled on unmount and should check tab/component visibility before firing to avoid wasted Supabase reads.
- [2026-05-21] [frontend] Circle join and sync interval both write myCircles concurrently — use a merge strategy (not replace) when the sync result arrives to avoid overwriting user mutations.

## Config / CI
- [2026-05-21] [ci] The api/ serverless directory is not included in any tsconfig and is never type-checked by CI — create tsconfig.api.json and add a tsc step in ci.yml.
- [2026-05-21] [ci] Vite test environment must be "jsdom" not "node" — "node" makes document undefined and silently breaks any future component tests.
- [2026-05-21] [ci] ESLint react-hooks rules must stay as "error" not "warn" — warn-only violations pass CI and silently ship stale-closure bugs.
