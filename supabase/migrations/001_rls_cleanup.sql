-- ═══════════════════════════════════════════════════════════════════════════════
-- TRADR · Migration 001 — RLS cleanup
--
-- WHAT THIS DOES
--   Removes the dead `or key like ...` branches from shared_kv update policy.
--   Those branches never matched any real row (member rows are keyed by a
--   random base36 code, not auth.uid()) — they were dead code that gave a
--   false sense of security.
--
-- WHY THIS IS SAFE
--   Real protection is `auth.uid() = owner_id`, which still holds. Every
--   member/feed/circle row in your data layer is written with owner_id =
--   the authenticated user's uid (see src/data/circles.ts and
--   src/data/follows.ts). No legitimate write will be blocked by this change.
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists "shared_kv_update_own_or_entry" on public.shared_kv;

create policy "shared_kv_update_own" on public.shared_kv
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Add a left-anchored LIKE-friendly index so listByPrefix() stops scanning
-- the whole table. Existing pkey index can't help with `key like 'x%'`.
create index if not exists shared_kv_key_pattern_idx
  on public.shared_kv (key text_pattern_ops);

-- Quick sanity check — should return 4 policies, all narrow:
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='shared_kv';
