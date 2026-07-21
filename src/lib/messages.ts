import pg from "pg";
import { query, transaction } from "@/lib/db";
import { recordMessageEvent, recordMessageEventInTransaction } from "@/lib/message-events";
import { DEFAULT_ORGANIZATION_ID, ensureDefaultGatewayPool } from "@/lib/organizations";
import { normalizePhoneNumber } from "@/lib/phone";
import { redactPhone } from "@/lib/security";
import type { MessageStatus } from "@/lib/types";

export async function createMessage(input: {
  to: string;
  body: string;
  priority: number;
  scheduledAt?: string | null;
  idempotencyKey?: string | null;
  metadata: Record<string, unknown>;
  callbackUrl?: string | null;
  userId?: string | null;
  apiClientId?: string | null;
  submittedVia?: "dashboard" | "api";
  organizationId?: string;
}) {
  const to = normalizePhoneNumber(input.to);
  const requestedOrganizationId = input.organizationId || DEFAULT_ORGANIZATION_ID;
  const requestedDefaultPoolId = await ensureDefaultGatewayPool(requestedOrganizationId);
  const { message, wasCreated } = await transaction(async (client) => {
    const context = await client.query(
      `WITH client_context AS (
         SELECT c.organization_id,
                COALESCE(
                  (
                    SELECT a.gateway_pool_id
                      FROM api_client_gateway_pool_access a
                     WHERE a.api_client_id = c.id
                     ORDER BY a.is_default DESC, a.created_at ASC
                     LIMIT 1
                  ),
                  (
                    SELECT p.id
                      FROM gateway_pools p
                     WHERE p.organization_id = c.organization_id
                       AND p.is_default = true
                     ORDER BY p.created_at ASC
                     LIMIT 1
                  ),
                  $3::uuid
                ) AS gateway_pool_id
           FROM api_clients c
          WHERE c.id = $1
       )
       SELECT COALESCE(client_context.organization_id, $2::uuid) AS organization_id,
              COALESCE(client_context.gateway_pool_id, $3::uuid) AS gateway_pool_id
         FROM (SELECT 1) base
         LEFT JOIN client_context ON true`,
      [input.apiClientId || null, requestedOrganizationId, requestedDefaultPoolId]
    );
    const organizationId = context.rows[0].organization_id;
    const gatewayPoolId = context.rows[0].gateway_pool_id;

    if (input.apiClientId) {
      const limits = await client.query(
        `SELECT hourly_message_limit, daily_message_limit
           FROM api_clients
          WHERE id = $1
            AND organization_id = $2`,
        [input.apiClientId, organizationId]
      );
      const clientLimits = limits.rows[0];
      if (!clientLimits) {
        throw new Error("API client is not valid for this organization");
      }

      if (clientLimits.hourly_message_limit !== null) {
        const hourly = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM messages
            WHERE api_client_id = $1
              AND created_at >= now() - interval '1 hour'`,
          [input.apiClientId]
        );
        if (hourly.rows[0].count >= clientLimits.hourly_message_limit) {
          throw new Error("API client hourly message limit exceeded");
        }
      }

      if (clientLimits.daily_message_limit !== null) {
        const daily = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM messages
            WHERE api_client_id = $1
              AND created_at >= now() - interval '24 hours'`,
          [input.apiClientId]
        );
        if (daily.rows[0].count >= clientLimits.daily_message_limit) {
          throw new Error("API client daily message limit exceeded");
        }
      }
    }

    const optOut = await client.query(
      `SELECT id
         FROM opt_outs
        WHERE organization_id = $1
          AND phone_number = $2
          AND status = 'active'
        LIMIT 1`,
      [organizationId, to]
    );
    if (optOut.rows[0] && input.metadata?.allowOptOutOverride !== true) {
      throw new Error(`Cannot send to ${redactPhone(to)} because the recipient is opted out`);
    }

    const result = await client.query<any>(
      `INSERT INTO messages (
         organization_id, gateway_pool_id, to_number, to_number_redacted, body,
         priority, scheduled_at, idempotency_key, metadata, callback_url,
         created_by_user_id, api_client_id, submitted_via
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        organizationId,
        gatewayPoolId,
        to,
        redactPhone(to),
        input.body,
        input.priority,
        input.scheduledAt || null,
        input.idempotencyKey || null,
        JSON.stringify(input.metadata || {}),
        input.callbackUrl || null,
        input.userId || null,
        input.apiClientId || null,
        input.submittedVia || "dashboard"
      ]
    );
    const created = result.rows[0];
    if (created) return { message: created, wasCreated: true };

    if (!input.idempotencyKey) {
      throw new Error("Message could not be created");
    }

    const existing = await client.query<any>(
      `SELECT *
         FROM messages
        WHERE organization_id = $1
          AND COALESCE(api_client_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          AND idempotency_key = $3
        LIMIT 1`,
      [organizationId, input.apiClientId || null, input.idempotencyKey]
    );
    if (!existing.rows[0]) {
      throw new Error("Message could not be created");
    }
    return { message: existing.rows[0], wasCreated: false };
  });

  if (wasCreated) {
    await recordMessageEvent({
      organizationId: message.organization_id,
      messageId: message.id,
      eventType: "message.created",
      actorType: input.submittedVia === "api" ? "api_client" : "admin_user",
      actorId: input.apiClientId || input.userId || null,
      details: { submittedVia: input.submittedVia || "dashboard", idempotencyKey: input.idempotencyKey || null }
    });
  }
  return message;
}

export async function listMessages(status?: string | null, options: { organizationId?: string } = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (status) {
    values.push(status);
    clauses.push(`m.status = $${values.length}`);
  }
  if (options.organizationId) {
    values.push(options.organizationId);
    clauses.push(`m.organization_id = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await query<any>(
    `SELECT m.*, g.name AS gateway_name, c.name AS api_client_name
       FROM messages m
       LEFT JOIN gateways g ON g.id = m.claim_gateway_id
       LEFT JOIN api_clients c ON c.id = m.api_client_id
      ${where}
      ORDER BY m.created_at DESC
      LIMIT 200`,
    values
  );
  return result.rows;
}

export async function getMessage(id: string, options: { apiClientId?: string | null } = {}) {
  const values: unknown[] = [id];
  let ownership = "";
  if (options.apiClientId) {
    values.push(options.apiClientId);
    ownership = `AND m.api_client_id = $${values.length}`;
  }

  const message = await query<any>(
    `SELECT m.*, c.name AS api_client_name
       FROM messages m
       LEFT JOIN api_clients c ON c.id = m.api_client_id
      WHERE m.id = $1
        ${ownership}`,
    values
  );
  const attempts = await query<any>(
    `SELECT a.*, g.name AS gateway_name
       FROM message_attempts a
       LEFT JOIN gateways g ON g.id = a.gateway_id
      WHERE a.message_id = $1
      ORDER BY a.attempt_number`,
    [id]
  );
  return { message: message.rows[0], attempts: attempts.rows };
}

export async function claimNextMessage(gatewayId: string) {
  return transaction(async (client: pg.PoolClient) => {
    await client.query(
      `UPDATE messages
          SET status = 'queued',
              claim_gateway_id = NULL,
              claim_expires_at = NULL,
              updated_at = now()
        WHERE status = 'claimed'
          AND claim_expires_at < now()`
    );

    await client.query(
      `UPDATE messages
          SET status = 'retry_scheduled',
              claim_gateway_id = NULL,
              claim_expires_at = NULL,
              next_attempt_at = now() + interval '1 minute',
              last_error = COALESCE(last_error, 'Recovered stale sending message'),
              updated_at = now()
        WHERE status = 'sending'
          AND claim_expires_at < now() - interval '10 minutes'`
    );

    const result = await client.query(
      `WITH candidate AS (
         SELECT id
           FROM messages
          WHERE status IN ('queued', 'retry_scheduled')
            AND (scheduled_at IS NULL OR scheduled_at <= now())
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
            AND EXISTS (
              SELECT 1
                FROM gateways g
               WHERE g.id = $1
                 AND g.disabled_at IS NULL
                 AND g.maintenance_at IS NULL
                 AND g.status NOT IN ('offline', 'disabled', 'maintenance')
                 AND (
                   g.last_heartbeat_at IS NULL
                   OR g.last_heartbeat_at >= now() - interval '10 minutes'
                 )
                 AND COALESCE(
                   (
                     SELECT latest_health.status::text
                       FROM gateway_health latest_health
                      WHERE latest_health.gateway_id = g.id
                      ORDER BY latest_health.created_at DESC
                      LIMIT 1
                   ),
                   g.status::text,
                   'unknown'
                 ) NOT IN ('offline', 'disabled', 'maintenance')
                 AND COALESCE(
                   (
                     SELECT latest_health.metrics #>> '{signalQuality,level}'
                       FROM gateway_health latest_health
                      WHERE latest_health.gateway_id = g.id
                      ORDER BY latest_health.created_at DESC
                      LIMIT 1
                   ),
                   'unknown'
                 ) <> 'unusable'
                 AND (
                   g.hourly_send_limit IS NULL
                   OR (
                     SELECT COUNT(*)
                       FROM message_attempts a
                      WHERE a.gateway_id = g.id
                        AND a.status = 'carrier_submitted'
                        AND a.finished_at >= now() - interval '1 hour'
                   ) < g.hourly_send_limit
                 )
                 AND (
                   SELECT COUNT(*)
                     FROM message_attempts failed_attempts
                    WHERE failed_attempts.gateway_id = g.id
                      AND failed_attempts.status = 'failed'
                      AND failed_attempts.finished_at >= now() - interval '15 minutes'
                 ) < 3
            )
            AND (
              gateway_pool_id IS NULL
              OR EXISTS (
                SELECT 1
                  FROM gateway_pool_memberships gpm
                 WHERE gpm.gateway_pool_id = messages.gateway_pool_id
                   AND gpm.gateway_id = $1
              )
            )
          ORDER BY priority ASC,
                   (
                     SELECT COUNT(*)
                       FROM message_attempts a
                      WHERE a.gateway_id = $1
                        AND a.status = 'carrier_submitted'
                        AND a.finished_at >= now() - interval '1 hour'
                   ) ASC,
                   (
                     SELECT routing_weight
                       FROM gateways g
                      WHERE g.id = $1
                   ) DESC,
                   created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE messages m
          SET status = 'claimed',
              claim_gateway_id = $1,
              claim_expires_at = now() + interval '2 minutes',
              updated_at = now()
         FROM candidate
        WHERE m.id = candidate.id
        RETURNING m.*`,
      [gatewayId]
    );
    const message = result.rows[0] || null;
    if (message) {
      await recordMessageEventInTransaction(client, {
        organizationId: message.organization_id,
        messageId: message.id,
        eventType: "message.claimed",
        actorType: "gateway",
        actorId: gatewayId,
        details: { gatewayId }
      });
    }
    return message;
  });
}

export async function startAttempt(messageId: string, gatewayId: string) {
  return transaction(async (client) => {
    const message = await client.query(
      `UPDATE messages
          SET status = 'sending',
              attempt_count = attempt_count + 1,
              updated_at = now()
        WHERE id = $1
          AND claim_gateway_id = $2
          AND status = 'claimed'
        RETURNING *`,
      [messageId, gatewayId]
    );
    const row = message.rows[0];
    if (!row) return null;

    const attempt = await client.query(
      `INSERT INTO message_attempts (message_id, gateway_id, attempt_number, status)
       VALUES ($1, $2, $3, 'started')
       RETURNING *`,
      [messageId, gatewayId, row.attempt_count]
    );
    await recordMessageEventInTransaction(client, {
      organizationId: row.organization_id,
      messageId,
      eventType: "message.attempt_started",
      actorType: "gateway",
      actorId: gatewayId,
      details: { gatewayId, attemptNumber: row.attempt_count, attemptId: attempt.rows[0].id }
    });
    return attempt.rows[0];
  });
}

export async function markSubmitted(messageId: string, attemptId: string, gatewayId: string, modemResponse?: string) {
  return transaction(async (client) => {
    await client.query(
      `UPDATE message_attempts
          SET status = 'carrier_submitted',
              modem_response = $1,
              finished_at = now()
        WHERE id = $2 AND gateway_id = $3 AND message_id = $4`,
      [modemResponse || null, attemptId, gatewayId, messageId]
    );
    const result = await client.query(
      `UPDATE messages
          SET status = 'carrier_submitted',
              submitted_at = now(),
              finalized_at = now(),
              claim_gateway_id = NULL,
              claim_expires_at = NULL,
              updated_at = now()
        WHERE id = $1
          AND EXISTS (
            SELECT 1 FROM message_attempts
             WHERE id = $2
               AND message_id = messages.id
               AND gateway_id = $3
          )
        RETURNING *`,
      [messageId, attemptId, gatewayId]
    );
    const message = result.rows[0];
    if (message) {
      await recordMessageEventInTransaction(client, {
        organizationId: message.organization_id,
        messageId,
        eventType: "message.carrier_submitted",
        actorType: "gateway",
        actorId: gatewayId,
        details: { gatewayId, attemptId, modemResponse: modemResponse || null }
      });
    }
    return message;
  });
}

export async function markFailed(input: {
  messageId: string;
  attemptId: string;
  gatewayId: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  return transaction(async (client) => {
    const message = await client.query("SELECT attempt_count FROM messages WHERE id = $1", [input.messageId]);
    const attempts = Number(message.rows[0]?.attempt_count || 0);
    const finalStatus: MessageStatus = attempts >= 3 ? "dead_lettered" : "retry_scheduled";
    const nextAttempt = attempts >= 3 ? null : `${Math.min(2 ** attempts, 30)} minutes`;

    await client.query(
      `UPDATE message_attempts
          SET status = 'failed',
              error_code = $1,
              error_message = $2,
              finished_at = now()
        WHERE id = $3 AND gateway_id = $4 AND message_id = $5`,
      [input.errorCode || null, input.errorMessage || null, input.attemptId, input.gatewayId, input.messageId]
    );

    const result = await client.query(
      `UPDATE messages
          SET status = $1::message_status,
              last_error = $2,
              claim_gateway_id = NULL,
              claim_expires_at = NULL,
              next_attempt_at = CASE WHEN $3::text IS NULL THEN NULL ELSE now() + ($3::text)::interval END,
              finalized_at = CASE WHEN $1::message_status = 'dead_lettered'::message_status THEN now() ELSE finalized_at END,
              updated_at = now()
        WHERE id = $4
          AND EXISTS (
            SELECT 1 FROM message_attempts
             WHERE id = $6
               AND message_id = messages.id
               AND gateway_id = $5
          )
        RETURNING *`,
      [
        finalStatus,
        input.errorMessage || input.errorCode || "Send failed",
        nextAttempt,
        input.messageId,
        input.gatewayId,
        input.attemptId
      ]
    );
    const failed = result.rows[0];
    if (failed) {
      await recordMessageEventInTransaction(client, {
        organizationId: failed.organization_id,
        messageId: input.messageId,
        eventType: finalStatus === "dead_lettered" ? "message.dead_lettered" : "message.retry_scheduled",
        actorType: "gateway",
        actorId: input.gatewayId,
        details: {
          gatewayId: input.gatewayId,
          attemptId: input.attemptId,
          errorCode: input.errorCode || null,
          errorMessage: input.errorMessage || null,
          nextAttempt
        }
      });
    }
    return failed;
  });
}

export async function cancelMessage(messageId: string, options: { apiClientId?: string | null } = {}) {
  const values: unknown[] = [messageId];
  let ownership = "";
  if (options.apiClientId) {
    values.push(options.apiClientId);
    ownership = `AND api_client_id = $${values.length}`;
  }

  const result = await query(
    `UPDATE messages
        SET status = 'canceled',
            claim_gateway_id = NULL,
            claim_expires_at = NULL,
            finalized_at = now(),
            updated_at = now()
      WHERE id = $1
        ${ownership}
        AND status IN ('queued', 'retry_scheduled', 'claimed')
      RETURNING *`,
    values
  );
  const message = result.rows[0] || null;
  if (message) {
    await recordMessageEvent({
      organizationId: message.organization_id,
      messageId: message.id,
      eventType: "message.canceled",
      actorType: options.apiClientId ? "api_client" : "admin_user",
      actorId: options.apiClientId || null,
      details: {}
    });
  }
  return message;
}

export async function requeueMessage(messageId: string, options: { apiClientId?: string | null } = {}) {
  const values: unknown[] = [messageId];
  let ownership = "";
  if (options.apiClientId) {
    values.push(options.apiClientId);
    ownership = `AND api_client_id = $${values.length}`;
  }

  const result = await query(
    `UPDATE messages
        SET status = 'queued',
            attempt_count = COALESCE((SELECT MAX(attempt_number) FROM message_attempts WHERE message_id = messages.id), 0),
            claim_gateway_id = NULL,
            claim_expires_at = NULL,
            next_attempt_at = NULL,
            finalized_at = NULL,
            updated_at = now()
      WHERE id = $1
        ${ownership}
        AND status NOT IN ('carrier_submitted')
      RETURNING *`,
    values
  );
  const message = result.rows[0] || null;
  if (message) {
    await recordMessageEvent({
      organizationId: message.organization_id,
      messageId: message.id,
      eventType: "message.requeued",
      actorType: options.apiClientId ? "api_client" : "admin_user",
      actorId: options.apiClientId || null,
      details: {}
    });
  }
  return message;
}
