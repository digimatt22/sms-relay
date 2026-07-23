import type pg from "pg";
import { query, transaction } from "@/lib/db";
import { createMessage } from "@/lib/messages";
import { normalizePhoneNumber } from "@/lib/phone";
import { createPasswordResetCode, hashPassword, redactPhone, verifyPassword } from "@/lib/security";
import { enqueueCallbackDelivery } from "@/lib/callbacks";
import { getMessagingProgram, renderVerificationTemplate } from "@/lib/messaging-programs";
import { canonicalEventType, publishPlatformEvent } from "@/lib/event-contract";
import { recordMessageEvent } from "@/lib/message-events";

const CHALLENGE_LIFETIME_MINUTES = 10;
const CHALLENGE_MAX_ATTEMPTS = 5;
const CHALLENGE_COOLDOWN_SECONDS = 60;
const CHALLENGE_MAX_PER_HOUR = 5;

type AuthorizationActor = {
  apiClientId?: string | null;
  apiClientKeyId?: string | null;
  userId?: string | null;
  actorType?: "api_client" | "admin_user" | "recipient" | "system";
};

type RequestAuthorizationInput = AuthorizationActor & {
  organizationId: string;
  programId: string;
  phoneNumber: string;
  clientRecipientReference?: string | null;
  consentSource: "hosted" | "client_form" | "inbound_start";
  recipientInitiated: boolean;
  evidenceReference?: string | null;
  idempotencyKey?: string | null;
  callbackUrl?: string | null;
};

