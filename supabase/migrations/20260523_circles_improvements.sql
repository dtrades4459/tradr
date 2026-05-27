-- supabase/migrations/20260523_circles_improvements.sql

-- ── circle_messages ────────────────────────────────────────────────────────────
-- Currently referenced by code but never created. Fix that here.
CREATE TABLE IF NOT EXISTS public.circle_messages (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_code   text         NOT NULL,
  sender_id     uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name   text         NOT NULL DEFAULT '',
  sender_handle text         NOT NULL DEFAULT '',
  sender_avatar text,
  text          text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_messages ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "circle_messages_select" ON public.circle_messages;
CREATE POLICY "circle_messages_select" ON public.circle_messages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "circle_messages_insert" ON public.circle_messages;
CREATE POLICY "circle_messages_insert" ON public.circle_messages
  FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "circle_messages_delete" ON public.circle_messages;
CREATE POLICY "circle_messages_delete" ON public.circle_messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

CREATE INDEX IF NOT EXISTS circle_messages_code_time_idx
  ON public.circle_messages(circle_code, created_at DESC);

-- Grant service_role for cron auto-messages
GRANT INSERT ON public.circle_messages TO service_role;

-- ── circle_challenges ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circle_challenges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_code text        NOT NULL,
  title       text        NOT NULL,
  metric      text        NOT NULL CHECK (metric IN ('dollar','r','winrate','trades','avgr')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  created_by  text        NOT NULL,
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed'))
);

ALTER TABLE public.circle_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_challenges_select" ON public.circle_challenges;
CREATE POLICY "circle_challenges_select" ON public.circle_challenges
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "circle_challenges_insert" ON public.circle_challenges;
CREATE POLICY "circle_challenges_insert" ON public.circle_challenges
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shared_kv
      WHERE key = ('tradr_circle_' || circle_code)
        AND owner_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.circle_challenges TO service_role;

CREATE INDEX IF NOT EXISTS circle_challenges_code_status_idx
  ON public.circle_challenges(circle_code, status);

-- ── circle_challenge_results ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circle_challenge_results (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid         NOT NULL REFERENCES public.circle_challenges(id) ON DELETE CASCADE,
  circle_code   text         NOT NULL,
  winner_code   text         NOT NULL,
  winner_name   text         NOT NULL DEFAULT '',
  winner_handle text         NOT NULL DEFAULT '',
  winning_value numeric      NOT NULL,
  snapshot_at   timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_challenge_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_challenge_results_select" ON public.circle_challenge_results;
CREATE POLICY "circle_challenge_results_select" ON public.circle_challenge_results
  FOR SELECT TO authenticated USING (true);

GRANT INSERT ON public.circle_challenge_results TO service_role;

CREATE INDEX IF NOT EXISTS circle_challenge_results_code_idx
  ON public.circle_challenge_results(circle_code, snapshot_at DESC);

-- ── circle_shared_trades ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circle_shared_trades (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_code   text         NOT NULL,
  author_code   text         NOT NULL,
  author_name   text         NOT NULL DEFAULT '',
  author_handle text         NOT NULL DEFAULT '',
  author_avatar text         NOT NULL DEFAULT '',
  trade_id      text         NOT NULL,
  pair          text         NOT NULL,
  side          text         NOT NULL DEFAULT 'long' CHECK (side IN ('long','short')),
  outcome       text         NOT NULL CHECK (outcome IN ('win','loss','be')),
  pnl           numeric      NOT NULL DEFAULT 0,
  rr            numeric,
  strategy      text,
  notes         text,
  screenshot    text,
  date          text         NOT NULL,
  shared_at     timestamptz  NOT NULL DEFAULT now(),
  reactions     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (circle_code, author_code, trade_id)
);

ALTER TABLE public.circle_shared_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_shared_trades_select" ON public.circle_shared_trades;
CREATE POLICY "circle_shared_trades_select" ON public.circle_shared_trades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "circle_shared_trades_insert" ON public.circle_shared_trades;
CREATE POLICY "circle_shared_trades_insert" ON public.circle_shared_trades
  FOR INSERT TO authenticated WITH CHECK (true);

-- Any member can react (update reactions column).
-- V1 LIMITATION: author_code is a text code, not a uuid, so we cannot scope this
-- policy to the author via auth.uid() without a schema change. The open UPDATE
-- policy is intentional for v1 — the data layer (reactToSharedTrade) enforces
-- that only the reactions field is ever written, and a full-row author-only update
-- guard will require adding an author_uid uuid column in a future migration.
DROP POLICY IF EXISTS "circle_shared_trades_update" ON public.circle_shared_trades;
CREATE POLICY "circle_shared_trades_update" ON public.circle_shared_trades
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS circle_shared_trades_code_time_idx
  ON public.circle_shared_trades(circle_code, shared_at DESC);
