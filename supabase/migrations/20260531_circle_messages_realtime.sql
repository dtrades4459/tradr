-- Enable Postgres Changes realtime for circle_messages.
-- Without this, INSERT events never fire for other users' subscriptions.
ALTER TABLE public.circle_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_messages;
