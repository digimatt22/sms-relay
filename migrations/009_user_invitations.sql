CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'viewer',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  accepted_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_org_status
  ON user_invitations (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email_status
  ON user_invitations (email, status);
