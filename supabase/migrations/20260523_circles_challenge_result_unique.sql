-- Prevent duplicate results if cron fires twice for the same challenge
ALTER TABLE public.circle_challenge_results
  ADD CONSTRAINT circle_challenge_results_challenge_id_unique UNIQUE (challenge_id);
