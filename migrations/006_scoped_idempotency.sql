DO $$ BEGIN
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_idempotency_key_key;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS messages_scoped_idempotency_idx
  ON messages (
    organization_id,
    COALESCE(api_client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    idempotency_key
  )
  WHERE idempotency_key IS NOT NULL;
