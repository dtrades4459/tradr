# TRADR — Deployment & Migration Runbook

This is the order to roll out the audit changes without taking down prod.
Every step is reversible. None of them require downtime.

---

## 0. Before you do anything

Confirm your live app still works at https://tradrjournal.xyz. Open it, log
in, log a trade, sign out. If anything is broken right now, fix that first.

Check `git status` is clean on `main`. If you've got uncommitted work, stash
it or commit it on a branch.

---

## 1. Ship the safe code changes (no behavior change in prod)

The new files are additive. Nothing existing imports the v2 data modules.
The Sentry init is a no-op without a DSN. Feature flags are off by default.

```powershell
cd C:\Users\Dylon\OneDrive\Desktop\tradr

# Create a feature branch — never push directly to main again.
git checkout -b chore/audit-phase-1

# Stage and commit
git add src/lib/log.ts
git add src/lib/sentry.ts
git add src/lib/flags.ts
git add src/main.tsx
git add src/data/trades.ts
git add src/data/profile.ts
git add src/data/bootstrap.ts
git add .env.example
git add .github/workflows/ci.yml
git add supabase/migrations/
git add DEPLOYMENT.md
git add MIGRATION.md

git commit -m "chore: phase 1 — log/flags/sentry stubs, CI, v2 schema (additive)"
git push -u origin chore/audit-phase-1
```

GitHub will print a URL — open it, click **Compare & pull request**.

### What happens next

- GitHub Actions runs `lint + typecheck + build`. If any of those fail, it
  surfaces in the PR — fix locally, push again.
- Vercel auto-creates a **preview URL** for the PR (looks like
  `tradr-git-chore-audit-phase-1-...vercel.app`).
- **Open the preview URL on your phone.** Sign in with your real account.
  Log a trade. Make sure nothing is broken.
- If anything is broken, do NOT merge. Fix on the branch, push, re-test.
- Once the preview URL behaves identically to production, click **Merge** in
  GitHub. Vercel deploys to prod automatically.

---

## 2. Run the RLS cleanup migration

Open Supabase dashboard → SQL Editor → New query.

Paste the contents of `supabase/migrations/001_rls_cleanup.sql` → **Run**.

You should see "Success. No rows returned." Verify with:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'shared_kv';
```

You should now see exactly 4 policies:
`shared_kv_select_auth`, `shared_kv_insert_own`, `shared_kv_update_own`,
`shared_kv_delete_own`.

**Test the live app.** Log in, log a trade, join a circle, leave a circle.
If any write fails with "row-level security violation", roll back:

```sql
-- Emergency rollback: restore the old (over-permissive) policy.
drop policy if exists "shared_kv_update_own" on public.shared_kv;
create policy "shared_kv_update_own_or_entry" on public.shared_kv
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
```

(The new and old policy are functionally equivalent because the `or like`
branches were dead. The rollback is just the same rule under the old name.)

---

## 3. Run the v2 schema migration (additive — does NOT change prod behavior)

Same flow as step 2. Paste `supabase/migrations/002_v2_schema_additive.sql`
into the SQL Editor → **Run**.

This creates `profiles`, `trades`, `circles`, `circle_members`, `follows`
alongside the existing KV tables. The live app does not touch them yet.

Verify:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

You should see all the new tables plus the legacy `user_kv`, `shared_kv`,
`circle_messages`.

---

## 4. (Optional) Turn on Sentry

Skip this until you actually want error reports.

```powershell
cd C:\Users\Dylon\OneDrive\Desktop\tradr
npm install @sentry/react
```

Get a DSN from https://sentry.io (free tier, 5min signup). In Vercel
dashboard → Project → Settings → Environment Variables:

- Add `VITE_SENTRY_DSN` = your DSN, scope to **Production** + **Preview**.
- Redeploy (Vercel → Deployments → ⋯ → Redeploy).

Local dev: append `VITE_SENTRY_DSN=https://...` to `.env`. Restart `npm run dev`.

That's it — uncaught errors auto-report. The logger in `src/lib/log.ts` will
forward `log.error(...)` calls to Sentry automatically.

---

## 5. (Future) Wire the v2 data layer in TRADR.tsx

This is the next phase of work, not part of phase 1. The plan:

1. Pick one resource (start with `profile`).
2. Add a feature flag check in `loadAll()`:
   ```ts
   if (isFlagOn("newProfile")) {
     const p = await getProfile(user.id);
     if (p) { setProfile(p); /* ... */ }
   } else {
     // existing user_kv read
   }
   ```
3. Test locally with `localStorage.tradr_flags = "newProfile"; location.reload()`.
4. Ship behind the flag. Flip on for your account first via the browser console.
5. After a week with no issues, delete the old code path.

Repeat per resource. Don't try to do trades first — it's the highest-volume
resource. Do profile, then follows, then circles, then trades last.

---

## Rollback recipes

| What broke | How to fix |
|---|---|
| Build fails on PR | CI logs in GitHub Actions tab. Most common cause: typo or missing env. |
| Preview URL shows blank screen | Check browser console. If it's "Missing Supabase env vars", your Vercel project hasn't propagated env to preview. Project Settings → Environment Variables → ensure both are scoped to Preview. |
| Live site goes down after merge | Vercel → Deployments → click previous green deploy → Promote to Production. Instant rollback. |
| RLS migration breaks writes | See SQL rollback in step 2. |
| You're panicking | `git revert <commit-sha>; git push` reverts the merge cleanly. Vercel redeploys in ~60s. |

---

## Branch protection (do this once)

GitHub → Repo → Settings → Branches → Add rule for `main`:

- Require a pull request before merging
- Require status checks to pass (select the `build` job from CI)
- Do not allow bypassing

Now you can't accidentally push broken code to prod.
