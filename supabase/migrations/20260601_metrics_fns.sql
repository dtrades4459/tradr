-- User stats: requires cross-schema access to auth.users
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total',      (SELECT COUNT(*)               FROM auth.users),
    'today',      (SELECT COUNT(*)               FROM auth.users WHERE created_at >= CURRENT_DATE),
    'last_7d',    (SELECT COUNT(*)               FROM auth.users WHERE created_at >= NOW() - INTERVAL '7 days'),
    'last_30d',   (SELECT COUNT(*)               FROM auth.users WHERE created_at >= NOW() - INTERVAL '30 days'),
    'active_30d', (SELECT COUNT(DISTINCT user_id) FROM public.trades WHERE date >= CURRENT_DATE - 30)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_stats() TO service_role;

-- Trade stats
CREATE OR REPLACE FUNCTION public.get_trade_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  top_strats jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(t))
  INTO top_strats
  FROM (
    SELECT strategy, COUNT(*) AS count
    FROM public.trades
    WHERE strategy IS NOT NULL AND strategy <> ''
    GROUP BY strategy
    ORDER BY count DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'total',          (SELECT COUNT(*) FROM public.trades),
    'today',          (SELECT COUNT(*) FROM public.trades WHERE date = CURRENT_DATE),
    'last_7d',        (SELECT COUNT(*) FROM public.trades WHERE date >= CURRENT_DATE - 7),
    'top_strategies', COALESCE(top_strats, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_trade_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trade_stats() TO service_role;
