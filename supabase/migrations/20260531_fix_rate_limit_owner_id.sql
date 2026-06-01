-- Fix check_and_increment_rate_limit: shared_kv now requires owner_id NOT NULL.
-- System-level rate limit keys (no real user) use the sentinel UUID as owner.

CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
  p_key      TEXT,
  p_limit    INT,
  p_window_ms BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now    BIGINT;
  v_value  JSONB;
  v_count  INT;
  v_reset  BIGINT;
BEGIN
  v_now := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

  -- Ensure the row exists so FOR UPDATE can lock it.
  -- Sentinel owner_id satisfies the NOT NULL constraint for system keys.
  INSERT INTO shared_kv (key, value, owner_id)
  VALUES (
    p_key,
    jsonb_build_object('count', 0, 'resetAt', v_now + p_window_ms),
    '00000000-0000-0000-0000-000000000000'::uuid
  )
  ON CONFLICT (key) DO NOTHING;

  -- Lock row exclusively for this transaction
  SELECT value INTO v_value
  FROM   shared_kv
  WHERE  key = p_key
  FOR    UPDATE;

  v_count := COALESCE((v_value->>'count')::INT, 0);
  v_reset := COALESCE((v_value->>'resetAt')::BIGINT, v_now + p_window_ms);

  -- Window expired → reset counter
  IF v_now >= v_reset THEN
    UPDATE shared_kv
    SET    value = jsonb_build_object('count', 1, 'resetAt', v_now + p_window_ms)
    WHERE  key = p_key;
    RETURN TRUE;
  END IF;

  -- Limit exceeded
  IF v_count >= p_limit THEN
    RETURN FALSE;
  END IF;

  -- Increment counter
  UPDATE shared_kv
  SET    value = jsonb_build_object('count', v_count + 1, 'resetAt', v_reset)
  WHERE  key = p_key;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION check_and_increment_rate_limit(TEXT, INT, BIGINT)
  TO service_role;
