import type pg from "pg";
import { query, transaction } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { redactPhone } from "@/lib/security";
import { publishPlatformEventInTransaction } from "@/lib/event-contract";

export async function ensureConversationInTransaction(client: pg.PoolClient, input: {
  organizationId: string;
  apiClientId: string;
  apiClientKeyId: string;
  participantNumber: string;
  messagingProgramId?: string | null;
  externalReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const participantNumber = normalizePhoneNumber(input.participantNumber);
  const result = await client.query(
    `INSERT INTO conversation_threads (
       organization_id, api_client_id, api_client_key_id, messaging_program_id,
       participant_number, participant_number_redacted, external_reference, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (api_client_key_id, participant_number)
       WHERE api_client_key_id IS NOT NULL AND status = 'open'
     DO UPDATE SET
       messaging_program_id = COALESCE(EXCLUDED.messaging_program_id, conversation_threads.messaging_program_id),
       external_reference = COALESCE(conversation_threads.external_reference, EXCLUDED.external_reference),
       metadata = conversation_threads.metadata || EXCLUDED.metadata,
       updated_at = now()
     RETURNING *, (xmax = 0) AS was_created`,
    [
      input.organizationId,
      input.apiClientId,
      input.apiClientKeyId,
      input.messagingProgramId || null,
      participantNumber,
      redactPhone(participantNumber),
      input.externalReference || null,
      JSON.stringify(input.metadata || {})
    ]
  );
  const conversation = result.rows[0];
  if (conversation.was_created) {
    await publishPlatformEventInTransaction(client, {
      organizationId: input.organizationId,
      apiClientId: input.apiClientId,
      apiClientKeyId: input.apiClientKeyId,
      conversationThreadId: conversation.id,
      eventType: "conversation.created",
      data: {
        participantNumberRedacted: conversation.participant_number_redacted,
        externalReference: conversation.external_reference,
        metadata: conversation.metadata
      }
    });
  }
  return conversation;
}

export async function createConversation(input: {
  organizationId: string;
  apiClientId: string;
  apiClientKeyId: string;
  participantNumber: string;
  messagingProgramId?: string | null;
  externalReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return transaction((client) => ensureConversationInTransaction(client, input));
}

export async function listConversations(input: { apiClientKeyId: string; status?: string | null; limit?: number }) {
  const values: unknown[] = [input.apiClientKeyId];
  let statusClause = "";
  if (input.status) {
    values.push(input.status);
    statusClause = `AND c.status = $${values.length}`;
  }
  values.push(Math.min(Math.max(input.limit || 100, 1), 500));
  return (await query(
    `SELECT c.*,
            COUNT(DISTINCT m.id)::int AS outbound_count,
            COUNT(DISTINCT i.id)::int AS inbound_count
       FROM conversation_threads c
       LEFT JOIN messages m ON m.conversation_thread_id = c.id
       LEFT JOIN inbound_messages i ON i.conversation_thread_id = c.id
      WHERE c.api_client_key_id = $1
        ${statusClause}
      GROUP BY c.id
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT $${values.length}`,
    values
  )).rows;
}

export async function getConversation(id: string, apiClientKeyId: string) {
  const conversation = (await query(
    `SELECT * FROM conversation_threads WHERE id = $1 AND api_client_key_id = $2`,
    [id, apiClientKeyId]
  )).rows[0];
  if (!conversation) return null;

  const [outbound, inbound, events] = await Promise.all([
    query(
      `SELECT id, status, body, to_number_redacted, metadata, created_at, submitted_at,
              delivered_at, delivery_failed_at
         FROM messages
        WHERE conversation_thread_id = $1
        ORDER BY created_at`,
      [id]
    ),
    query(
      `SELECT id, body, from_number_redacted, received_at, matched_message_id
         FROM inbound_messages
        WHERE conversation_thread_id = $1
        ORDER BY received_at`,
      [id]
    ),
    query(
      `SELECT payload FROM platform_events
        WHERE conversation_thread_id = $1
        ORDER BY occurred_at`,
      [id]
    )
  ]);
  return {
    conversation,
    messages: [
      ...outbound.rows.map((row) => ({ ...row, direction: "outbound", occurredAt: row.created_at })),
      ...inbound.rows.map((row) => ({ ...row, direction: "inbound", occurredAt: row.received_at }))
    ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
    events: events.rows.map((row) => row.payload)
  };
}

export async function closeConversation(id: string, apiClientKeyId: string) {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE conversation_threads
          SET status = 'closed', closed_at = now(), updated_at = now()
        WHERE id = $1 AND api_client_key_id = $2 AND status = 'open'
        RETURNING *`,
      [id, apiClientKeyId]
    );
    const conversation = result.rows[0];
    if (!conversation) return null;
    await publishPlatformEventInTransaction(client, {
      organizationId: conversation.organization_id,
      apiClientId: conversation.api_client_id,
      apiClientKeyId: conversation.api_client_key_id,
      conversationThreadId: conversation.id,
      eventType: "conversation.closed",
      data: { closedAt: conversation.closed_at }
    });
    return conversation;
  });
}
