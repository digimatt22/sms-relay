CREATE TABLE IF NOT EXISTS api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_key_hash text NOT NULL UNIQUE,
  api_key_prefix text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_used_at timestamptz,
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS api_client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_via text NOT NULL DEFAULT 'dashboard';

CREATE INDEX IF NOT EXISTS api_clients_status_idx
  ON api_clients (status, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_api_client_created_idx
  ON messages (api_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_submitted_via_created_idx
  ON messages (submitted_via, created_at DESC);
