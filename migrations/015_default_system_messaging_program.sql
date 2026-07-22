ALTER TABLE messaging_programs
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  program_id uuid;
  disclosure_id uuid;
  template_id uuid;
  disclosure_text text := 'By continuing, you agree to receive user requested transactional text messages from DigiColony about account verification, security alerts, and requested platform test messages. Message frequency varies based on account activity. Message and data rates may apply. Reply STOP to opt out or HELP for help.';
  template_text text := '{client_name}: Verify your request for {program_name} texts. Code {code}. {frequency_notice}. Reply STOP to cancel or HELP for help. Msg & data rates may apply.';
BEGIN
  INSERT INTO messaging_programs (
    id, organization_id, name, slug, sender_display_name, message_class, purpose,
    expected_frequency, help_contact, status, public_enrollment_enabled,
    require_phone_verification, is_system, approved_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'DigiColony SNS System Notifications',
    'digicolony-sns-system-notifications',
    'DigiColony',
    'user_requested_transactional',
    'Account verification, security alerts, and requested platform test messages',
    'Message frequency varies based on account activity',
    'mwood@digicolony.com',
    'active', true, true, true, now()
  )
  ON CONFLICT (organization_id, slug) DO UPDATE
    SET is_system = true,
        status = 'active',
        public_enrollment_enabled = true,
        updated_at = now()
  RETURNING id INTO program_id;

  INSERT INTO consent_disclosure_versions (
    id, messaging_program_id, version, disclosure_text, content_hash, status, approved_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000202', program_id, 1, disclosure_text,
    encode(digest(disclosure_text, 'sha256'), 'hex'), 'approved', now()
  )
  ON CONFLICT (messaging_program_id, version, locale) DO UPDATE
    SET disclosure_text = EXCLUDED.disclosure_text,
        content_hash = EXCLUDED.content_hash,
        status = 'approved'
  RETURNING id INTO disclosure_id;

  INSERT INTO verification_template_versions (
    id, messaging_program_id, version, template_text, content_hash, status, approved_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000203', program_id, 1, template_text,
    encode(digest(template_text, 'sha256'), 'hex'), 'approved', now()
  )
  ON CONFLICT (messaging_program_id, version, locale) DO UPDATE
    SET template_text = EXCLUDED.template_text,
        content_hash = EXCLUDED.content_hash,
        status = 'approved'
  RETURNING id INTO template_id;

  UPDATE messaging_programs
     SET current_disclosure_version_id = disclosure_id,
         current_template_version_id = template_id,
         updated_at = now()
   WHERE id = program_id;
END $$;
