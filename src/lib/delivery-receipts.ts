import { createHash } from "node:crypto";
import { transaction } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { redactPhone } from "@/lib/security";
import { publishPlatformEventInTransaction } from "@/lib/event-contract";

export type DeliveryReceiptInput = {
  gatewayId: string;
  messageReference: number;
  recipient?: string | null;
  serviceCenterTimestamp?: string | null;
  dischargeTime?: string | null;
  statusCode: number;
  normalizedStatus: "delivered" | "pending" | "undelivered" | "unknown";
  rawReport: string;
  receivedAt: string;
};

export async function ingestDeliveryReceipt(input: DeliveryReceiptInput) {
  const recipient = input.recipient ? safeNormalizePhone(input.recipient) : null;
  const fingerprint = createHash("sha256")
    .update([
      input.gatewayId,
      input.messageReference,
      recipient || "",
      input.serviceCenterTimestamp || "",
      input.dischargeTime || "",
      input.statusCode,
      input.rawReport
    ].join("|"))
    .digest("hex");

  return transaction(async (client) => {
    const gateway = await client.query("SELECT organization_id FROM gateways WHERE id = $1", [input.gatewayId]);
    const organizationId = gateway.rows[0]?.organization_id;
    if (!organizationId) throw new Error("Delivery receipt gateway is not registered");

    const matched = await client.query(
      `SELECT a.id AS attempt_id, a.message_id, m.organization_id, m.conversation_thread_id,
              m.api_client_id, m.api_client_key_id, m.callback_url, m.to_number_redacted,
              m.delivery_status AS current_delivery_status
         FROM message_attempts a
         JOIN messages m ON m.id = a.message_id
        WHERE a.gateway_id = $1
          AND a.modem_message_reference = $2
          AND a.submitted_at IS NOT NULL
          AND a.submitted_at >= $3::timestamptz - interval '7 days'
          AND a.submitted_at <= $3::timestamptz + interval '5 minutes'
          AND ($4::text IS NULL OR m.to_number = $4)
        ORDER BY a.submitted_at DESC
        LIMIT 1`,
      [input.gatewayId, input.messageReference, input.receivedAt, recipient]
    );
    const match = matched.rows[0] || null;

    const inserted = await client.query(
      `INSERT INTO delivery_receipts (
         organization_id, gateway_id, message_id, message_attempt_id,
         modem_message_reference, recipient_number, recipient_number_redacted,
         service_center_timestamp, discharge_time, status_code, normalized_status,
         raw_report, fingerprint, received_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (fingerprint) DO UPDATE SET fingerprint = delivery_receipts.fingerprint
       RETURNING *, (xmax = 0) AS was_created`,
      [
        organizationId,
        input.gatewayId,
        match?.message_id || null,
        match?.attempt_id || null,
        input.messageReference,
        recipient,
        recipient ? redactPhone(recipient) : null,
        input.serviceCenterTimestamp || null,
        input.dischargeTime || null,
        input.statusCode,
        input.normalizedStatus,
        input.rawReport,
        fingerprint,
        input.receivedAt
      ]
    );
    const receipt = inserted.rows[0];
    if (!receipt.was_created || !match) return { ...receipt, matched: Boolean(match) };

    const deliveryRank: Record<string, number> = {
      pending: 1,
      unknown: 2,
      undelivered: 3,
      delivered: 4
    };
    const currentRank = deliveryRank[match.current_delivery_status] || 0;
    const incomingRank = deliveryRank[input.normalizedStatus] || 0;
    if (incomingRank < currentRank) {
      return { ...receipt, matched: true, applied: false, ignoredReason: "delivery_state_would_regress" };
    }

    await client.query(
      `UPDATE message_attempts
          SET delivery_status = $1,
              delivery_status_code = $2,
              delivery_reported_at = $3,
              finished_at = COALESCE(finished_at, $3)
        WHERE id = $4`,
      [input.normalizedStatus, input.statusCode, input.receivedAt, match.attempt_id]
    );

    const statusMap = {
      delivered: "delivery_confirmed",
      pending: null,
      undelivered: "delivery_failed",
      unknown: "delivery_unknown"
    } as const;
    const messageStatus = statusMap[input.normalizedStatus];
    await client.query(
      `UPDATE messages
          SET status = COALESCE($1::message_status, status),
              delivery_status = $2,
              delivered_at = CASE WHEN $2 = 'delivered' THEN $3 ELSE delivered_at END,
              delivery_failed_at = CASE WHEN $2 = 'undelivered' THEN $3 ELSE delivery_failed_at END,
              delivery_status_updated_at = $3,
              finalized_at = CASE WHEN $1::message_status IS NOT NULL THEN $3 ELSE finalized_at END,
              updated_at = now()
        WHERE id = $4
          AND status IN ('carrier_submitted', 'delivery_unknown', 'delivery_confirmed', 'delivery_failed')`,
      [messageStatus, input.normalizedStatus, input.receivedAt, match.message_id]
    );

    const eventType = input.normalizedStatus === "delivered"
      ? "sms.outbound.delivery_confirmed"
      : input.normalizedStatus === "undelivered"
        ? "sms.outbound.delivery_failed"
        : input.normalizedStatus === "pending"
          ? "sms.outbound.delivery_pending"
          : "sms.outbound.delivery_unknown";
    const envelope = await publishPlatformEventInTransaction(client, {
      organizationId: match.organization_id,
      apiClientId: match.api_client_id,
      apiClientKeyId: match.api_client_key_id,
      messageId: match.message_id,
      conversationThreadId: match.conversation_thread_id,
      eventType,
      occurredAt: input.receivedAt,
      data: {
        attemptId: match.attempt_id,
        deliveryReceiptId: receipt.id,
        modemMessageReference: input.messageReference,
        status: input.normalizedStatus,
        statusCode: input.statusCode,
        recipientNumberRedacted: receipt.recipient_number_redacted,
        serviceCenterTimestamp: input.serviceCenterTimestamp || null,
        dischargeTime: input.dischargeTime || null
      }
    });

    if (match.callback_url) {
      await client.query(
        `INSERT INTO callback_deliveries (
           organization_id, message_id, platform_event_id, api_client_key_id,
           event_type, callback_url, payload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          match.organization_id,
          match.message_id,
          envelope.id,
          match.api_client_key_id,
          eventType,
          match.callback_url,
          JSON.stringify(envelope)
        ]
      );
    }

    return { ...receipt, matched: true, applied: true };
  });
}

function safeNormalizePhone(value: string) {
  try {
    return normalizePhoneNumber(value);
  } catch {
    return value.trim();
  }
}
