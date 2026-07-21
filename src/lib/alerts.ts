import { query, transaction } from "@/lib/db";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations";

export async function generateOperationalAlerts() {
  return transaction(async (client) => {
    await client.query(
      `INSERT INTO alerts (organization_id, alert_type, severity, subject_type, subject_id, message, details)
       SELECT g.organization_id,
              'gateway_offline',
              'critical',
              'gateway',
              g.id,
              'Gateway has not reported heartbeat recently',
              jsonb_build_object('gatewayName', g.name, 'lastHeartbeatAt', g.last_heartbeat_at)
         FROM gateways g
        WHERE g.disabled_at IS NULL
          AND g.status <> 'maintenance'
          AND (g.last_heartbeat_at IS NULL OR g.last_heartbeat_at < now() - interval '5 minutes')
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
             WHERE a.status = 'open'
               AND a.alert_type = 'gateway_offline'
               AND a.subject_id = g.id
          )`
    );

    await client.query(
      `INSERT INTO alerts (organization_id, alert_type, severity, subject_type, subject_id, message, details)
       SELECT g.organization_id,
              'repeated_send_failures',
              'warning',
              'gateway',
              g.id,
              'Gateway has repeated send failures',
              jsonb_build_object('gatewayName', g.name, 'failureCount', COUNT(a.id))
         FROM gateways g
         JOIN message_attempts a ON a.gateway_id = g.id
        WHERE a.status = 'failed'
          AND a.finished_at >= now() - interval '30 minutes'
        GROUP BY g.organization_id, g.id, g.name
       HAVING COUNT(a.id) >= 3
          AND NOT EXISTS (
            SELECT 1 FROM alerts existing
             WHERE existing.status = 'open'
               AND existing.alert_type = 'repeated_send_failures'
               AND existing.subject_id = g.id
          )`
    );

    await client.query(
      `INSERT INTO alerts (organization_id, alert_type, severity, subject_type, message, details)
       SELECT organization_id,
              'queue_depth_high',
              'warning',
              'organization',
              'Outbound queue depth is above threshold',
              jsonb_build_object('queuedCount', COUNT(id))
         FROM messages
        WHERE status IN ('queued', 'retry_scheduled')
        GROUP BY organization_id
       HAVING COUNT(id) >= 100
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
             WHERE a.status = 'open'
               AND a.alert_type = 'queue_depth_high'
               AND a.organization_id = messages.organization_id
          )`
    );

    await client.query(
      `INSERT INTO alerts (organization_id, alert_type, severity, subject_type, subject_id, message, details)
       SELECT organization_id,
              'message_stuck_sending',
              'critical',
              'message',
              id,
              'Message has been stuck sending beyond claim timeout',
              jsonb_build_object('claimGatewayId', claim_gateway_id, 'claimExpiresAt', claim_expires_at)
         FROM messages
        WHERE status = 'sending'
          AND claim_expires_at < now() - interval '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
             WHERE a.status = 'open'
               AND a.alert_type = 'message_stuck_sending'
               AND a.subject_id = messages.id
          )`
    );

    await client.query(
      `INSERT INTO alerts (organization_id, alert_type, severity, subject_type, subject_id, message, details)
       SELECT organization_id,
              'callback_delivery_failed',
              'warning',
              'callback_delivery',
              id,
              'Callback delivery has failed repeatedly',
              jsonb_build_object('attemptCount', attempt_count, 'lastHttpStatus', last_http_status, 'lastResponse', last_response)
         FROM callback_deliveries
        WHERE status = 'failed'
          AND attempt_count >= 3
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
             WHERE a.status = 'open'
               AND a.alert_type = 'callback_delivery_failed'
               AND a.subject_id = callback_deliveries.id
          )`
    );

    const result = await client.query("SELECT COUNT(*)::int AS open_count FROM alerts WHERE status = 'open'");
    return { openCount: result.rows[0].open_count };
  });
}

export async function listAlerts(options: { organizationId?: string } = {}) {
  const values: unknown[] = [];
  let where = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    where = `WHERE organization_id = $${values.length}`;
  }
  const result = await query(
    `SELECT *
       FROM alerts
      ${where}
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
               created_at DESC
      LIMIT 200`,
    values
  );
  return result.rows;
}

export async function resolveAlert(id: string) {
  const result = await query(
    `UPDATE alerts
        SET status = 'resolved',
            resolved_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function recordManualAlert(input: { message: string; severity?: string }) {
  const result = await query(
    `INSERT INTO alerts (organization_id, alert_type, severity, subject_type, message)
     VALUES ($1, 'manual', $2, 'organization', $3)
     RETURNING *`,
    [DEFAULT_ORGANIZATION_ID, input.severity || "info", input.message]
  );
  return result.rows[0];
}
