-- ═══════════════════════════════════════════════════════════════════════════════
-- TRADR · Supabase schema
-- Paste this into Supabase dashboard → SQL Editor → New query → Run.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. PER-USER STORAGE ──────────────────────────────────────────────────────
-- Stores each user's private data (profile, trades, checklists, etc.)
-- keyed by (user_id, key). Only the owner can read/write their own rows.
create table if not exists public.user_kv (
  user_id  uuid         not null references auth.users(id) on delete cascade,
  key      text         not null,
  value    jsonb        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_kv enable row level security;

drop policy if exists "user_kv_select_own" on public.user_kv;
create policy "user_kv_select_own" on public.user_kv
  for select using (auth.uid() = user_id);

drop policy if exists "user_kv_insert_own" on public.user_kv;
create policy "user_kv_insert_own" on public.user_kv
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_kv_update_own" on public.user_kv;
create policy "user_kv_update_own" on public.user_kv
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_kv_delete_own" on public.user_kv;
create policy "user_kv_delete_own" on public.user_kv
  for delete using (auth.uid() = user_id);


-- ─── 2. SHARED STORAGE (CIRCLES) ──────────────────────────────────────────────
-- Stores circle objects + member leaderboard entries. Any signed-in user can
-- read (so you can look up a circle by its invite code); writes are tracked
-- to owner_id so only the writer (or circle creator) can modify their row.
create table if not exists public.shared_kv (
  key       text         primary key,
  value     jsonb        not null,
  owner_id  uuid         not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.shared_kv enable row level security;

-- Any signed-in user can read shared rows (needed for circle code lookup).
drop policy if exists "shared_kv_select_auth" on public.shared_kv;
create policy "shared_kv_select_auth" on public.shared_kv
  for select to authenticated using (true);

-- Only the owner can insert their own rows.
drop policy if exists "shared_kv_insert_own" on public.shared_kv;
create policy "shared_kv_insert_own" on public.shared_kv
  for insert to authenticated with check (auth.uid() = owner_id);

-- A row can be updated by its original owner, OR upserted by the user who
-- is writing their own leaderboard entry for a circle they belong to.
-- Simplest safe rule: allow update if owner_id matches OR the key is a
-- circle entry keyed to the current user's id suffix.
drop policy if exists "shared_kv_update_own_or_entry" on public.shared_kv;
create policy "shared_kv_update_own_or_entry" on public.shared_kv
  for update to authenticated
  using (
    auth.uid() = owner_id
    or key like ('tradr_circle_%\_' || auth.uid()::text)
    or key like ('tradr_feed_' || auth.uid()::text)
  )
  with check (
    auth.uid() = owner_id
    or key like ('tradr_circle_%\_' || auth.uid()::text)
    or key like ('tradr_feed_' || auth.uid()::text)
  );

drop policy if exists "shared_kv_delete_own" on public.shared_kv;
create policy "shared_kv_delete_own" on public.shared_kv
  for delete to authenticated using (auth.uid() = owner_id);

create index if not exists shared_kv_owner_idx on public.shared_kv (owner_id);


-- ─── 3. AUTO-UPDATE TIMESTAMPS ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_kv_touch on public.user_kv;
create trigger user_kv_touch
  before update on public.user_kv
  for each row execute function public.touch_updated_at();

drop trigger if exists shared_kv_touch on public.shared_kv;
create trigger shared_kv_touch
  before update on public.shared_kv
  for each row execute function public.touch_updated_at();


-- ─── 4. Realtime for circles + follows ────────────────────────────────────────
-- Wired through src/data/circles.ts → subscribeToCircle and
-- src/data/follows.ts → subscribeToFollows. Without this, those subscriptions
-- silently no-op and circle membership / follower counts only update on
-- the next poll (or page reload).
--
-- Run this once against your Supabase project. Safe to re-run; the
-- `drop publication ... add table` is idempotent because Postgres errors
-- only on a true conflict.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_kv'
  ) then
    execute 'alter publication supabase_realtime add table public.shared_kv';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Done. Next step: set the Google OAuth provider in Supabase Auth settings
-- if you want "Continue with Google" to work. Email/password works out of the box.
-- ═══════════════════════════════════════════════════════════════════════════════
