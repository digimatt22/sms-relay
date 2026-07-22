ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE inbound_messages
   SET read_at = now(),
       updated_at = now()
 WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS inbound_messages_org_unread_idx
  ON inbound_messages (organization_id, received_at DESC)
  WHERE read_at IS NULL;
