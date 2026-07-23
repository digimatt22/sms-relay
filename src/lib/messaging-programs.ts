import { createHash } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { recordMessageEventInTransaction } from "@/lib/message-events";

export const MESSAGE_CLASSES = ["marketing", "informational_recurring", "user_requested_transactional"] as const;
export type MessageClass = (typeof MESSAGE_CLASSES)[number];

export type CreateMessagingProgramInput = {
  organizationId: string;
  name: string;
  senderDisplayName: string;
  messageClass: MessageClass;
  purpose: string;
  expectedFrequency: string;
  helpContact: string;
  termsUrl?: string | null;
  privacyUrl?: string | null;
  callbackUrl?: string | null;
  createdByUserId?: string | null;
  activate?: boolean;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildConsentDisclosure(input: CreateMessagingProgramInput) {
  const purchaseDisclosure = input.messageClass === "marketing" ? " Consent is not a condition of purchase." : "";
  return `By continuing, you agree to receive ${input.messageClass.replace(/_/g, " ")} text messages from ${input.senderDisplayName} about ${input.purpose}. ${input.expectedFrequency}. Message and data rates may apply. Reply STOP to opt out or HELP for help.${purchaseDisclosure}`;
}

export function buildVerificationTemplate() {
  return "{client_name}: Verify your request for {program_name} texts. Code {code}. {frequency_notice}. Reply STOP to cancel or HELP for help. Msg & data rates may apply.";
}

export function renderVerificationTemplate(
  template: string,
  values: { clientName: string; programName: string; code: string; frequencyNotice: string }
) {
  const required = ["{client_name}", "{program_name}", "{code}", "{frequency_notice}"];
  if (required.some((placeholder) => !template.includes(placeholder))) {
    throw new Error("Verification template is missing required content");
  }
  const rendered = template
    .replaceAll("{client_name}", values.clientName)
    .replaceAll("{program_name}", values.programName)
    .replaceAll("{code}", values.code)
    .replaceAll("{frequency_notice}", values.frequencyNotice);
  if (!/\bSTOP\b/i.test(rendered) || !/\bHELP\b/i.test(rendered)) {
    throw new Error("Verification template must include STOP and HELP instructions");
  }
  return rendered;
}

export async function createMessagingProgram(input: CreateMessagingProgramInput) {
  const disclosure = buildConsentDisclosure(input);
  const template = buildVerificationTemplate();
  return transaction(async (db) => {
    const programResult = await db.query(
      `INSERT INTO messaging_programs (
         organization_id, name, slug, sender_display_name, message_class, purpose,
         expected_frequency, help_contact, terms_url, privacy_url, callback_url,
         status, created_by_user_id, approved_by_user_id, approved_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               CASE WHEN $12 = 'active' THEN now() ELSE NULL END)
       RETURNING *`,
      [
        input.organizationId,
        input.name.trim(),
        slugify(input.name),
        input.senderDisplayName.trim(),
        input.messageClass,
        input.purpose.trim(),
        input.expectedFrequency.trim(),
        input.helpContact.trim(),
        input.termsUrl || null,
        input.privacyUrl || null,
        input.callbackUrl || null,
        input.activate ? "active" : "pending_approval",
        input.createdByUserId || null,
        input.activate ? input.createdByUserId || null : null
      ]
    );
    const program = programResult.rows[0];
    const disclosureResult = await db.query(
      `INSERT INTO consent_disclosure_versions (
         messaging_program_id, version, disclosure_text, content_hash, status,
         created_by_user_id, approved_by_user_id, approved_at
       )
       VALUES ($1, 1, $2, $3, 'approved', $4, $5, now())
       RETURNING *`,
      [program.id, disclosure, contentHash(disclosure), input.createdByUserId || null, input.createdByUserId || null]
    );
    const templateResult = await db.query(
      `INSERT INTO verification_template_versions (
         messaging_program_id, version, template_text, content_hash, status,
         created_by_user_id, approved_by_user_id, approved_at
       )
       VALUES ($1, 1, $2, $3, 'approved', $4, $5, now())
       RETURNING *`,
      [program.id, template, contentHash(template), input.createdByUserId || null, input.createdByUserId || null]
    );
    await db.query(
      `UPDATE messaging_programs
          SET current_disclosure_version_id = $1,
              current_template_version_id = $2,
              updated_at = now()
        WHERE id = $3`,
      [disclosureResult.rows[0].id, templateResult.rows[0].id, program.id]
    );
    return {
      ...program,
      current_disclosure_version_id: disclosureResult.rows[0].id,
      current_template_version_id: templateResult.rows[0].id,
      disclosure_text: disclosure,
      template_text: template
    };
  });
}

export async function approveMessagingProgram(input: { programId: string; organizationId: string; approvedByUserId: string }) {
  const result = await query(
    `UPDATE messaging_programs
        SET status = 'active',
            approved_by_user_id = $2,
            approved_at = now(),
            updated_at = now()
      WHERE id = $1
        AND organization_id = $3
        AND status IN ('draft', 'pending_approval')
      RETURNING *`,
    [input.programId, input.approvedByUserId, input.organizationId]
  );
  return result.rows[0] || null;
}

export async function updateMessagingProgram(input: {
  programId: string;
  organizationId: string;
  status?: "disabled";
  publicEnrollmentEnabled?: boolean;
}) {
  return transaction(async (db) => {
    const result = await db.query(
      `UPDATE messaging_programs
          SET status = COALESCE($3, status),
              public_enrollment_enabled = COALESCE($4, public_enrollment_enabled),
              updated_at = now()
      WHERE id = $1
          AND organization_id = $2
          AND ($3::text IS NULL OR is_system = false)
        RETURNING *`,
      [input.programId, input.organizationId, input.status || null, input.publicEnrollmentEnabled ?? null]
    );
    const program = result.rows[0];
    if (program && input.status === "disabled") {
      const canceled = await db.query(
        `UPDATE messages
            SET status = 'canceled', claim_gateway_id = NULL, claim_expires_at = NULL,
                finalized_at = now(), last_error = 'Messaging program disabled', updated_at = now()
          WHERE messaging_program_id = $1
            AND message_category = 'ordinary'
            AND status IN ('queued', 'retry_scheduled', 'claimed')
          RETURNING id, organization_id`,
        [input.programId]
      );
      for (const message of canceled.rows) {
        await recordMessageEventInTransaction(db, {
          organizationId: message.organization_id,
          messageId: message.id,
          eventType: "message.canceled",
          actorType: "system",
          details: { reason: "messaging_program_disabled", messagingProgramId: input.programId }
        });
      }
    }
    return program || null;
  });
}

export async function listMessagingPrograms(options: { organizationId?: string; activeOnly?: boolean } = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (options.organizationId) {
    values.push(options.organizationId);
    clauses.push(`p.organization_id = $${values.length}`);
  }
  if (options.activeOnly) clauses.push("p.status = 'active'");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await query(
    `SELECT p.*, d.disclosure_text, d.version AS disclosure_version,
            t.template_text, t.version AS template_version
       FROM messaging_programs p
       LEFT JOIN consent_disclosure_versions d ON d.id = p.current_disclosure_version_id
       LEFT JOIN verification_template_versions t ON t.id = p.current_template_version_id
      ${where}
      ORDER BY p.created_at DESC`,
    values
  );
  return result.rows;
}

export async function getMessagingProgram(id: string, options: { organizationId?: string; activeOnly?: boolean } = {}) {
  const result = await query(
    `SELECT p.*, o.name AS organization_name, d.disclosure_text, d.version AS disclosure_version,
            t.template_text, t.version AS template_version
       FROM messaging_programs p
       JOIN organizations o ON o.id = p.organization_id
       LEFT JOIN consent_disclosure_versions d ON d.id = p.current_disclosure_version_id
       LEFT JOIN verification_template_versions t ON t.id = p.current_template_version_id
      WHERE p.id = $1
        AND ($2::uuid IS NULL OR p.organization_id = $2::uuid)
        AND ($3::boolean = false OR p.status = 'active')`,
    [id, options.organizationId || null, Boolean(options.activeOnly)]
  );
  return result.rows[0] || null;
}
