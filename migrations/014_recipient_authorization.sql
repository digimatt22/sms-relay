CREATE TABLE IF NOT EXISTS messaging_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  sender_display_name text NOT NULL,
  message_class text NOT NULL DEFAULT 'informational_recurring',
  purpose text NOT NULL,
  expected_frequency text NOT NULL DEFAULT 'Message frequency varies',
  help_contact text NOT NULL,
  terms_url text,
  privacy_url text,
  callback_url text,
  status text NOT NULL DEFAULT 'pending_approval',
  public_enrollment_enabled boolean NOT NULL DEFAULT true,
  require_phone_verification boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  CHECK (message_class IN ('marketing', 'informational_recurring', 'user_requested_transactional')),
  CHECK (status IN ('draft', 'pending_approval', 'active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS consent_disclosure_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  messaging_program_id uuid NOT NULL REFERENCES messaging_programs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  locale text NOT NULL DEFAULT 'en-US',
  disclosure_text text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (messaging_program_id, version, locale),
  CHECK (status IN ('draft', 'approved', 'retired'))
);

CREATE TABLE IF NOT EXISTS verification_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  messaging_program_id uuid NOT NULL REFERENCES messaging_programs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  locale text NOT NULL DEFAULT 'en-US',
  template_text text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (messaging_program_id, version, locale),
  CHECK (status IN ('draft', 'approved', 'retired'))
);

ALTER TABLE messaging_programs
  ADD COLUMN IF NOT EXISTS current_disclosure_version_id uuid REFERENCES consent_disclosure_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_template_version_id uuid REFERENCES verification_template_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recipient_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  messaging_program_id uuid NOT NULL REFERENCES messaging_programs(id) ON DELETE RESTRICT,
  phone_number text NOT NULL,
  phone_number_redacted text NOT NULL,
  client_recipient_reference text,
  status text NOT NULL DEFAULT 'challenge_pending',
  consent_source text NOT NULL,
  consent_method text NOT NULL DEFAULT 'double_opt_in',
  recipient_initiated boolean NOT NULL DEFAULT false,
  evidence_reference text,
  disclosure_version_id uuid NOT NULL REFERENCES consent_disclosure_versions(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES verification_template_versions(id) ON DELETE RESTRICT,
  callback_url text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  revoked_at timestamptz,
  reverification_required_at timestamptz,
  last_message_at timestamptz,
  created_by_api_client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, messaging_program_id, phone_number),
  CHECK (status IN ('unverified', 'challenge_pending', 'verified_authorized', 'verification_expired', 'revoked', 'suppressed', 'reverification_required'))
);

CREATE TABLE IF NOT EXISTS recipient_authorization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  recipient_authorization_id uuid NOT NULL REFERENCES recipient_authorizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  reason_code text,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id uuid,
  gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  inbound_message_id uuid REFERENCES inbound_messages(id) ON DELETE SET NULL,
  outbound_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  recipient_authorization_id uuid NOT NULL REFERENCES recipient_authorizations(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  resend_count integer NOT NULL DEFAULT 0,
  idempotency_key text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'verified', 'expired', 'failed', 'superseded'))
);

CREATE TABLE IF NOT EXISTS platform_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  phone_number_redacted text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL,
  reason_code text NOT NULL,
  gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  inbound_message_id uuid REFERENCES inbound_messages(id) ON DELETE SET NULL,
  resolved_by_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('active', 'resolved'))
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS messaging_program_id uuid REFERENCES messaging_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_authorization_id uuid REFERENCES recipient_authorizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_category text NOT NULL DEFAULT 'ordinary';

ALTER TABLE opt_outs
  ADD COLUMN IF NOT EXISTS gateway_id uuid REFERENCES gateways(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inbound_message_id uuid REFERENCES inbound_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reconsented_at timestamptz;

ALTER TABLE callback_deliveries
  ADD COLUMN IF NOT EXISTS recipient_authorization_id uuid REFERENCES recipient_authorizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS messaging_programs_org_status_idx
  ON messaging_programs (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS recipient_authorizations_lookup_idx
  ON recipient_authorizations (organization_id, phone_number, status);
CREATE INDEX IF NOT EXISTS recipient_authorizations_program_idx
  ON recipient_authorizations (messaging_program_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS recipient_authorization_events_auth_idx
  ON recipient_authorization_events (recipient_authorization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_challenges_auth_idx
  ON verification_challenges (recipient_authorization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_challenges_expiry_idx
  ON verification_challenges (status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS verification_challenges_org_idempotency_idx
  ON verification_challenges (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_suppressions_active_idx
  ON platform_suppressions (phone_number) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS messages_authorization_idx
  ON messages (recipient_authorization_id, created_at DESC);
