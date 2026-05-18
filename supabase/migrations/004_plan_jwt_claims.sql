-- ═══════════════════════════════════════════════════════════════════════════════
-- TRADR · Migration 004 — plan claim in JWT via custom_access_token_hook
--
-- WHAT THIS DOES
--   Adds a Postgres function that Supabase calls every time it mints a JWT.
--   The function reads the user's plan from user_kv and stamps it into the
--   JWT's app_metadata so the client and serverless functions can verify it
--   without an extra round-trip.
--
--   JWT claim added: app_metadata.plan = "free" | "pro" | "elite"
--
-- WHY THIS IS SAFE
--   The hook is read-only — it never writes to auth tables.
--   If user_kv has no plan row the claim defaults to "free".
--   Existing sessions keep working; the new claim appears on the next
--   token refresh (usually < 5 minutes).
--
-- HOW TO RUN
--   1. Run this SQL in Supabase dashboard → SQL Editor.
--   2. In the Supabase dashboard go to:
--      Authentication → Hooks → JWT Custom Claims
--      and enable the hook, pointing at public.tradr_plan_jwt_hook.
--   3. Deploy the updated stripe-webhook.ts which also writes app_metadata
--      so the JWT refreshes immediately after a successful purchase.
--
-- IDEMPOTENT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Grant the hook function access to read user_kv
grant select on public.user_kv to supabase_auth_admin;

create or replace function public.tradr_plan_jwt_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _user_id  uuid;
  _plan     text;
  _claims   jsonb;
begin
  _user_id := (event->>'user_id')::uuid;

  -- Read the plan stored inside the tradr_profile JSON blob in user_kv.
  -- Falls back to "free" if no row exists or the JSON doesn't have a plan field.
  select coalesce(
    (value->>'plan'),
    'free'
  )
  into _plan
  from public.user_kv
  where user_id = _user_id
    and key = 'tradr_profile'
  limit 1;

  _plan := coalesce(_plan, 'free');

  -- Merge our plan claim into whatever app_metadata already exists.
  _claims := coalesce(event->'claims', '{}'::jsonb)
    || jsonb_build_object(
        'app_metadata',
        coalesce(event->'claims'->'app_metadata', '{}'::jsonb)
          || jsonb_build_object('plan', _plan)
       );

  return jsonb_set(event, '{claims}', _claims);
exception when others then
  -- Never break auth — return the event unchanged if anything goes wrong.
  return event;
end;
$$;

-- Allow the Supabase auth service to invoke the hook
grant execute on function public.tradr_plan_jwt_hook(jsonb) to supabase_auth_admin;

-- Revoke from public — only the auth service should call this
revoke execute on function public.tradr_plan_jwt_hook(jsonb) from public, anon, authenticated;
