-- supabase/migrations/20260531_waitlist.sql
create table public.waitlist (
  id          bigserial primary key,
  email       text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.waitlist enable row level security;
-- No RLS policies — service role only, no client-side access.
