-- Rename all tradr_ prefixed keys to koda_ in user_kv and shared_kv.
-- Run this BEFORE deploying the code that references the new key names.
-- Preview counts first:
--   SELECT 'user_kv' AS tbl, COUNT(*) FROM user_kv WHERE key LIKE 'tradr_%'
--   UNION ALL
--   SELECT 'shared_kv', COUNT(*) FROM shared_kv WHERE key LIKE 'tradr_%';

UPDATE user_kv
  SET key = 'koda_' || SUBSTRING(key FROM 7)
  WHERE key LIKE 'tradr_%';

UPDATE shared_kv
  SET key = 'koda_' || SUBSTRING(key FROM 7)
  WHERE key LIKE 'tradr_%';