async function recordAuthorizationEvent(
  db: pg.PoolClient,
  input: {
    organizationId: string;
    authorizationId: string;
    eventType: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    reasonCode?: string | null;
    actorType: string;
    actorId?: string | null;
    gatewayId?: string | null;
    inboundMessageId?: string | null;
    outboundMessageId?: string | null;
    details?: Record<string, unknown>;
  }
) {
  await db.query(
    `INSERT INTO recipient_authorization_events (
       organization_id, recipient_authorization_id, event_type, previous_status, new_status,
       reason_code, actor_type, actor_id, gateway_id, inbound_message_id, outbound_message_id, details
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      input.organizationId,
      input.authorizationId,
      input.eventType,
      input.previousStatus || null,
      input.newStatus || null,
      input.reasonCode || null,
      input.actorType,
      input.actorId || null,
      input.gatewayId || null,
      input.inboundMessageId || null,
      input.outboundMessageId || null,
      JSON.stringify(input.details || {})
    ]
  );
}

function callbackPayload(event: string, authorization: any) {
  return {
    event,
    authorizationId: authorization.id,
    organizationId: authorization.organization_id,
    programId: authorization.messaging_program_id,
    clientRecipientReference: authorization.client_recipient_reference || null,
    phoneRedacted: authorization.phone_number_redacted,
    status: authorization.status,
    occurredAt: new Date().toISOString()
  };
}

async function enqueueAuthorizationCallback(event: string, authorization: any, messageId?: string | null) {
  const payload = callbackPayload(event, authorization);
  await enqueueCallbackDelivery({
    organizationId: authorization.organization_id,
    eventType: event,
    callbackUrl: authorization.callback_url || authorization.program_callback_url || null,
    payload,
    messageId: messageId || null,
    recipientAuthorizationId: authorization.id
  });
  const eventType = canonicalEventType(event);
  if (eventType) {
    await publishPlatformEvent({
      organizationId: authorization.organization_id,
      apiClientId: authorization.created_by_api_client_id || null,
      apiClientKeyId: authorization.created_by_api_client_key_id || null,
      messageId: messageId || null,
      recipientAuthorizationId: authorization.id,
      eventType,
      data: payload
    });
  }
}

export async function requestRecipientAuthorization(input: RequestAuthorizationInput) {
  if (!input.recipientInitiated) {
    throw new Error("Recipient-initiated consent is required before sending a verification message");
  }
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const program = await getMessagingProgram(input.programId, { organizationId: input.organizationId, activeOnly: true });
  if (!program || !program.current_disclosure_version_id || !program.current_template_version_id) {
    throw new Error("Messaging program is not active or approved");
  }

  if (input.idempotencyKey) {
    const replay = await query<any>(
      `SELECT a.*, p.callback_url AS program_callback_url, c.expires_at
         FROM verification_challenges c
         JOIN recipient_authorizations a ON a.id = c.recipient_authorization_id
         JOIN messaging_programs p ON p.id = a.messaging_program_id
        WHERE c.organization_id = $1
          AND c.idempotency_key = $2`,
      [input.organizationId, input.idempotencyKey]
    );
    if (replay.rows[0]) {
      if (replay.rows[0].messaging_program_id !== input.programId || replay.rows[0].phone_number !== phoneNumber) {
        throw new Error("Idempotency key was already used for a different authorization request");
      }
      return replay.rows[0];
    }
  }

  const limits = await query<{ total: number; recent: number }>(
    `SELECT COUNT(*) FILTER (WHERE c.created_at >= now() - interval '1 hour')::int AS total,
            COUNT(*) FILTER (WHERE c.created_at >= now() - ($3::int * interval '1 second'))::int AS recent
       FROM verification_challenges c
       JOIN recipient_authorizations a ON a.id = c.recipient_authorization_id
      WHERE a.organization_id = $1
        AND a.phone_number = $2`,
    [input.organizationId, phoneNumber, CHALLENGE_COOLDOWN_SECONDS]
  );
  if (Number(limits.rows[0]?.recent || 0) > 0) throw new Error("Wait before requesting another verification code");
  if (Number(limits.rows[0]?.total || 0) >= CHALLENGE_MAX_PER_HOUR) {
    throw new Error("Verification request limit reached for this phone number");
  }

  const code = createPasswordResetCode();
  const created = await transaction(async (db) => {
    const existingResult = await db.query(
      `SELECT *
         FROM recipient_authorizations
        WHERE organization_id = $1
          AND messaging_program_id = $2
          AND phone_number = $3
        FOR UPDATE`,
      [input.organizationId, input.programId, phoneNumber]
    );
    const existing = existingResult.rows[0];
    const authorizationResult = await db.query(
      `INSERT INTO recipient_authorizations (
         organization_id, messaging_program_id, phone_number, phone_number_redacted,
         client_recipient_reference, status, consent_source, consent_method,
         recipient_initiated, evidence_reference, disclosure_version_id,
         template_version_id, callback_url, created_by_api_client_id, created_by_user_id
         , created_by_api_client_key_id
       )
       VALUES ($1, $2, $3, $4, $5, 'challenge_pending', $6, 'double_opt_in', true,
               $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (organization_id, messaging_program_id, phone_number) DO UPDATE
         SET client_recipient_reference = COALESCE(EXCLUDED.client_recipient_reference, recipient_authorizations.client_recipient_reference),
             status = 'challenge_pending',
             consent_source = EXCLUDED.consent_source,
             consent_method = EXCLUDED.consent_method,
             recipient_initiated = true,
             evidence_reference = EXCLUDED.evidence_reference,
             disclosure_version_id = EXCLUDED.disclosure_version_id,
             template_version_id = EXCLUDED.template_version_id,
             callback_url = COALESCE(EXCLUDED.callback_url, recipient_authorizations.callback_url),
             requested_at = now(),
             verified_at = NULL,
             revoked_at = NULL,
             reverification_required_at = NULL,
             updated_at = now()
       RETURNING *`,
      [
        input.organizationId,
        input.programId,
        phoneNumber,
        redactPhone(phoneNumber),
        input.clientRecipientReference || null,
        input.consentSource,
        input.evidenceReference || null,
        program.current_disclosure_version_id,
        program.current_template_version_id,
        input.callbackUrl || null,
        input.apiClientId || null,
        input.userId || null,
        input.apiClientKeyId || null
      ]
    );
    const authorization = authorizationResult.rows[0];
    await db.query(
      `UPDATE verification_challenges
          SET status = 'superseded', used_at = now(), updated_at = now()
        WHERE recipient_authorization_id = $1
          AND status = 'pending'`,
      [authorization.id]
    );
    const challengeResult = await db.query(
      `INSERT INTO verification_challenges (
         organization_id, recipient_authorization_id, code_hash, idempotency_key, expires_at
       )
       VALUES ($1, $2, $3, $4, now() + ($5::int * interval '1 minute'))
       RETURNING *`,
      [input.organizationId, authorization.id, hashPassword(code), input.idempotencyKey || null, CHALLENGE_LIFETIME_MINUTES]
    );
    await recordAuthorizationEvent(db, {
      organizationId: input.organizationId,
      authorizationId: authorization.id,
      eventType: "recipient.authorization.requested",
      previousStatus: existing?.status || null,
      newStatus: "challenge_pending",
      actorType: input.actorType || (input.apiClientId ? "api_client" : input.userId ? "admin_user" : "recipient"),
      actorId: input.apiClientId || input.userId || null,
      details: {
        consentSource: input.consentSource,
        disclosureVersionId: program.current_disclosure_version_id,
        templateVersionId: program.current_template_version_id
      }
    });
    return { authorization, challenge: challengeResult.rows[0] };
  });

  const body = renderVerificationTemplate(program.template_text, {
    clientName: program.sender_display_name,
    programName: program.name,
    code,
    frequencyNotice: program.expected_frequency
  });
  try {
    const message = await createMessage({
      to: phoneNumber,
      body,
      priority: 5,
      metadata: {
        systemType: "recipient_verification",
        recipientAuthorizationId: created.authorization.id,
        verificationChallengeId: created.challenge.id
      },
      organizationId: input.organizationId,
      apiClientId: input.apiClientId || null,
      apiClientKeyId: input.apiClientKeyId || null,
      userId: input.userId || null,
      submittedVia: input.apiClientId ? "api" : "dashboard",
      messagingProgramId: input.programId,
      recipientAuthorizationId: created.authorization.id,
      messageCategory: "verification",
      authorizationExempt: true
    });
    await transaction(async (db) => {
      await db.query("UPDATE verification_challenges SET message_id = $1, updated_at = now() WHERE id = $2", [message.id, created.challenge.id]);
      await recordAuthorizationEvent(db, {
        organizationId: input.organizationId,
        authorizationId: created.authorization.id,
        eventType: "recipient.authorization.challenge_sent",
        previousStatus: "challenge_pending",
        newStatus: "challenge_pending",
        actorType: "system",
        outboundMessageId: message.id,
        details: { challengeId: created.challenge.id, expiresAt: created.challenge.expires_at }
      });
    });
    const authorization = {
      ...created.authorization,
      program_callback_url: program.callback_url,
      expires_at: created.challenge.expires_at
    };
    await enqueueAuthorizationCallback("recipient.authorization.challenge_sent", authorization, message.id);
    return authorization;
  } catch (error) {
    await transaction(async (db) => {
      await db.query("UPDATE verification_challenges SET status = 'failed', used_at = now(), updated_at = now() WHERE id = $1", [created.challenge.id]);
      await db.query("UPDATE recipient_authorizations SET status = 'verification_expired', updated_at = now() WHERE id = $1", [created.authorization.id]);
      await recordAuthorizationEvent(db, {
        organizationId: input.organizationId,
        authorizationId: created.authorization.id,
        eventType: "recipient.authorization.challenge_failed",
        previousStatus: "challenge_pending",
        newStatus: "verification_expired",
        reasonCode: "message_enqueue_failed",
        actorType: "system"
      });
    });
    throw error;
  }
}

export async function confirmRecipientAuthorization(input: {
  authorizationId: string;
  code: string;
  organizationId?: string;
  actorType?: "api_client" | "recipient" | "admin_user";
  actorId?: string | null;
}) {
  const normalizedCode = input.code.replace(/\D/g, "");
  const result = await transaction(async (db) => {
    const rowResult = await db.query(
      `SELECT a.*, p.callback_url AS program_callback_url, c.id AS challenge_id,
              c.code_hash, c.attempts, c.expires_at
         FROM recipient_authorizations a
         JOIN messaging_programs p ON p.id = a.messaging_program_id
         JOIN verification_challenges c ON c.recipient_authorization_id = a.id
        WHERE a.id = $1
          AND ($2::uuid IS NULL OR a.organization_id = $2::uuid)
          AND c.status = 'pending'
        ORDER BY c.created_at DESC
        LIMIT 1
        FOR UPDATE OF a, c`,
      [input.authorizationId, input.organizationId || null]
    );
    const authorization = rowResult.rows[0];
    if (!authorization || authorization.attempts >= CHALLENGE_MAX_ATTEMPTS || new Date(authorization.expires_at) <= new Date()) {
      return null;
    }
    if (!/^\d{6}$/.test(normalizedCode) || !verifyPassword(normalizedCode, authorization.code_hash)) {
      const nextAttempts = Number(authorization.attempts) + 1;
      await db.query(
        `UPDATE verification_challenges
            SET attempts = attempts + 1,
                status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE status END,
                used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END,
                updated_at = now()
          WHERE id = $1`,
        [authorization.challenge_id, CHALLENGE_MAX_ATTEMPTS]
      );
      if (nextAttempts >= CHALLENGE_MAX_ATTEMPTS) {
        await db.query("UPDATE recipient_authorizations SET status = 'verification_expired', updated_at = now() WHERE id = $1", [authorization.id]);
        await recordAuthorizationEvent(db, {
          organizationId: authorization.organization_id,
          authorizationId: authorization.id,
          eventType: "recipient.authorization.expired",
          previousStatus: "challenge_pending",
          newStatus: "verification_expired",
          reasonCode: "attempt_limit",
          actorType: input.actorType || "recipient",
          actorId: input.actorId || null
        });
      }
      return null;
    }

    await db.query(
      `UPDATE verification_challenges
          SET status = 'verified', used_at = now(), updated_at = now()
        WHERE id = $1`,
      [authorization.challenge_id]
    );
    const updatedResult = await db.query(
      `UPDATE recipient_authorizations
          SET status = 'verified_authorized', verified_at = now(), revoked_at = NULL,
              reverification_required_at = NULL, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [authorization.id]
    );
    await db.query(
      `UPDATE opt_outs
          SET status = 'inactive', reconsented_at = now(), updated_at = now()
        WHERE organization_id = $1
          AND phone_number = $2
          AND status = 'active'`,
      [authorization.organization_id, authorization.phone_number]
    );
    await recordAuthorizationEvent(db, {
      organizationId: authorization.organization_id,
      authorizationId: authorization.id,
      eventType: "recipient.authorization.verified",
      previousStatus: "challenge_pending",
      newStatus: "verified_authorized",
      actorType: input.actorType || "recipient",
      actorId: input.actorId || null,
      details: { challengeId: authorization.challenge_id }
    });
    return { ...updatedResult.rows[0], program_callback_url: authorization.program_callback_url };
  });
  if (result) await enqueueAuthorizationCallback("recipient.authorization.verified", result);
  return result;
}

