import { transaction } from "@/lib/db";
import { expireRecipientAuthorizationChallenges } from "@/lib/recipient-authorizations";
import { isRecipientConsentDebugBypassEnabled } from "@/lib/debug-flags";
import { publishPlatformEventInTransaction } from "@/lib/event-contract";
import { recordMessageEventInTransaction } from "@/lib/message-events";

export async function runMaintenanceJobs() {
  const expiredAuthorizationChallenges = await expireRecipientAuthorizationChallenges();
  const debugBypassRecipientConsent = isRecipientConsentDebugBypassEnabled();
  return transaction(async (client) => {
    const unknownDeliveries = await client.query(
      `UPDATE messages
          SET status = 'delivery_unknown', delivery_status = 'unknown',
              delivery_status_updated_at = now(), finalized_at = now(), updated_at = now()
        WHERE status = 'carrier_submitted'
          AND submitted_at < now() - interval '72 hours'
        RETURNING id, organization_id, api_client_id, api_client_key_id, conversation_thread_id, submitted_at`
    );
    for (const message of unknownDeliveries.rows) {
      await publishPlatformEventInTransaction(client, {
        organizationId: message.organization_id,
        apiClientId: message.api_client_id,
        apiClientKeyId: message.api_client_key_id,
        messageId: message.id,
        conversationThreadId: message.conversation_thread_id,
        eventType: "sms.outbound.delivery_unknown",
        data: { submittedAt: message.submitted_at, reason: "delivery_receipt_timeout", timeoutHours: 72 }
      });
    }
    await client.query("DELETE FROM daily_usage_rollups WHERE usage_date >= (current_date - interval '120 days')::date");

    const rollup = await client.query(
      `INSERT INTO daily_usage_rollups (
         organization_id, api_client_id, gateway_id, usage_date,
         outbound_count, submitted_count, failed_count, inbound_count
       )
       WITH usage_rows AS (
         SELECT organization_id,
                api_client_id,
                claim_gateway_id AS gateway_id,
                created_at::date AS usage_date,
                1 AS outbound_count,
                CASE WHEN status IN ('carrier_submitted', 'delivery_confirmed', 'delivery_failed', 'delivery_unknown') THEN 1 ELSE 0 END AS submitted_count,
                CASE WHEN status IN ('failed', 'dead_lettered') THEN 1 ELSE 0 END AS failed_count,
                0 AS inbound_count
           FROM messages
          WHERE created_at >= now() - interval '120 days'
         UNION ALL
         SELECT organization_id,
                NULL::uuid AS api_client_id,
                gateway_id,
                created_at::date AS usage_date,
                0 AS outbound_count,
                0 AS submitted_count,
                0 AS failed_count,
                1 AS inbound_count
           FROM inbound_messages
          WHERE created_at >= now() - interval '120 days'
       )
       SELECT organization_id,
              api_client_id,
              gateway_id,
              usage_date,
              SUM(outbound_count)::int,
              SUM(submitted_count)::int,
              SUM(failed_count)::int,
              SUM(inbound_count)::int
         FROM usage_rows
        GROUP BY organization_id, api_client_id, gateway_id, usage_date`
    );

    const logs = await client.query(
      "DELETE FROM gateway_logs WHERE created_at < now() - interval '90 days'"
    );
    const health = await client.query(
      "DELETE FROM gateway_health WHERE created_at < now() - interval '90 days'"
    );
    const invalidQueuedMessages = await client.query(
      `UPDATE messages m
          SET status = 'canceled', finalized_at = now(),
              last_error = 'Recipient authorization or suppression changed', updated_at = now()
        WHERE m.message_category = 'ordinary'
          AND m.status IN ('queued', 'retry_scheduled')
          AND (
            m.messaging_program_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM messaging_programs active_program
               WHERE active_program.id = m.messaging_program_id
                 AND active_program.organization_id = m.organization_id
                 AND active_program.status = 'active'
            )
            OR (
              $1::boolean = false
              AND (
                m.recipient_authorization_id IS NULL
                OR NOT EXISTS (
              SELECT 1
                FROM recipient_authorizations a
                JOIN messaging_programs p ON p.id = a.messaging_program_id
               WHERE a.id = m.recipient_authorization_id
                 AND a.organization_id = m.organization_id
                 AND a.messaging_program_id = m.messaging_program_id
                 AND a.phone_number = m.to_number
                 AND a.status = 'verified_authorized'
                 AND p.status = 'active'
                )
              )
            )
            OR EXISTS (
              SELECT 1 FROM opt_outs o
               WHERE o.organization_id = m.organization_id
                 AND o.phone_number = m.to_number
                 AND o.status = 'active'
            )
            OR EXISTS (
              SELECT 1 FROM platform_suppressions s
               WHERE s.phone_number = m.to_number
                 AND s.status = 'active'
            )
          )
        RETURNING id, organization_id`,
      [debugBypassRecipientConsent]
    );
    for (const message of invalidQueuedMessages.rows) {
      await recordMessageEventInTransaction(client, {
        organizationId: message.organization_id,
        messageId: message.id,
        eventType: "message.canceled",
        actorType: "system",
        details: { reason: "recipient_authorization_or_suppression_changed" }
      });
    }

    return {
      expiredAuthorizationChallenges,
      deliveryUnknownRows: unknownDeliveries.rowCount || 0,
      canceledUnauthorizedMessageRows: invalidQueuedMessages.rowCount || 0,
      rollupRows: rollup.rowCount || 0,
      deletedLogRows: logs.rowCount || 0,
      deletedHealthRows: health.rowCount || 0
    };
  });
}
