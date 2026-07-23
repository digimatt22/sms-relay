import type pg from "pg";
import { query } from "@/lib/db";
import { canonicalEventType, publishPlatformEvent, publishPlatformEventInTransaction } from "@/lib/event-contract";

type EventInput = {
  organizationId: string;
  messageId?: string | null;
  eventType: string;
  actorType?: string;
  actorId?: string | null;
  details?: Record<string, unknown>;
};

export async function recordMessageEvent(input: EventInput) {
  await query(
    `INSERT INTO message_events (
       organization_id, message_id, event_type, actor_type, actor_id, details
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.organizationId,
      input.messageId || null,
      input.eventType,
      input.actorType || "system",
      input.actorId || null,
      JSON.stringify(input.details || {})
    ]
  );
  const eventType = canonicalEventType(input.eventType);
  if (eventType) {
    await publishPlatformEvent({
      organizationId: input.organizationId,
      messageId: input.messageId || null,
      inboundMessageId: typeof input.details?.inboundMessageId === "string" ? input.details.inboundMessageId : null,
      eventType,
      data: input.details || {}
    });
  }
}

export async function recordMessageEventInTransaction(client: pg.PoolClient, input: EventInput) {
  await client.query(
    `INSERT INTO message_events (
       organization_id, message_id, event_type, actor_type, actor_id, details
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.organizationId,
      input.messageId || null,
      input.eventType,
      input.actorType || "system",
      input.actorId || null,
      JSON.stringify(input.details || {})
    ]
  );
  const eventType = canonicalEventType(input.eventType);
  if (eventType) {
    await publishPlatformEventInTransaction(client, {
      organizationId: input.organizationId,
      messageId: input.messageId || null,
      inboundMessageId: typeof input.details?.inboundMessageId === "string" ? input.details.inboundMessageId : null,
      eventType,
      data: input.details || {}
    });
  }
}
