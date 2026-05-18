-- ═══════════════════════════════════════════════════════════════════════════════
-- TRADR · Migration 003 — trade-screenshots Storage bucket
--
-- WHAT THIS DOES
--   Creates the `trade-screenshots` Storage bucket for trade chart images.
--   Screenshots are stored at: trade-screenshots/{userId}/{tradeId}.jpg
--   The bucket is public so images render in the app without needing signed URLs.
--
-- WHY THIS IS SAFE
--   Pure INSERT into storage.buckets — no existing data is touched.
--   If the bucket already exists the upsert is a no-op.
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → paste → Run. Idempotent.
--
-- AFTER RUNNING
--   New screenshots uploaded in the app will land in Storage instead of being
--   stored as base64 blobs inside the user_kv trade JSON. Existing base64
--   screenshots in old trades continue to display normally (the <img src="">
--   handles both URLs and data URIs).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create the bucket (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trade-screenshots',
  'trade-screenshots',
  true,                          -- public: images load without signed URLs
  5242880,                       -- 5 MB per file limit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ── RLS POLICIES ──────────────────────────────────────────────────────────────

-- Allow authenticated users to read any screenshot (needed for public profiles
-- where another user views someone else's trade chart)
drop policy if exists "screenshots_read_public" on storage.objects;
create policy "screenshots_read_public"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'trade-screenshots');

-- Allow unauthenticated reads so screenshots in shared circle feeds load
drop policy if exists "screenshots_read_anon" on storage.objects;
create policy "screenshots_read_anon"
  on storage.objects for select
  to anon
  using (bucket_id = 'trade-screenshots');

-- Allow a user to upload only into their own folder: trade-screenshots/{userId}/...
drop policy if exists "screenshots_insert_owner" on storage.objects;
create policy "screenshots_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow a user to delete only their own files
drop policy if exists "screenshots_delete_owner" on storage.objects;
create policy "screenshots_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
