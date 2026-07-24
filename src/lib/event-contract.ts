import { randomUUID } from "node:crypto";
import type pg from "pg";
import { query, transaction } from "@/lib/db";

export const EVENT_SCHEMA_VERSION = "2026-07-22";

export const WEBHOOK_EVENT_TYPES = [
  "sms.outbound.queued",
  "sms.outbound.claimed",
  "sms.outbound.sending",
  "sms.outbound.carrier_submitted",
  "sms.outbound.delivery_pending",
  "sms.outbound.delivery_confirmed",
  "sms.outbound.delivery_failed",
  "sms.outbound.delivery_unknown",
  "sms.outbound.retry_scheduled",
  "sms.outbound.dead_lettered",
  "sms.outbound.canceled",
  "sms.outbound.requeued",
  "sms.inbound.received",
  "conversation.created",
  "conversation.closed",
  "recipient.authorization.challenge_sent",
  "recipient.authorization.verified",
  "recipient.authorization.expired",
  "recipient.authorization.revoked",
  "recipient.authorization.reconsented",
  "recipient.opt_out.recorded"
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const LEGACY_EVENT_MAP: Record<string, WebhookEventType> = {
  "message.created": "sms.outbound.queued",
  "message.claimed": "sms.outbound.claimed",
  "message.attempt_started": "sms.outbound.sending",
  "message.carrier_submitted": "sms.outbound.carrier_submitted",
  "message.retry_scheduled": "sms.outbound.retry_scheduled",
  "message.dead_lettered": "sms.outbound.dead_lettered",
  "message.canceled": "sms.outbound.canceled",
  "message.requeued": "sms.outbound.requeued",
  "sms.inbound.received": "sms.inbound.received"
};

export function canonicalEventType(value: string): WebhookEventType | null {
  if ((WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)) return value as WebhookEventType;
  return LEGACY_EVENT_MAP[value] || null;
}

type PublishEventInput = {
  organizationId: string;
  eventType: WebhookEventType;
  apiClientId?: string | null;
  apiClientKeyId?: string | null;
  messageId?: string | null;
  conversationThreadId?: string | null;
  inboundMessageId?: string | null;
  recipientAuthorizationId?: string | null;
  data?: Record<string, unknown>;
  occurredAt?: string | Date;
};

export async function publishPlatformEvent(input: PublishEventInput) {
  return transaction((client) => publishPlatformEventInTransaction(client, input));
}

export async function publishPlatformEventInTransaction(client: pg.PoolClient, input: PublishEventInput) {
  const source = await resolveEventSource(client, input);
  const eventId = randomUUID();
  const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString();
  const envelope = {
    id: eventId,
    type: input.eventType,
    schemaVersion: EVENT_SCHEMA_VERSION,
    occurredAt,
    organizationId: input.organizationId,
    apiClientId: source.apiClientId,
    apiClientKeyId: source.apiClientKeyId,
    messageId: input.messageId || null,
    conversationId: source.conversationThreadId,
    inboundMessageId: input.inboundMessageId || null,
    recipientAuthorizationId: input.recipientAuthorizationId || null,
    data: {
      ...source.data,
      ...(input.data || {})
    }
  };

  await client.query(
    `INSERT INTO platform_events (
       id, schema_version, organization_id, api_client_id, api_client_key_id,
       event_type, message_id, conversation_thread_id, inbound_message_id,
       recipient_authorization_id, payload, occurred_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
    [
      eventId,
      EVENT_SCHEMA_VERSION,
      input.organizationId,
      source.apiClientId,
      source.apiClientKeyId,
      input.eventType,
      input.messageId || null,
      source.conversationThreadId,
      input.inboundMessageId || null,
      input.recipientAuthorizationId || null,
      JSON.stringify(envelope),
      occurredAt
    ]
  );

  if (source.apiClientKeyId) {
    await client.query(
      `INSERT INTO callback_deliveries (
         organization_id, message_id, inbound_message_id, recipient_authorization_id,
         platform_event_id, webhook_subscription_id, api_client_key_id,
         event_type, callback_url, payload
       )
       SELECT $1, $2, $3, $4, $5, s.id, $6, $7, s.callback_url, $8::jsonb
         FROM webhook_subscriptions s
        WHERE s.api_client_key_id = $6
          AND s.status = 'active'
          AND s.disabled_at IS NULL
          AND ('*' = ANY(s.event_types) OR $7 = ANY(s.event_types))
       ON CONFLICT (webhook_subscription_id, platform_event_id)
       WHERE webhook_subscription_id IS NOT NULL
         AND platform_event_id IS NOT NULL
       DO NOTHING`,
      [
        input.organizationId,
        input.messageId || null,
        input.inboundMessageId || null,
        input.recipientAuthorizationId || null,
        eventId,
        source.apiClientKeyId,
        input.eventType,
        JSON.stringify(envelope)
      ]
    );
  }

  return envelope;
}

async function resolveEventSource(client: pg.PoolClient, input: PublishEventInput) {
  let apiClientId = input.apiClientId || null;
  let apiClientKeyId = input.apiClientKeyId || null;
  let conversationThreadId = input.conversationThreadId || null;
  const data: Record<string, unknown> = {};

  if (input.messageId) {
    const result = await client.query(
      `SELECT api_client_id, api_client_key_id, conversation_thread_id,
              to_number, to_number_redacted, body, status, priority, metadata,
              submitted_at, finalized_at,
              delivery_status_updated_at AS delivery_reported_at
         FROM messages
        WHERE id = $1`,
      [input.messageId]
    );
    const message = result.rows[0];
    apiClientId ||= message?.api_client_id || null;
    apiClientKeyId ||= message?.api_client_key_id || null;
    conversationThreadId ||= message?.conversation_thread_id || null;
    if (message) {
      data.message = {
        id: input.messageId,
        conversationId: message.conversation_thread_id || null,
        to: message.to_number,
        toRedacted: message.to_number_redacted,
        body: message.body,
        status: message.status,
        priority: message.priority,
        metadata: message.metadata || {},
        submittedAt: message.submitted_at,
        finalizedAt: message.finalized_at,
        deliveryReportedAt: message.delivery_reported_at
      };
    }
  }

  if (input.inboundMessageId) {
    const result = await client.query(
      `SELECT m.api_client_id, m.api_client_key_id,
              COALESCE(i.conversation_thread_id, m.conversation_thread_id) AS conversation_thread_id,
              i.from_number, i.from_number_redacted, i.body, i.received_at,
              i.metadata, i.matched_message_id, i.gateway_id
         FROM inbound_messages i
         LEFT JOIN messages m ON m.id = i.matched_message_id
        WHERE i.id = $1`,
      [input.inboundMessageId]
    );
    const inbound = result.rows[0];
    apiClientId ||= inbound?.api_client_id || null;
    apiClientKeyId ||= inbound?.api_client_key_id || null;
    conversationThreadId ||= inbound?.conversation_thread_id || null;
    if (inbound) {
      data.inboundMessage = {
        id: input.inboundMessageId,
        conversationId: inbound.conversation_thread_id || null,
        matchedOutboundMessageId: inbound.matched_message_id || null,
        gatewayId: inbound.gateway_id,
        from: inbound.from_number,
        fromRedacted: inbound.from_number_redacted,
        body: inbound.body,
        receivedAt: inbound.received_at,
        metadata: inbound.metadata || {}
      };
    }
  }

  if (input.recipientAuthorizationId) {
    const result = await client.query(
      `SELECT a.created_by_api_client_id, a.created_by_api_client_key_id,
              a.phone_number_redacted, a.status, a.consent_source,
              a.verified_at AS authorized_at,
              challenge.expires_at, a.revoked_at
         FROM recipient_authorizations a
         LEFT JOIN LATERAL (
           SELECT c.expires_at
             FROM verification_challenges c
            WHERE c.recipient_authorization_id = a.id
            ORDER BY c.created_at DESC
            LIMIT 1
         ) challenge ON true
        WHERE a.id = $1`,
      [input.recipientAuthorizationId]
    );
    const authorization = result.rows[0];
    apiClientId ||= authorization?.created_by_api_client_id || null;
    apiClientKeyId ||= authorization?.created_by_api_client_key_id || null;
    if (authorization) {
      data.recipientAuthorization = {
        id: input.recipientAuthorizationId,
        phoneRedacted: authorization.phone_number_redacted,
        status: authorization.status,
        consentSource: authorization.consent_source,
        authorizedAt: authorization.authorized_at,
        expiresAt: authorization.expires_at,
        revokedAt: authorization.revoked_at
      };
    }
  }

  if (conversationThreadId) {
    const result = await client.query(
      `SELECT participant_number, participant_number_redacted, external_reference,
              status, metadata, last_message_at
         FROM conversation_threads
        WHERE id = $1`,
      [conversationThreadId]
    );
    const conversation = result.rows[0];
    if (conversation) {
      data.conversation = {
        id: conversationThreadId,
        participant: conversation.participant_number,
        participantRedacted: conversation.participant_number_redacted,
        externalReference: conversation.external_reference,
        status: conversation.status,
        metadata: conversation.metadata || {},
        lastMessageAt: conversation.last_message_at
      };
    }
  }

  return { apiClientId, apiClientKeyId, conversationThreadId, data };
}

export async function listPlatformEvents(options: {
  organizationId: string;
  apiClientKeyId?: string | null;
  conversationThreadId?: string | null;
  limit?: number;
}) {
  const values: unknown[] = [options.organizationId];
  const clauses = ["organization_id = $1"];
  if (options.apiClientKeyId) {
    values.push(options.apiClientKeyId);
    clauses.push(`api_client_key_id = $${values.length}`);
  }
  if (options.conversationThreadId) {
    values.push(options.conversationThreadId);
    clauses.push(`conversation_thread_id = $${values.length}`);
  }
  values.push(Math.min(Math.max(options.limit || 100, 1), 500));
  return (await query(
    `SELECT payload
       FROM platform_events
      WHERE ${clauses.join(" AND ")}
      ORDER BY occurred_at DESC
      LIMIT $${values.length}`,
    values
  )).rows.map((row) => row.payload);
}
