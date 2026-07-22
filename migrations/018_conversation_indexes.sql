CREATE INDEX IF NOT EXISTS messages_org_recipient_created_idx
  ON messages (organization_id, to_number, created_at);

CREATE INDEX IF NOT EXISTS inbound_messages_org_sender_received_idx
  ON inbound_messages (organization_id, from_number, received_at);
