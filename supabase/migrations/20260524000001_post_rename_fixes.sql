-- ═══════════════════════════════════════════════════════════════════════════════
-- Kōda · Post-rename fixes
--
-- Run AFTER 20260524000000_rename_tradr_kv_keys.sql.
--
-- Fixes two places that had hardcoded 'tradr_*' key references baked into
-- Postgres functions/policies, which the KV UPDATE migration cannot touch:
--
--   1. tradr_plan_jwt_hook — reads user_kv where key = 'tradr_profile'
--      After rename the row is 'koda_profile', so every JWT refresh would
--      return plan = 'free', breaking all Pro/Elite billing.
--
--   2. circle_challenges insert policy — checks shared_kv for
--      key = 'tradr_circle_' || circle_code to verify ownership.
--      After rename the circle rows are 'koda_circle_*', so Pro owners
--      get blocked when trying to start a challenge.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Update JWT hook to read koda_profile ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.tradr_plan_jwt_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id  uuid;
  _plan     text;
  _claims   jsonb;
BEGIN
  _user_id := (event->>'user_id')::uuid;

  SELECT COALESCE((value->>'plan'), 'free')
  INTO _plan
  FROM public.user_kv
  WHERE user_id = _user_id
    AND key = 'koda_profile'
  LIMIT 1;

  _plan := COALESCE(_plan, 'free');

  _claims := COALESCE(event->'claims', '{}'::jsonb)
    || jsonb_build_object(
        'app_metadata',
        COALESCE(event->'claims'->'app_metadata', '{}'::jsonb)
          || jsonb_build_object('plan', _plan)
       );

  RETURN jsonb_set(event, '{claims}', _claims);
EXCEPTION WHEN OTHERS THEN
  RETURN event;
END;
$$;


-- ── 2. Update circle_challenges insert policy to use koda_circle_ ─────────────

DROP POLICY IF EXISTS "circle_challenges_insert" ON public.circle_challenges;

CREATE POLICY "circle_challenges_insert" ON public.circle_challenges
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shared_kv
      WHERE key = ('koda_circle_' || circle_code)
        AND owner_id = auth.uid()
    )
  );