export async function resendRecipientAuthorization(input: { authorizationId: string; organizationId: string; apiClientId?: string | null; userId?: string | null }) {
  const current = await getRecipientAuthorization(input.authorizationId, { organizationId: input.organizationId });
  if (!current) throw new Error("Recipient authorization not found");
  return requestRecipientAuthorization({
    organizationId: current.organization_id,
    programId: current.messaging_program_id,
    phoneNumber: current.phone_number,
    clientRecipientReference: current.client_recipient_reference,
    consentSource: current.consent_source as RequestAuthorizationInput["consentSource"],
    recipientInitiated: true,
    evidenceReference: current.evidence_reference,
    callbackUrl: current.callback_url,
    idempotencyKey: null,
    apiClientId: input.apiClientId || null,
    userId: input.userId || null
  });
}

export async function revokeRecipientAuthorization(input: {
  authorizationId: string;
  organizationId: string;
  reasonCode?: string;
  actorType: "api_client" | "admin_user" | "recipient" | "system";
  actorId?: string | null;
}) {
  const authorization = await getRecipientAuthorization(input.authorizationId, { organizationId: input.organizationId });
  if (!authorization) return null;
  return recordClientOptOut({
    organizationId: input.organizationId,
    phoneNumber: authorization.phone_number,
    reasonCode: input.reasonCode || "manual_revocation",
    source: input.actorType,
    actorType: input.actorType,
    actorId: input.actorId || null
  });
}

