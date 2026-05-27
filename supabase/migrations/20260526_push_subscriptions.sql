CREATE TABLE IF NOT EXISTS public.notification_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth_key    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_select" ON public.notification_subscriptions;
CREATE POLICY "push_sub_select" ON public.notification_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_sub_insert" ON public.notification_subscriptions;
CREATE POLICY "push_sub_insert" ON public.notification_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_sub_delete" ON public.notification_subscriptions;
CREATE POLICY "push_sub_delete" ON public.notification_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.notification_subscriptions TO service_role;
