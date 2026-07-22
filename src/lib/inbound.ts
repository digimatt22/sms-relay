import pg from "pg";
import { query, transaction } from "@/lib/db";
import { recordMessageEventInTransaction } from "@/lib/message-events";
import { redactPhone } from "@/lib/security";
import { createWebhookRequest } from "@/lib/webhooks";
import { normalizePhoneNumber } from "@/lib/phone";
import { createMessage } from "@/lib/messages";
import { createPlatformSuppression, recordClientOptOut, recordClientStart } from "@/lib/recipient-authorizations";

export type InboundSmsInput = {
  gatewayId: string;
  from: string;
  body: string;
  receivedAt: string;
  modemIndex?: number | null;
  messageStatus?: string | null;
  serviceCenter?: string | null;
  metadata?: Record<string, unknown>;
};

export async function ingestInboundSms(input: InboundSmsInput) {
  const from = normalizePhoneNumber(input.from);
  const result = await transaction(async (client: pg.PoolClient) => {
    const gateway = await client.query(
      `SELECT organization_id
         FROM gateways
        WHERE id = $1`,
      [input.gatewayId]
    );
    const gatewayOrganizationId = gateway.rows[0]?.organization_id;
    if (!gatewayOrganizationId) {
      throw new Error("Inbound gateway is not registered");
    }

    const candidatesResult = await client.query(
      `SELECT DISTINCT ON (m.id)
              m.id, m.organization_id, m.callback_url, m.messaging_program_id,
              m.recipient_authorization_id, m.submitted_at,
              p.sender_display_name, p.help_contact
         FROM messages m
         JOIN message_attempts a ON a.message_id = m.id
         LEFT JOIN messaging_programs p ON p.id = m.messaging_program_id
        WHERE m.to_number = $1
          AND a.gateway_id = $3
          AND a.status = 'carrier_submitted'
          AND COALESCE(m.metadata->>'systemType', '') NOT IN ('password_reset', 'mobile_verification')
          AND m.status = 'carrier_submitted'
          AND m.submitted_at IS NOT NULL
          AND m.submitted_at <= $2::timestamptz
          AND m.submitted_at >= $2::timestamptz - interval '7 days'
        ORDER BY m.id, m.submitted_at DESC`,
      [from, input.receivedAt, input.gatewayId]
    );
    const candidates = candidatesResult.rows.sort(
      (a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );
    const candidateOrganizations = new Set(candidates.map((candidate: any) => candidate.organization_id));
    const ambiguous = candidateOrganizations.size > 1;
    const matched = !ambiguous ? candidates[0] || null : null;
    const organizationId = matched?.organization_id || gatewayOrganizationId;

    const inboundResult = await client.query(
      `INSERT INTO inbound_messages (
         organization_id, gateway_id, from_number, from_number_redacted, body, received_at,
         modem_index, message_status, service_center, matched_message_id,
         callback_url, callback_status, metadata, fingerprint
       )
       VALUES (
         $1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz,
         $7, $8, $9, $10,
         $11, $12, $13::jsonb,
         encode(digest($2::text || '|' || $3 || '|' || $5 || '|' || $6, 'sha256'), 'hex')
       )
       ON CONFLICT (fingerprint) DO UPDATE SET updated_at = inbound_messages.updated_at
       RETURNING inbound_messages.*, (xmax = 0) AS was_created`,
      [
        organizationId,
        input.gatewayId,
        from,
        redactPhone(from),
        input.body,
        input.receivedAt,
        input.modemIndex ?? null,
        input.messageStatus || null,
        input.serviceCenter || null,
        matched?.id || null,
        matched?.callback_url || null,
        matched?.callback_url ? "pending" : "not_configured",
        JSON.stringify({
          ...(input.metadata || {}),
          attributionAmbiguous: ambiguous,
          candidateOrganizationCount: candidateOrganizations.size
        })
      ]
    );
    const created = inboundResult.rows[0];

    if (created.was_created) {
      await recordMessageEventInTransaction(client, {
        organizationId,
        messageId: created.matched_message_id || null,
        eventType: "sms.inbound.received",
        actorType: "gateway",
        actorId: input.gatewayId,
        details: {
          inboundMessageId: created.id,
          fromRedacted: created.from_number_redacted,
          matchedMessageId: created.matched_message_id || null
        }
      });
    }

    return { inbound: created, matched, ambiguous, gatewayOrganizationId };
  });

  const command = classifyConsentCommand(input.body);
  if (result.inbound.was_created && command === "stop") {
    if (result.matched) {
      await recordClientOptOut({
        organizationId: result.matched.organization_id,
        phoneNumber: from,
        reasonCode: "inbound_stop",
        source: "inbound",
        actorType: "recipient",
        gatewayId: input.gatewayId,
        inboundMessageId: result.inbound.id,
        matchedMessageId: result.matched.id
      });
    } else {
      await createPlatformSuppression({
        phoneNumber: from,
        source: "inbound",
        reasonCode: result.ambiguous ? "ambiguous_stop" : "unmatched_stop",
        gatewayId: input.gatewayId,
        inboundMessageId: result.inbound.id
      });
    }
    await enqueueConsentResponse({
      organizationId: result.matched?.organization_id || result.gatewayOrganizationId,
      gatewayId: input.gatewayId,
      phoneNumber: from,
      body: result.matched?.sender_display_name
        ? `${result.matched.sender_display_name}: You are opted out. No further messages will be sent. Reply START to request messages again.`
        : "You are opted out. No further messages will be sent. Contact the sender to request messages again.",
      matched: result.matched
    });
  } else if (result.inbound.was_created && command === "start" && result.matched?.messaging_program_id) {
    const authorization = await recordClientStart({
      organizationId: result.matched.organization_id,
      programId: result.matched.messaging_program_id,
      phoneNumber: from,
      gatewayId: input.gatewayId,
      inboundMessageId: result.inbound.id,
      matchedMessageId: result.matched.id
    });
    await enqueueConsentResponse({
      organizationId: result.matched.organization_id,
      gatewayId: input.gatewayId,
      phoneNumber: from,
      body: authorization
        ? `${result.matched.sender_display_name}: You are subscribed again. Reply STOP to opt out.`
        : `${result.matched.sender_display_name}: We could not restore authorization. Please use the sender's consent form.`,
      matched: result.matched
    });
  } else if (result.inbound.was_created && command === "help" && result.matched) {
    await enqueueConsentResponse({
      organizationId: result.matched.organization_id,
      gatewayId: input.gatewayId,
      phoneNumber: from,
      body: `${result.matched.sender_display_name || "Message sender"}: Help ${result.matched.help_contact || "is available from the sender"}. Reply STOP to opt out.`,
      matched: result.matched
    });
  }

  if (result.inbound.callback_url && result.inbound.callback_status === "pending") {
    return dispatchInboundCallback(result.inbound.id);
  }

  return result.inbound;
}

export function classifyConsentCommand(body: string): "stop" | "start" | "help" | null {
  const normalized = body.trim().toUpperCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ");
  if (["STOP", "STOP ALL", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPT OUT"].includes(normalized)) {
    return "stop";
  }
  if (/^(PLEASE )?(STOP|END) (TEXTING|MESSAGING|SENDING MESSAGES)( ME)?$/.test(normalized)) return "stop";
  if (["START", "UNSTOP", "SUBSCRIBE"].includes(normalized)) return "start";
  if (["HELP", "INFO"].includes(normalized)) return "help";
  return null;
}

async function enqueueConsentResponse(input: {
  organizationId: string;
  gatewayId: string;
  phoneNumber: string;
  body: string;
  matched?: any;
}) {
  try {
    await createMessage({
      to: input.phoneNumber,
      body: input.body,
      priority: 1,
      metadata: { systemType: "consent_response" },
      organizationId: input.organizationId,
      submittedVia: "dashboard",
      messagingProgramId: input.matched?.messaging_program_id || null,
      recipientAuthorizationId: input.matched?.recipient_authorization_id || null,
      messageCategory: "opt_out_confirmation",
      authorizationExempt: true,
      requiredGatewayId: input.gatewayId
    });
  } catch {
    // The suppression remains effective even when its one-time confirmation cannot be queued.
  }
}

export async function listInboundMessages(options: {
  organizationId: string;
  gatewayId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  sort?: "newest" | "oldest";
}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  values.push(options.organizationId);
  clauses.push(`i.organization_id = $${values.length}`);
  if (options.gatewayId) {
    values.push(options.gatewayId);
    clauses.push(`i.gateway_id = $${values.length}`);
  }
  if (options.fromDate) {
    values.push(options.fromDate);
    clauses.push(`i.received_at >= $${values.length}::date`);
  }
  if (options.toDate) {
    values.push(options.toDate);
    clauses.push(`i.received_at < ($${values.length}::date + interval '1 day')`);
  }
  const order = options.sort === "oldest" ? "ASC" : "DESC";
  const result = await query(
    `SELECT i.*, g.name AS gateway_name, m.id AS outbound_message_id
       FROM inbound_messages i
       LEFT JOIN gateways g ON g.id = i.gateway_id
       LEFT JOIN messages m ON m.id = i.matched_message_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY i.received_at ${order}, i.created_at ${order}
      LIMIT 200`,
    values
  );
  return result.rows;
}

export async function listInboundGateways(organizationId: string) {
  const result = await query(
    `SELECT DISTINCT g.id, g.name
       FROM inbound_messages i
       JOIN gateways g ON g.id = i.gateway_id
      WHERE i.organization_id = $1
      ORDER BY g.name ASC`,
    [organizationId]
  );
  return result.rows;
}

export async function countUnreadInboundMessages(organizationId: string, options: { excludeId?: string | null } = {}) {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM inbound_messages
      WHERE organization_id = $1
        AND read_at IS NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [organizationId, options.excludeId || null]
  );
  return Number(result.rows[0]?.count || 0);
}

export async function getInboundMessage(id: string, options: { organizationId: string; markRead?: boolean }) {
  if (options.markRead) {
    await query(
      `UPDATE inbound_messages
          SET read_at = COALESCE(read_at, now()), updated_at = now()
        WHERE id = $1
          AND organization_id = $2`,
      [id, options.organizationId]
    );
  }
  const result = await query(
    `SELECT i.*, g.name AS gateway_name, m.id AS outbound_message_id,
            CASE
              WHEN COALESCE(m.metadata->>'systemType', '') IN ('password_reset', 'mobile_verification') THEN '[Security code hidden]'
              ELSE m.body
            END AS outbound_body
       FROM inbound_messages i
       LEFT JOIN gateways g ON g.id = i.gateway_id
       LEFT JOIN messages m ON m.id = i.matched_message_id
      WHERE i.id = $1
        AND i.organization_id = $2`,
    [id, options.organizationId]
  );
  return result.rows[0] || null;
}

async function dispatchInboundCallback(id: string) {
  const result = await query<any>("SELECT * FROM inbound_messages WHERE id = $1", [id]);
  const inbound = result.rows[0];
  if (!inbound?.callback_url) return inbound;

  const payload = {
    event: "sms.inbound.received",
    inboundMessageId: inbound.id,
    matchedOutboundMessageId: inbound.matched_message_id,
    gatewayId: inbound.gateway_id,
    from: inbound.from_number,
    fromRedacted: inbound.from_number_redacted,
    body: inbound.body,
    receivedAt: inbound.received_at,
    metadata: inbound.metadata
  };

  const delivery = await query(
    `INSERT INTO callback_deliveries (
       organization_id, message_id, inbound_message_id, event_type, callback_url, payload
     )
     VALUES ($1, $2, $3, 'sms.inbound.received', $4, $5::jsonb)
     RETURNING id`,
    [
      inbound.organization_id,
      inbound.matched_message_id || null,
      inbound.id,
      inbound.callback_url,
      JSON.stringify(payload)
    ]
  );
  const deliveryId = delivery.rows[0].id;

  try {
    const request = createWebhookRequest(inbound.callback_url, payload);
    const response = await fetch(request.url, request.init);
    const text = await response.text();
    await query(
      `UPDATE callback_deliveries
          SET status = $1,
              attempt_count = attempt_count + 1,
              last_http_status = $2,
              last_response = $3,
              delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END,
              updated_at = now()
        WHERE id = $4`,
      [response.ok ? "delivered" : "failed", response.status, text.slice(0, 2000), deliveryId]
    );
    const update = await query(
      `UPDATE inbound_messages
          SET callback_status = $1,
              callback_http_status = $2,
              callback_response = $3,
              callback_attempted_at = now(),
              updated_at = now()
        WHERE id = $4
        RETURNING *`,
      [response.ok ? "delivered" : "failed", response.status, text.slice(0, 2000), id]
    );
    return update.rows[0];
  } catch (error) {
    await query(
      `UPDATE callback_deliveries
          SET status = 'failed',
              attempt_count = attempt_count + 1,
              last_response = $1,
              updated_at = now()
        WHERE id = $2`,
      [error instanceof Error ? error.message : String(error), deliveryId]
    );
    const update = await query(
      `UPDATE inbound_messages
          SET callback_status = 'failed',
              callback_response = $1,
              callback_attempted_at = now(),
              updated_at = now()
        WHERE id = $2
        RETURNING *`,
      [error instanceof Error ? error.message : String(error), id]
    );
    return update.rows[0];
  }
}
