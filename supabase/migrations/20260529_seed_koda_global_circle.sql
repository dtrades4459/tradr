-- Seed the Kōda Global circle into shared_kv so it exists before any user
-- tries to join. The client-side joinCircleByCode() also auto-creates it,
-- but this migration guarantees the row exists even on a fresh database.
-- ON CONFLICT DO NOTHING makes the migration safely re-runnable.

INSERT INTO shared_kv (key, value)
VALUES (
  'koda_circle_KODA-GLOBAL',
  '{"id":1,"code":"KODA-GLOBAL","name":"Kōda","description":"The official Kōda community. All traders welcome.","strategy":"","privacy":"public","emoji":"◆","metric":"dollar","createdBy":"Kōda","createdAt":"2026-05-01T00:00:00.000Z"}'
)
ON CONFLICT (key) DO NOTHING;
