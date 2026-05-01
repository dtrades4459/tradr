-- ═══════════════════════════════════════════════════════════════════════════════
-- TRADR · Migration 002 — v2 schema (ADDITIVE)
--
-- WHAT THIS DOES
--   Creates the proper relational tables (profiles, trades, circles, etc.)
--   ALONGSIDE the existing user_kv / shared_kv tables. Nothing is dropped.
--   Nothing is rewritten. The live app keeps using KV until you flip the
--   `newTrades` / `newProfile` feature flags in the client.
--
-- WHY THIS IS SAFE
--   Pure CREATE statements + new RLS. Existing tables, policies, and triggers
--   are untouched. Worst case: extra empty tables sit unused.
--
-- HOW TO RUN
--   Run AFTER 001_rls_cleanup.sql.
--   Supabase dashboard → SQL Editor → paste → Run. Idempotent.
--
-- WHEN TO RUN
--   You can run this any time. The data layer modules in src/data/*.ts
--   reference these tables but are not yet imported by TRADR.tsx, so the
--   live app behavior does not change until you wire them in.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable case-insensitive text for handles. Already enabled on most Supabase
-- projects, but harmless if re-run.
create extension if not exists citext;


-- ─── PROFILES ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  handle         citext unique not null,
  name           text not null default '',
  avatar         text not null default '',
  bio            text not null default '',
  broker         text not null default '',
  timezone       text not null default 'UTC',
  member_code    text not null,
  is_public      boolean not null default false,
  public_trades  boolean not null default false,
  onboarded      boolean not null default false,
  prefs          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists profiles_member_code_idx on public.profiles(member_code);

alter table public.profiles enable row level security;

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles
  for select to authenticated
  using (is_public);


-- ─── TRADES ───────────────────────────────────────────────────────────────────
create table if not exists public.trades (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    text,                       -- the legacy Date.now() id, for migration
  pair         text not null,
  side         text,
  date         date not null,
  session      text,
  strategy     text not null default '',
  setup        text,
  outcome      text not null check (outcome in ('win','loss','be')),
  entry_price  numeric,
  sl_price     numeric,
  tp_price     numeric,
  pnl          numeric not null default 0,
  rr           numeric,
  notes        text,
  screenshots  text[] not null default '{}'::text[],
  reactions    jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists trades_user_date_idx on public.trades(user_id, date desc);
create index if not exists trades_user_strategy_idx on public.trades(user_id, strategy);
create unique index if not exists trades_user_client_idx on public.trades(user_id, client_id) where client_id is not null;

alter table public.trades enable row level security;

drop policy if exists "trades_self" on public.trades;
create policy "trades_self" on public.trades
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "trades_public_read" on public.trades;
create policy "trades_public_read" on public.trades
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = trades.user_id and p.public_trades
  ));


-- ─── CIRCLES ──────────────────────────────────────────────────────────────────
create table if not exists public.circles (
  code         text primary key,
  name         text not null,
  description  text not null default '',
  strategy     text,
  privacy      text not null default 'public' check (privacy in ('public','private')),
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.circles enable row level security;

drop policy if exists "circles_read" on public.circles;
create policy "circles_read" on public.circles
  for select to authenticated using (true);

drop policy if exists "circles_owner_write" on public.circles;
create policy "circles_owner_write" on public.circles
  for all to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);


create table if not exists public.circle_members (
  circle_code  text not null references public.circles(code) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member','banned')),
  joined_at    timestamptz not null default now(),
  primary key (circle_code, user_id)
);
create index if not exists circle_members_user_idx on public.circle_members(user_id);

alter table public.circle_members enable row level security;

drop policy if exists "cm_read_member" on public.circle_members;
create policy "cm_read_member" on public.circle_members
  for select to authenticated using (
    exists (
      select 1 from public.circle_members cm
      where cm.circle_code = circle_members.circle_code
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "cm_self_join" on public.circle_members;
create policy "cm_self_join" on public.circle_members
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "cm_self_leave" on public.circle_members;
create policy "cm_self_leave" on public.circle_members
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "cm_owner_update" on public.circle_members;
create policy "cm_owner_update" on public.circle_members
  for update to authenticated
  using (
    exists (
      select 1 from public.circles c
      where c.code = circle_members.circle_code and c.created_by = auth.uid()
    )
  );


-- ─── FOLLOWS ──────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  target_id    uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, target_id),
  check (follower_id <> target_id)
);
create index if not exists follows_target_idx on public.follows(target_id);

alter table public.follows enable row level security;

drop policy if exists "follows_read_auth" on public.follows;
create policy "follows_read_auth" on public.follows
  for select to authenticated using (true);

drop policy if exists "follows_self_write" on public.follows;
create policy "follows_self_write" on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);

drop policy if exists "follows_self_delete" on public.follows;
create policy "follows_self_delete" on public.follows
  for delete to authenticated using (auth.uid() = follower_id);


-- ─── TIMESTAMPS ───────────────────────────────────────────────────────────────
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trades_touch on public.trades;
create trigger trades_touch before update on public.trades
  for each row execute function public.touch_updated_at();