export async function recordClientOptOut(input: {
  organizationId: string;
  phoneNumber: string;
  reasonCode: string;
  source: string;
  actorType: string;
  actorId?: string | null;
  gatewayId?: string | null;
  inboundMessageId?: string | null;
  matchedMessageId?: string | null;
}) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const affected = await transaction(async (db) => {
    await db.query(
      `INSERT INTO opt_outs (
         organization_id, phone_number, phone_number_redacted, source, status,
         gateway_id, matched_message_id, inbound_message_id, reason_code, opted_out_at
       )
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, now())
       ON CONFLICT (organization_id, phone_number) DO UPDATE
         SET source = EXCLUDED.source,
             status = 'active',
             gateway_id = EXCLUDED.gateway_id,
             matched_message_id = EXCLUDED.matched_message_id,
             inbound_message_id = EXCLUDED.inbound_message_id,
             reason_code = EXCLUDED.reason_code,
             opted_out_at = now(),
             reconsented_at = NULL,
             updated_at = now()`,
      [
        input.organizationId,
        phoneNumber,
        redactPhone(phoneNumber),
        input.source,
        input.gatewayId || null,
        input.matchedMessageId || null,
        input.inboundMessageId || null,
        input.reasonCode
      ]
    );
    const authorizations = await db.query(
      `WITH affected AS (
         SELECT id, status AS previous_status
           FROM recipient_authorizations
          WHERE organization_id = $1
            AND phone_number = $2
            AND status <> 'revoked'
          FOR UPDATE
       ), updated AS (
         UPDATE recipient_authorizations a
            SET status = 'revoked', revoked_at = now(), updated_at = now()
           FROM affected
          WHERE a.id = affected.id
          RETURNING a.*
       )
       SELECT updated.*, affected.previous_status, p.callback_url AS program_callback_url
         FROM updated
         JOIN affected ON affected.id = updated.id
         JOIN messaging_programs p ON p.id = updated.messaging_program_id`,
      [input.organizationId, phoneNumber]
    );
    const messages = await db.query(
      `UPDATE messages
          SET status = 'canceled', claim_gateway_id = NULL, claim_expires_at = NULL,
              finalized_at = now(), last_error = 'Recipient opted out', updated_at = now()
        WHERE organization_id = $1
          AND to_number = $2
          AND message_category = 'ordinary'
          AND status IN ('queued', 'retry_scheduled', 'claimed')
        RETURNING id`,
      [input.organizationId, phoneNumber]
    );
    for (const authorization of authorizations.rows) {
      await recordAuthorizationEvent(db, {
        organizationId: input.organizationId,
        authorizationId: authorization.id,
        eventType: "recipient.authorization.revoked",
        previousStatus: authorization.previous_status,
        newStatus: "revoked",
        reasonCode: input.reasonCode,
        actorType: input.actorType,
        actorId: input.actorId || null,
        gatewayId: input.gatewayId || null,
        inboundMessageId: input.inboundMessageId || null,
        outboundMessageId: input.matchedMessageId || null
      });
    }
    return { authorizations: authorizations.rows, canceledMessageIds: messages.rows.map((row) => row.id) };
  });
  for (const authorization of affected.authorizations) {
    await enqueueAuthorizationCallback("recipient.authorization.revoked", authorization);
  }
  for (const messageId of affected.canceledMessageIds) {
    await recordMessageEvent({
      organizationId: input.organizationId,
      messageId,
      eventType: "message.canceled",
      actorType: input.actorType,
      actorId: input.actorId || null,
      details: { reason: "recipient_opted_out", source: input.source }
    });
  }
  const publishedKeys = new Set<string>();
  for (const authorization of affected.authorizations) {
    const keyId = authorization.created_by_api_client_key_id || "";
    if (!keyId || publishedKeys.has(keyId)) continue;
    publishedKeys.add(keyId);
    await publishPlatformEvent({
      organizationId: input.organizationId,
      apiClientId: authorization.created_by_api_client_id || null,
      apiClientKeyId: keyId,
      messageId: input.matchedMessageId || null,
      inboundMessageId: input.inboundMessageId || null,
      recipientAuthorizationId: authorization.id,
      eventType: "recipient.opt_out.recorded",
      data: {
        phoneRedacted: authorization.phone_number_redacted,
        reasonCode: input.reasonCode,
        source: input.source,
        canceledMessageIds: affected.canceledMessageIds
      }
    });
  }
  return affected;
}

