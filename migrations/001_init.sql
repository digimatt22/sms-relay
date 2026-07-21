CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM (
    'queued',
    'claimed',
    'sending',
    'carrier_submitted',
    'retry_scheduled',
    'failed',
    'dead_lettered',
    'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gateway_status AS ENUM (
    'unknown',
    'online',
    'degraded',
    'offline',
    'disabled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number text NOT NULL,
  to_number_redacted text NOT NULL,
  body text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  scheduled_at timestamptz,
  status message_status NOT NULL DEFAULT 'queued',
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  callback_url text,
  claim_gateway_id uuid,
  claim_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  finalized_at timestamptz
);

CREATE TABLE IF NOT EXISTS gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status gateway_status NOT NULL DEFAULT 'unknown',
  api_key_hash text NOT NULL,
  api_key_prefix text NOT NULL,
  api_key_last_used_at timestamptz,
  last_heartbeat_at timestamptz,
  software_version text,
  hardware_type text,
  modem_imei text,
  sim_iccid text,
  carrier text,
  apn_profile text,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE messages
    ADD CONSTRAINT messages_claim_gateway_fk
    FOREIGN KEY (claim_gateway_id) REFERENCES gateways(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS message_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  status text NOT NULL DEFAULT 'started',
  modem_response text,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (message_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS gateway_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  level log_level NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gateway_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  status gateway_status NOT NULL DEFAULT 'online',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_claim_idx
  ON messages (status, priority, scheduled_at, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS messages_claim_expires_idx
  ON messages (claim_expires_at);
CREATE INDEX IF NOT EXISTS message_attempts_message_idx
  ON message_attempts (message_id, attempt_number);
CREATE INDEX IF NOT EXISTS gateways_status_idx
  ON gateways (status, last_heartbeat_at);
CREATE INDEX IF NOT EXISTS gateway_logs_gateway_created_idx
  ON gateway_logs (gateway_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_health_gateway_created_idx
  ON gateway_health (gateway_id, created_at DESC);
