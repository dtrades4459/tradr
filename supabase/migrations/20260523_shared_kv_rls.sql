-- ═══════════════════════════════════════════════════════════════════════════════
-- shared_kv Row Level Security
--
-- shared_kv holds cross-user data (circles, leaderboards, follow edges).
-- Without RLS, any authenticated user could overwrite another user's rows.
--
-- Policy design:
--   READ  — any authenticated user can read all shared_kv rows (leaderboards etc)
--   INSERT — a user may only insert rows where owner_id = their auth.uid()
--   UPDATE — a user may only update rows they own (owner_id = auth.uid())
--   DELETE — a user may only delete rows they own
--
-- Service-role key (used by Vercel serverless functions) bypasses RLS entirely,
-- so server-side writes are unaffected.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS (idempotent)
ALTER TABLE public.shared_kv ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent re-runs)
DROP POLICY IF EXISTS "shared_kv_select"  ON public.shared_kv;
DROP POLICY IF EXISTS "shared_kv_insert"  ON public.shared_kv;
DROP POLICY IF EXISTS "shared_kv_update"  ON public.shared_kv;
DROP POLICY IF EXISTS "shared_kv_delete"  ON public.shared_kv;

-- Any signed-in user can read all shared rows (circles, leaderboards)
CREATE POLICY "shared_kv_select"
  ON public.shared_kv
  FOR SELECT
  TO authenticated
  USING (true);

-- A user can only insert rows they own
CREATE POLICY "shared_kv_insert"
  ON public.shared_kv
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- A user can only update rows they own
CREATE POLICY "shared_kv_update"
  ON public.shared_kv
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- A user can only delete rows they own
CREATE POLICY "shared_kv_delete"
  ON public.shared_kv
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
