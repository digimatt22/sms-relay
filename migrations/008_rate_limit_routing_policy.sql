ALTER TABLE api_clients
  ADD COLUMN IF NOT EXISTS hourly_message_limit integer,
  ADD COLUMN IF NOT EXISTS daily_message_limit integer;

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS routing_weight integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS hourly_send_limit integer;

CREATE INDEX IF NOT EXISTS messages_client_created_idx
  ON messages (api_client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS message_attempts_gateway_finished_idx
  ON message_attempts (gateway_id, finished_at DESC);
