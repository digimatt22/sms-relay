import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@/lib/event-contract";
import { deriveWebhookSigningSecret } from "@/lib/webhooks";

export function normalizeWebhookEventTypes(values: string[]) {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!unique.length) return ["*"];
  if (unique.includes("*")) return ["*"];
  const invalid = unique.filter((value) => !(WEBHOOK_EVENT_TYPES as readonly string[]).includes(value));
  if (invalid.length) throw new Error(`Unsupported webhook event type: ${invalid.join(", ")}`);
  return unique as WebhookEventType[];
}

export function assertSafeWebhookUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");
  if (url.username || url.password) throw new Error("Webhook URL must not contain credentials");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error("Webhook URL must not target a private or local address");
  }
  return url.toString();
}

export async function createWebhookSubscription(input: {
  organizationId: string;
  apiClientId: string;
  apiClientKeyId: string;
  callbackUrl: string;
  description?: string | null;
  eventTypes: string[];
}) {
  const id = randomUUID();
  const callbackUrl = assertSafeWebhookUrl(input.callbackUrl);
  const eventTypes = normalizeWebhookEventTypes(input.eventTypes);
  const secret = deriveWebhookSigningSecret(id);
  const result = await query(
    `INSERT INTO webhook_subscriptions (
       id, organization_id, api_client_id, api_client_key_id,
       callback_url, description, event_types, secret_prefix
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8)
     ON CONFLICT (api_client_key_id, callback_url) DO UPDATE
       SET description = EXCLUDED.description,
           event_types = EXCLUDED.event_types,
           status = 'active', disabled_at = NULL, updated_at = now()
     RETURNING *`,
    [
      id,
      input.organizationId,
      input.apiClientId,
      input.apiClientKeyId,
      callbackUrl,
      input.description || null,
      eventTypes,
      secret.slice(0, 16)
    ]
  );
  const subscription = result.rows[0];
  return {
    subscription,
    signingSecret: deriveWebhookSigningSecret(subscription.id)
  };
}

export async function listWebhookSubscriptions(apiClientKeyId: string) {
  return (await query(
    `SELECT id, callback_url, description, event_types, status, secret_prefix,
            created_at, updated_at, disabled_at
       FROM webhook_subscriptions
      WHERE api_client_key_id = $1
      ORDER BY created_at DESC`,
    [apiClientKeyId]
  )).rows;
}

export async function disableWebhookSubscription(id: string, apiClientKeyId: string) {
  return (await query(
    `UPDATE webhook_subscriptions
        SET status = 'disabled', disabled_at = now(), updated_at = now()
      WHERE id = $1 AND api_client_key_id = $2
      RETURNING id, status, disabled_at`,
    [id, apiClientKeyId]
  )).rows[0] || null;
}
