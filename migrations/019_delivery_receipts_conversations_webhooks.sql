DO $$ BEGIN
  ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'delivery_confirmed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'delivery_failed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'delivery_unknown';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL,
  api_client_key_id uuid REFERENCES api_client_keys(id) ON DELETE SET NULL,
  messaging_program_id uuid REFERENCES messaging_programs(id) ON DELETE SET NULL,
  gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  participant_number text NOT NULL,
  participant_number_redacted text NOT NULL,
  external_reference text,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open', 'closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_key_participant_open_idx
  ON conversation_threads (api_client_key_id, participant_number)
  WHERE api_client_key_id IS NOT NULL AND status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_key_external_reference_idx
  ON conversation_threads (api_client_key_id, external_reference)
  WHERE api_client_key_id IS NOT NULL AND external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_threads_org_activity_idx
  ON conversation_threads (organization_id, last_message_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS conversation_threads_client_activity_idx
  ON conversation_threads (api_client_id, last_message_at DESC, created_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS api_client_key_id uuid REFERENCES api_client_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_thread_id uuid REFERENCES conversation_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status_updated_at timestamptz;

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS conversation_thread_id uuid REFERENCES conversation_threads(id) ON DELETE SET NULL;

ALTER TABLE recipient_authorizations
  ADD COLUMN IF NOT EXISTS created_by_api_client_key_id uuid REFERENCES api_client_keys(id) ON DELETE SET NULL;

ALTER TABLE message_attempts
  ADD COLUMN IF NOT EXISTS modem_message_reference integer,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_status_code integer,
  ADD COLUMN IF NOT EXISTS delivery_reported_at timestamptz;

CREATE INDEX IF NOT EXISTS message_attempts_delivery_match_idx
  ON message_attempts (gateway_id, modem_message_reference, submitted_at DESC)
  WHERE modem_message_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_thread_id, created_at);
CREATE INDEX IF NOT EXISTS inbound_messages_conversation_received_idx
  ON inbound_messages (conversation_thread_id, received_at);
CREATE INDEX IF NOT EXISTS messages_api_client_key_created_idx
  ON messages (api_client_key_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  message_attempt_id uuid REFERENCES message_attempts(id) ON DELETE SET NULL,
  modem_message_reference integer NOT NULL,
  recipient_number text,
  recipient_number_redacted text,
  service_center_timestamp timestamptz,
  discharge_time timestamptz,
  status_code integer NOT NULL,
  normalized_status text NOT NULL,
  raw_report text NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (normalized_status IN ('delivered', 'pending', 'undelivered', 'unknown'))
);

CREATE INDEX IF NOT EXISTS delivery_receipts_message_created_idx
  ON delivery_receipts (message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_receipts_unmatched_idx
  ON delivery_receipts (gateway_id, modem_message_reference, received_at DESC)
  WHERE message_attempt_id IS NULL;

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  api_client_key_id uuid NOT NULL REFERENCES api_client_keys(id) ON DELETE CASCADE,
  callback_url text NOT NULL,
  description text,
  event_types text[] NOT NULL DEFAULT ARRAY['*']::text[],
  status text NOT NULL DEFAULT 'active',
  secret_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE (api_client_key_id, callback_url),
  CHECK (status IN ('active', 'disabled')),
  CHECK (cardinality(event_types) > 0)
);

CREATE INDEX IF NOT EXISTS webhook_subscriptions_key_status_idx
  ON webhook_subscriptions (api_client_key_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version text NOT NULL DEFAULT '2026-07-22',
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL,
  api_client_key_id uuid REFERENCES api_client_keys(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  conversation_thread_id uuid REFERENCES conversation_threads(id) ON DELETE SET NULL,
  inbound_message_id uuid REFERENCES inbound_messages(id) ON DELETE SET NULL,
  recipient_authorization_id uuid REFERENCES recipient_authorizations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_events_org_occurred_idx
  ON platform_events (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_key_occurred_idx
  ON platform_events (api_client_key_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_conversation_occurred_idx
  ON platform_events (conversation_thread_id, occurred_at);

ALTER TABLE callback_deliveries
  ADD COLUMN IF NOT EXISTS platform_event_id uuid REFERENCES platform_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS webhook_subscription_id uuid REFERENCES webhook_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS api_client_key_id uuid REFERENCES api_client_keys(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS callback_deliveries_subscription_event_idx
  ON callback_deliveries (webhook_subscription_id, platform_event_id)
  WHERE webhook_subscription_id IS NOT NULL AND platform_event_id IS NOT NULL;
