import { query, transaction } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { createWebhookRequest } from "@/lib/webhooks";

type CallbackDelivery = {
  id: string;
  callback_url: string;
  payload: unknown;
  attempt_count: number;
};

export async function enqueueCallbackDelivery(input: {
  organizationId: string;
  eventType: string;
  callbackUrl?: string | null;
  payload: Record<string, unknown>;
  messageId?: string | null;
  inboundMessageId?: string | null;
  recipientAuthorizationId?: string | null;
}) {
  if (!input.callbackUrl) return null;
  const result = await query<{ id: string }>(
    `INSERT INTO callback_deliveries (
       organization_id, message_id, inbound_message_id, recipient_authorization_id,
       event_type, callback_url, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      input.organizationId,
      input.messageId || null,
      input.inboundMessageId || null,
      input.recipientAuthorizationId || null,
      input.eventType,
      input.callbackUrl,
      JSON.stringify({ eventId: input.payload.eventId || randomUUID(), ...input.payload })
    ]
  );
  return result.rows[0] || null;
}

export async function processPendingCallbackDeliveries(limit = 25) {
  const deliveries = await transaction(async (client) => {
    const result = await client.query<CallbackDelivery>(
      `WITH due AS (
         SELECT id
           FROM callback_deliveries
          WHERE status IN ('pending', 'failed')
            AND next_attempt_at <= now()
            AND attempt_count < 8
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       UPDATE callback_deliveries d
          SET status = 'sending',
              updated_at = now()
         FROM due
        WHERE d.id = due.id
        RETURNING d.id, d.callback_url, d.payload, d.attempt_count`,
      [limit]
    );
    return result.rows;
  });

  const results = [];
  for (const delivery of deliveries) {
    results.push(await sendCallbackDelivery(delivery));
  }
  return results;
}

export async function retryCallbackDelivery(id: string) {
  const result = await query<CallbackDelivery>(
    `UPDATE callback_deliveries
        SET status = 'sending',
            next_attempt_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING id, callback_url, payload, attempt_count`,
    [id]
  );
  const delivery = result.rows[0];
  if (!delivery) return null;
  return sendCallbackDelivery(delivery);
}

async function sendCallbackDelivery(delivery: CallbackDelivery) {
  try {
    const request = createWebhookRequest(delivery.callback_url, delivery.payload);
    const response = await fetch(request.url, request.init);
    const text = await response.text();
    const status = response.ok ? "delivered" : "failed";
    await query(
      `UPDATE callback_deliveries
          SET status = $1,
              attempt_count = attempt_count + 1,
              next_attempt_at = CASE
                WHEN $1 = 'delivered' THEN next_attempt_at
                ELSE now() + (LEAST((attempt_count + 1) * 300, 3600)::text || ' seconds')::interval
              END,
              last_http_status = $2,
              last_response = $3,
              delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END,
              updated_at = now()
        WHERE id = $4`,
      [status, response.status, text.slice(0, 2000), delivery.id]
    );
    return { id: delivery.id, status, httpStatus: response.status };
  } catch (error) {
    await query(
      `UPDATE callback_deliveries
          SET status = 'failed',
              attempt_count = attempt_count + 1,
              next_attempt_at = now() + (LEAST((attempt_count + 1) * 300, 3600)::text || ' seconds')::interval,
              last_response = $1,
              updated_at = now()
        WHERE id = $2`,
      [error instanceof Error ? error.message : String(error), delivery.id]
    );
    return { id: delivery.id, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function listCallbackDeliveries(options: { organizationId?: string } = {}) {
  const values: unknown[] = [];
  let where = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    where = `WHERE d.organization_id = $${values.length}`;
  }
  const result = await query(
    `SELECT d.*, m.to_number_redacted, i.from_number_redacted
       FROM callback_deliveries d
       LEFT JOIN messages m ON m.id = d.message_id
       LEFT JOIN inbound_messages i ON i.id = d.inbound_message_id
      ${where}
      ORDER BY d.created_at DESC
      LIMIT 200`,
    values
  );
  return result.rows;
}
