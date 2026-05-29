-- Seed the Kōda Global circle into shared_kv so it exists before any user
-- tries to join. The client-side joinCircleByCode() also auto-creates it,
-- but this migration guarantees the row exists even on a fresh database.
-- ON CONFLICT DO NOTHING makes the migration safely re-runnable.

-- owner_id uses a sentinel UUID (all-zeros) so no real user can ever mutate
-- this row via RLS. The SQL editor runs as service role and bypasses RLS,
-- so the insert succeeds even though auth.uid() is null here.
INSERT INTO shared_kv (key, value, owner_id)
VALUES (
  'koda_circle_KODA-GLOBAL',
  '{"id":1,"code":"KODA-GLOBAL","name":"Kōda","description":"The official Kōda community. All traders welcome.","strategy":"","privacy":"public","emoji":"◆","metric":"dollar","createdBy":"Kōda","createdAt":"2026-05-01T00:00:00.000Z"}',
  '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (key) DO NOTHING;
