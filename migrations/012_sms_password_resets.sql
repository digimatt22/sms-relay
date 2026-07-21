ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS mobile_number_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_codes_user_created_idx
  ON password_reset_codes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS password_reset_codes_active_idx
  ON password_reset_codes (user_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS mobile_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_verification_codes_user_created_idx
  ON mobile_verification_codes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mobile_verification_codes_active_idx
  ON mobile_verification_codes (user_id, expires_at DESC)
  WHERE used_at IS NULL;
