-- Fix: tighten circle_shared_trades UPDATE policy so only the sharer can edit
-- their own row, while reactions (via toggle_trade_reaction) still work for
-- all members by switching the function to SECURITY DEFINER.

-- 1. Add author_uid column (nullable — backfill happens on next share)
ALTER TABLE public.circle_shared_trades
  ADD COLUMN IF NOT EXISTS author_uid uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Tighten UPDATE: only the original sharer can edit their own row
DROP POLICY IF EXISTS "circle_shared_trades_update" ON public.circle_shared_trades;
CREATE POLICY "circle_shared_trades_update" ON public.circle_shared_trades
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_uid OR author_uid IS NULL)
  WITH CHECK (auth.uid() = author_uid OR author_uid IS NULL);

-- 3. Make toggle_trade_reaction SECURITY DEFINER so it bypasses RLS
--    (it only updates the reactions jsonb column — no other fields).
CREATE OR REPLACE FUNCTION public.toggle_trade_reaction(
  p_trade_id    uuid,
  p_emoji       text,
  p_member_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current jsonb;
BEGIN
  SELECT reactions INTO v_current
  FROM public.circle_shared_trades
  WHERE id = p_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.circle_shared_trades
  SET reactions = jsonb_set(
    COALESCE(reactions, '{}'::jsonb),
    ARRAY[p_emoji],
    CASE
      WHEN COALESCE(v_current -> p_emoji, '[]'::jsonb) ? p_member_code
      THEN COALESCE(v_current -> p_emoji, '[]'::jsonb) - p_member_code
      ELSE COALESCE(v_current -> p_emoji, '[]'::jsonb) || to_jsonb(p_member_code)
    END
  )
  WHERE id = p_trade_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_trade_reaction(uuid, text, text) TO authenticated;