export async function createPlatformSuppression(input: {
  phoneNumber: string;
  source: string;
  reasonCode: string;
  gatewayId?: string | null;
  inboundMessageId?: string | null;
}) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const result = await query(
    `INSERT INTO platform_suppressions (
       phone_number, phone_number_redacted, source, reason_code, gateway_id, inbound_message_id
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (phone_number) DO UPDATE
       SET status = 'active', source = EXCLUDED.source, reason_code = EXCLUDED.reason_code,
           gateway_id = EXCLUDED.gateway_id, inbound_message_id = EXCLUDED.inbound_message_id,
           resolved_at = NULL, resolved_by_user_id = NULL, updated_at = now()
     RETURNING *`,
    [phoneNumber, redactPhone(phoneNumber), input.source, input.reasonCode, input.gatewayId || null, input.inboundMessageId || null]
  );
  const canceled = await query(
    `UPDATE messages
        SET status = 'canceled', claim_gateway_id = NULL, claim_expires_at = NULL,
            finalized_at = now(), last_error = 'Recipient platform-suppressed', updated_at = now()
      WHERE to_number = $1
        AND message_category = 'ordinary'
        AND status IN ('queued', 'retry_scheduled', 'claimed')
      RETURNING id, organization_id`,
    [phoneNumber]
  );
  for (const message of canceled.rows) {
    await recordMessageEvent({
      organizationId: message.organization_id,
      messageId: message.id,
      eventType: "message.canceled",
      actorType: "system",
      details: { reason: "recipient_platform_suppressed", source: input.source }
    });
  }
  return result.rows[0];
}

