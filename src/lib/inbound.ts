import pg from "pg";
import { query, transaction } from "@/lib/db";
import { recordMessageEventInTransaction } from "@/lib/message-events";
import { redactPhone } from "@/lib/security";
import { createWebhookRequest } from "@/lib/webhooks";

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
  const inbound = await transaction(async (client: pg.PoolClient) => {
    const gateway = await client.query(
      `SELECT organization_id
         FROM gateways
        WHERE id = $1`,
      [input.gatewayId]
    );
    const organizationId = gateway.rows[0]?.organization_id;
    if (!organizationId) {
      throw new Error("Inbound gateway is not registered");
    }

    const match = await client.query(
      `SELECT id, callback_url
         FROM messages
        WHERE to_number = $1
          AND organization_id = $3
          AND status = 'carrier_submitted'
          AND submitted_at IS NOT NULL
          AND submitted_at <= $2::timestamptz
          AND submitted_at >= $2::timestamptz - interval '7 days'
        ORDER BY submitted_at DESC
        LIMIT 1`,
      [input.from, input.receivedAt, organizationId]
    );
    const matched = match.rows[0] || null;

    const result = await client.query(
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
       RETURNING *`,
      [
        organizationId,
        input.gatewayId,
        input.from,
        redactPhone(input.from),
        input.body,
        input.receivedAt,
        input.modemIndex ?? null,
        input.messageStatus || null,
        input.serviceCenter || null,
        matched?.id || null,
        matched?.callback_url || null,
        matched?.callback_url ? "pending" : "not_configured",
        JSON.stringify(input.metadata || {})
      ]
    );
    const created = result.rows[0];

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

    if (isOptOutReply(input.body)) {
      await client.query(
        `INSERT INTO opt_outs (organization_id, phone_number, phone_number_redacted, source)
         VALUES ($1, $2, $3, 'inbound')
         ON CONFLICT (organization_id, phone_number) DO UPDATE
           SET status = 'active', updated_at = now()`,
        [organizationId, input.from, redactPhone(input.from)]
      );
      await recordMessageEventInTransaction(client, {
        organizationId,
        messageId: created.matched_message_id || null,
        eventType: "sms.opt_out.recorded",
        actorType: "system",
        details: { inboundMessageId: created.id, fromRedacted: created.from_number_redacted }
      });
    }

    return created;
  });

  if (inbound.callback_url && inbound.callback_status === "pending") {
    return dispatchInboundCallback(inbound.id);
  }

  return inbound;
}

function isOptOutReply(body: string) {
  const normalized = body.trim().toUpperCase();
  return ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalized);
}

export async function listInboundMessages(options: { organizationId?: string } = {}) {
  const values: unknown[] = [];
  let where = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    where = `WHERE i.organization_id = $${values.length}`;
  }
  const result = await query(
    `SELECT i.*, g.name AS gateway_name, m.id AS outbound_message_id
       FROM inbound_messages i
       LEFT JOIN gateways g ON g.id = i.gateway_id
       LEFT JOIN messages m ON m.id = i.matched_message_id
      ${where}
      ORDER BY i.created_at DESC
      LIMIT 200`,
    values
  );
  return result.rows;
}

export async function getInboundMessage(id: string) {
  const result = await query(
    `SELECT i.*, g.name AS gateway_name, m.id AS outbound_message_id, m.body AS outbound_body
       FROM inbound_messages i
       LEFT JOIN gateways g ON g.id = i.gateway_id
       LEFT JOIN messages m ON m.id = i.matched_message_id
      WHERE i.id = $1`,
    [id]
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
