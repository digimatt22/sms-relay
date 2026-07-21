CREATE TABLE IF NOT EXISTS inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE RESTRICT,
  from_number text NOT NULL,
  from_number_redacted text NOT NULL,
  body text NOT NULL,
  received_at timestamptz NOT NULL,
  modem_index integer,
  message_status text,
  service_center text,
  matched_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  callback_url text,
  callback_status text NOT NULL DEFAULT 'not_configured',
  callback_http_status integer,
  callback_response text,
  callback_attempted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_messages_gateway_created_idx
  ON inbound_messages (gateway_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_from_created_idx
  ON inbound_messages (from_number, created_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_matched_idx
  ON inbound_messages (matched_message_id, created_at DESC);
