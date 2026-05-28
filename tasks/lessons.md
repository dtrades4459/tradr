# Lessons Learned

Format: `- [YYYY-MM-DD] [category] Rule in imperative form.`

---

- [2026-05-27] [git] Never write large files directly on OneDrive-synced paths — use Python atomic write (write to `.tmp`, then `os.replace()`). OneDrive can truncate large direct writes mid-operation, zeroing the file.
- [2026-05-27] [types] When removing `(C as any)` casts, destructure theme keys at the top of the component rather than casting inline — keeps JSX readable and satisfies the type checker in one step.
- [2026-05-27] [types] `PromiseLike` (returned by Supabase query builder) does not have `.catch()` — use `.then(onFulfilled, onRejected)` two-argument form instead of chaining `.catch()`.
- [2026-05-27] [stripe] `Stripe.LatestApiVersion` was removed in Stripe SDK v22 — replace with `as any` cast on the apiVersion field in `stripe-checkout.ts` and `stripe-portal.ts`.
- [2026-05-27] [vercel] All `api/*.ts` functions must use `runtime: "nodejs"` (not `"nodejs20.x"`) — the versioned string causes a Vercel runtime error.
- [2026-05-27] [git] If `git push` says "Everything up-to-date" but Vercel hasn't deployed, trigger a manual redeploy in the Vercel dashboard (Deployments → Redeploy, uncheck build cache).
- [2026-05-27] [hooks] `useEffect` with no dep array and a `useRef` guard is NOT equivalent to `useEffect(() => { ... }, [])` — always use the empty array form. The ref guard is fragile and confuses the React Compiler.
- [2026-05-27] [ci] Do not add `--max-warnings 0` to ESLint in CI until the existing warning count is zero. Adding it prematurely will break CI and block all deployments.
- [2026-05-28] [backlog] Before picking up any item from the CLAUDE.md backlog, grep the codebase to confirm it's actually unbuilt. The backlog drifts — three "TODO" items were already shipped in May 2026 (Review Inbox UI, psychology fields, repo cleanup). Confirm-then-pick, never assume the backlog is current.
