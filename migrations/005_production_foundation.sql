DO $$ BEGIN
  ALTER TYPE gateway_status ADD VALUE IF NOT EXISTS 'maintenance';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  default_callback_url text,
  message_body_retention_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'DigiColony', 'digicolony')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'org_admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

INSERT INTO organization_memberships (organization_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', id,
       CASE WHEN role = 'admin' THEN 'platform_admin' ELSE role END
  FROM admin_users
ON CONFLICT (organization_id, user_id) DO NOTHING;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS default_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

UPDATE admin_users
   SET default_organization_id = COALESCE(default_organization_id, '00000000-0000-0000-0000-000000000001');

ALTER TABLE api_clients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS maintenance_at timestamptz;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gateway_pool_id uuid,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE api_clients
   SET organization_id = COALESCE(organization_id, '00000000-0000-0000-0000-000000000001');

UPDATE gateways
   SET organization_id = COALESCE(organization_id, '00000000-0000-0000-0000-000000000001');

UPDATE messages
   SET organization_id = COALESCE(
     organization_id,
     (SELECT organization_id FROM api_clients WHERE api_clients.id = messages.api_client_id),
     '00000000-0000-0000-0000-000000000001'
   );

UPDATE inbound_messages i
   SET organization_id = COALESCE(
     organization_id,
     (SELECT organization_id FROM gateways WHERE gateways.id = i.gateway_id),
     '00000000-0000-0000-0000-000000000001'
   );

ALTER TABLE api_clients
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE gateways
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE messages
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE inbound_messages
  ALTER COLUMN organization_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS api_client_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  api_key_hash text NOT NULL UNIQUE,
  api_key_prefix text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO api_client_keys (api_client_id, api_key_hash, api_key_prefix, status, last_used_at)
SELECT id, api_key_hash, api_key_prefix, status, last_used_at
  FROM api_clients
ON CONFLICT (api_key_hash) DO NOTHING;

CREATE TABLE IF NOT EXISTS gateway_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  api_key_hash text NOT NULL UNIQUE,
  api_key_prefix text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO gateway_keys (gateway_id, api_key_hash, api_key_prefix, status, last_used_at)
SELECT id, api_key_hash, api_key_prefix,
       CASE WHEN disabled_at IS NULL THEN 'active' ELSE 'revoked' END,
       api_key_last_used_at
  FROM gateways
ON CONFLICT (api_key_hash) DO NOTHING;

CREATE TABLE IF NOT EXISTS gateway_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

INSERT INTO gateway_pools (id, organization_id, name, slug, is_default)
VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Global Pool', 'global', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gateway_pool_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_pool_id uuid NOT NULL REFERENCES gateway_pools(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_pool_id, gateway_id)
);

INSERT INTO gateway_pool_memberships (gateway_pool_id, gateway_id)
SELECT '00000000-0000-0000-0000-000000000101', id
  FROM gateways
ON CONFLICT (gateway_pool_id, gateway_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS api_client_gateway_pool_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  gateway_pool_id uuid NOT NULL REFERENCES gateway_pools(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_client_id, gateway_pool_id)
);

INSERT INTO api_client_gateway_pool_access (api_client_id, gateway_pool_id, is_default)
SELECT id, '00000000-0000-0000-0000-000000000101', true
  FROM api_clients
ON CONFLICT (api_client_id, gateway_pool_id) DO NOTHING;

DO $$ BEGIN
  ALTER TABLE messages
    ADD CONSTRAINT messages_gateway_pool_fk
    FOREIGN KEY (gateway_pool_id) REFERENCES gateway_pools(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE messages
   SET gateway_pool_id = COALESCE(gateway_pool_id, '00000000-0000-0000-0000-000000000101');

CREATE TABLE IF NOT EXISTS message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS callback_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  inbound_message_id uuid REFERENCES inbound_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  callback_url text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_http_status integer,
  last_response text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  phone_number_redacted text NOT NULL,
  source text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone_number)
);

CREATE TABLE IF NOT EXISTS daily_usage_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL,
  gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  usage_date date NOT NULL,
  outbound_count integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  inbound_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, api_client_id, gateway_id, usage_date)
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  status text NOT NULL DEFAULT 'open',
  subject_type text,
  subject_id uuid,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gateway_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  command_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  requested_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships (user_id, organization_id);
CREATE INDEX IF NOT EXISTS api_clients_org_status_idx
  ON api_clients (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gateways_org_status_idx
  ON gateways (organization_id, status, last_heartbeat_at);
CREATE INDEX IF NOT EXISTS messages_org_status_idx
  ON messages (organization_id, status, priority, scheduled_at, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS inbound_messages_org_created_idx
  ON inbound_messages (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_client_keys_client_status_idx
  ON api_client_keys (api_client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_keys_gateway_status_idx
  ON gateway_keys (gateway_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_pool_memberships_gateway_idx
  ON gateway_pool_memberships (gateway_id, gateway_pool_id);
CREATE INDEX IF NOT EXISTS api_client_gateway_pool_access_pool_idx
  ON api_client_gateway_pool_access (gateway_pool_id, api_client_id);
CREATE INDEX IF NOT EXISTS message_events_message_created_idx
  ON message_events (message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS callback_deliveries_status_next_idx
  ON callback_deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS alerts_org_status_idx
  ON alerts (organization_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_commands_gateway_status_idx
  ON gateway_commands (gateway_id, status, requested_at DESC);