export async function recordClientStart(input: {
  organizationId: string;
  programId: string;
  phoneNumber: string;
  gatewayId?: string | null;
  inboundMessageId?: string | null;
  matchedMessageId?: string | null;
}) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const authorization = await transaction(async (db) => {
    const currentResult = await db.query(
      `SELECT *
         FROM recipient_authorizations
        WHERE organization_id = $1
          AND messaging_program_id = $2
          AND phone_number = $3
          AND status IN ('revoked', 'suppressed', 'verified_authorized')
        FOR UPDATE`,
      [input.organizationId, input.programId, phoneNumber]
    );
    const current = currentResult.rows[0];
    if (!current) return null;
    await db.query(
      `UPDATE opt_outs
          SET status = 'inactive', reconsented_at = now(), updated_at = now()
        WHERE organization_id = $1
          AND phone_number = $2
          AND status = 'active'`,
      [input.organizationId, phoneNumber]
    );
    const updatedResult = await db.query(
      `UPDATE recipient_authorizations
          SET status = 'verified_authorized', verified_at = now(), revoked_at = NULL,
              reverification_required_at = NULL, consent_source = 'inbound_start',
              recipient_initiated = true, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [current.id]
    );
    await recordAuthorizationEvent(db, {
      organizationId: input.organizationId,
      authorizationId: current.id,
      eventType: "recipient.authorization.reconsented",
      previousStatus: current.status,
      newStatus: "verified_authorized",
      reasonCode: "inbound_start",
      actorType: "recipient",
      gatewayId: input.gatewayId || null,
      inboundMessageId: input.inboundMessageId || null,
      outboundMessageId: input.matchedMessageId || null
    });
    return updatedResult.rows[0];
  });
  if (authorization) await enqueueAuthorizationCallback("recipient.authorization.reconsented", authorization);
  return authorization;
}

export async function getRecipientAuthorization(id: string, options: { organizationId?: string } = {}) {
  const result = await query(
    `SELECT a.*, p.name AS program_name, p.sender_display_name, p.callback_url AS program_callback_url
       FROM recipient_authorizations a
       JOIN messaging_programs p ON p.id = a.messaging_program_id
      WHERE a.id = $1
        AND ($2::uuid IS NULL OR a.organization_id = $2::uuid)`,
    [id, options.organizationId || null]
  );
  return result.rows[0] || null;
}

export async function listRecipientAuthorizations(options: { organizationId?: string; limit?: number } = {}) {
  const result = await query(
    `SELECT a.id, a.organization_id, a.messaging_program_id, a.phone_number_redacted,
            a.client_recipient_reference, a.status, a.consent_source, a.requested_at,
            a.verified_at, a.revoked_at, a.created_at, p.name AS program_name,
            p.sender_display_name
       FROM recipient_authorizations a
       JOIN messaging_programs p ON p.id = a.messaging_program_id
      WHERE ($1::uuid IS NULL OR a.organization_id = $1::uuid)
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [options.organizationId || null, options.limit || 200]
  );
  return result.rows;
}

export async function assertRecipientCanReceive(input: {
  organizationId: string;
  programId: string;
  phoneNumber: string;
}) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const result = await query(
    `SELECT
       EXISTS (
         SELECT 1 FROM platform_suppressions
          WHERE phone_number = $3 AND status = 'active'
       ) AS platform_suppressed,
       EXISTS (
         SELECT 1 FROM opt_outs
          WHERE organization_id = $1 AND phone_number = $3 AND status = 'active'
       ) AS client_suppressed,
       (
         SELECT id FROM recipient_authorizations
          WHERE organization_id = $1
            AND messaging_program_id = $2
            AND phone_number = $3
            AND status = 'verified_authorized'
          LIMIT 1
       ) AS authorization_id`,
    [input.organizationId, input.programId, phoneNumber]
  );
  const state = result.rows[0];
  if (state?.platform_suppressed) throw new Error("recipient_platform_suppressed");
  if (state?.client_suppressed) throw new Error("recipient_opted_out");
  if (!state?.authorization_id) throw new Error("recipient_authorization_required");
  return state.authorization_id as string;
}

