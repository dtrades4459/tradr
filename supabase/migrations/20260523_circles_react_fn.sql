-- Atomic toggle of an emoji reaction on a shared trade.
-- Adds member_code to the emoji array if not present, removes it if present.
-- Uses UPDATE which is atomic in Postgres — no read-then-write race.
CREATE OR REPLACE FUNCTION public.toggle_trade_reaction(
  p_trade_id   uuid,
  p_emoji      text,
  p_member_code text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
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
