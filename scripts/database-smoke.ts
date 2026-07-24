import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { authenticateApiClient, createApiClient } from "@/lib/api-clients";
import { createMessage } from "@/lib/messages";
import { checkDatabaseReadiness } from "@/lib/readiness";
import { requestRecipientAuthorization } from "@/lib/recipient-authorizations";

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) throw new Error("MIGRATION_DATABASE_URL is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const owner = new pg.Pool({ connectionString: migrationUrl, max: 1 });
const suffix = randomUUID().slice(0, 8);
const organizationId = randomUUID();
const programId = randomUUID();
const disclosureId = randomUUID();
const templateId = randomUUID();
const authorizedPhone = `+15551${suffix.replace(/\D/g, "").padEnd(6, "0").slice(0, 6)}`;
const registrationPhone = `+15552${suffix.replace(/\D/g, "").padEnd(6, "1").slice(0, 6)}`;
const missingConsentPhone = "+15550001001";
const stoppedPhone = "+15550001002";

const evidence: Record<string, unknown> = {};

try {
  await owner.query(
    `INSERT INTO organizations (id, name, slug)
     VALUES ($1, 'Restore smoke organization', $2)`,
    [organizationId, `restore-smoke-${suffix}`],
  );
  await owner.query(
    `INSERT INTO messaging_programs (
       id, organization_id, name, slug, sender_display_name, message_class,
       purpose, expected_frequency, help_contact, status
     )
     VALUES ($1, $2, 'Restore smoke program', 'restore-smoke', 'Relay Hub',
             'user_requested_transactional', 'Isolated restore verification',
             'One test', 'support@example.invalid', 'active')`,
    [programId, organizationId],
  );
  await owner.query(
    `INSERT INTO consent_disclosure_versions (
       id, messaging_program_id, version, disclosure_text, content_hash, status
     ) VALUES ($1, $2, 1, 'Test disclosure. Reply STOP to opt out.',
               'restore-smoke-disclosure', 'approved')`,
    [disclosureId, programId],
  );
  await owner.query(
    `INSERT INTO verification_template_versions (
       id, messaging_program_id, version, template_text, content_hash, status
     ) VALUES ($1, $2, 1,
               '{client_name}: Verify your request for {program_name} texts. Code {code}. {frequency_notice}. Reply STOP to cancel or HELP for help. Msg & data rates may apply.',
               'restore-smoke-template', 'approved')`,
    [templateId, programId],
  );
  await owner.query(
    `UPDATE messaging_programs
        SET current_disclosure_version_id = $2,
            current_template_version_id = $3
      WHERE id = $1`,
    [programId, disclosureId, templateId],
  );

  const { client, apiKey } = await createApiClient({
    name: "Restore smoke API client",
    keyLabel: "Isolated restore",
    organizationId,
  });
  const authenticated = await authenticateApiClient(apiKey);
  assert.ok(authenticated);
  assert.equal(authenticated.id, client.id);
  evidence.valid_credentials = "passed";

  const invalid = await authenticateApiClient("relayhub_invalid_restore_key");
  assert.equal(invalid, null);
  evidence.invalid_credentials = "rejected";

  const registration = await requestRecipientAuthorization({
    organizationId,
    programId,
    phoneNumber: registrationPhone,
    consentSource: "hosted",
    recipientInitiated: true,
    evidenceReference: `restore-smoke:${suffix}`,
    actorType: "recipient",
  });
  assert.equal(registration.status, "challenge_pending");
  const registrationResult = await owner.query(
    `SELECT c.status AS challenge_status, m.status AS message_status,
            EXISTS (
              SELECT 1
                FROM platform_events e
               WHERE e.recipient_authorization_id = a.id
                 AND e.event_type = 'recipient.authorization.challenge_sent'
            ) AS event_published
       FROM recipient_authorizations a
       JOIN verification_challenges c ON c.recipient_authorization_id = a.id
       JOIN messages m ON m.id = c.message_id
      WHERE a.id = $1
      ORDER BY c.created_at DESC
      LIMIT 1`,
    [registration.id],
  );
  assert.deepEqual(registrationResult.rows[0], {
    challenge_status: "pending",
    message_status: "queued",
    event_published: true,
  });
  evidence.recipient_registration = "challenge_queued_and_event_published";

  const authResult = await owner.query(
    `INSERT INTO recipient_authorizations (
       organization_id, messaging_program_id, phone_number,
       phone_number_redacted, status, consent_source, recipient_initiated,
       disclosure_version_id, template_version_id, verified_at
     )
     VALUES ($1, $2, $3, '***-***-smoke', 'verified_authorized',
             'client_form', true, $4, $5, now())
     RETURNING id`,
    [organizationId, programId, authorizedPhone, disclosureId, templateId],
  );
  const authorizationId = authResult.rows[0].id;
  const queued = await createMessage({
    to: authorizedPhone,
    body: "Isolated restore authorized path",
    priority: 100,
    metadata: { transport: "non_sending_restore_smoke" },
    apiClientId: authenticated.id,
    apiClientKeyId: authenticated.key_id,
    submittedVia: "api",
    organizationId,
    messagingProgramId: programId,
    recipientAuthorizationId: authorizationId,
  });
  assert.equal(queued.status, "queued");
  assert.equal(queued.organization_id, organizationId);
  assert.equal(queued.messaging_program_id, programId);
  assert.equal(queued.recipient_authorization_id, authorizationId);
  evidence.authorized_sms_queue = "passed_without_gateway_send";

  await assert.rejects(
    createMessage({
      to: missingConsentPhone,
      body: "Must not queue",
      priority: 100,
      metadata: {},
      apiClientId: authenticated.id,
      apiClientKeyId: authenticated.key_id,
      submittedVia: "api",
      organizationId,
      messagingProgramId: programId,
    }),
    /recipient_authorization_required/,
  );
  evidence.missing_consent = "rejected";

  await owner.query(
    `INSERT INTO recipient_authorizations (
       organization_id, messaging_program_id, phone_number,
       phone_number_redacted, status, consent_source, recipient_initiated,
       disclosure_version_id, template_version_id, verified_at
     )
     VALUES ($1, $2, $3, '***-***-stop', 'verified_authorized',
             'client_form', true, $4, $5, now())`,
    [organizationId, programId, stoppedPhone, disclosureId, templateId],
  );
  await owner.query(
    `INSERT INTO opt_outs (
       organization_id, phone_number, phone_number_redacted, source, status
     ) VALUES ($1, $2, '***-***-stop', 'inbound', 'active')`,
    [organizationId, stoppedPhone],
  );
  await assert.rejects(
    createMessage({
      to: stoppedPhone,
      body: "Must not queue",
      priority: 100,
      metadata: {},
      apiClientId: authenticated.id,
      apiClientKeyId: authenticated.key_id,
      submittedVia: "api",
      organizationId,
      messagingProgramId: programId,
    }),
    /recipient_opted_out/,
  );
  evidence.stop_suppression = "rejected";

  const unavailable = new pg.Pool({
    connectionString:
      "postgres://relayhub_sms_runtime:invalid@127.0.0.1:1/relayhub_sms",
    connectionTimeoutMillis: 200,
    max: 1,
  });
  const readiness = await checkDatabaseReadiness((text) => unavailable.query(text));
  await unavailable.end();
  assert.deepEqual(readiness, {
    status: 503,
    body: { status: "unavailable" },
  });
  evidence.unavailable_database = "generic_503";

  process.stdout.write(`${JSON.stringify({ status: "passed", evidence }, null, 2)}\n`);
} finally {
  await owner.end();
  await globalThis.relayhubPool?.end();
}