export async function expireRecipientAuthorizationChallenges() {
  const expired = await transaction(async (db) => {
    const result = await db.query(
      `WITH expired_challenges AS (
         UPDATE verification_challenges
            SET status = 'expired', used_at = now(), updated_at = now()
          WHERE status = 'pending'
            AND expires_at <= now()
          RETURNING recipient_authorization_id
       ), affected AS (
         SELECT DISTINCT recipient_authorization_id
           FROM expired_challenges
       )
       UPDATE recipient_authorizations a
          SET status = 'verification_expired', updated_at = now()
         FROM affected
        WHERE a.id = affected.recipient_authorization_id
          AND a.status = 'challenge_pending'
        RETURNING a.*`,
      []
    );
    for (const authorization of result.rows) {
      await recordAuthorizationEvent(db, {
        organizationId: authorization.organization_id,
        authorizationId: authorization.id,
        eventType: "recipient.authorization.expired",
        previousStatus: "challenge_pending",
        newStatus: "verification_expired",
        reasonCode: "challenge_expired",
        actorType: "system"
      });
    }
    return result.rows;
  });
  for (const authorization of expired) {
    const enriched = await getRecipientAuthorization(authorization.id, { organizationId: authorization.organization_id });
    if (enriched) await enqueueAuthorizationCallback("recipient.authorization.expired", enriched);
  }
  return expired.length;
}
