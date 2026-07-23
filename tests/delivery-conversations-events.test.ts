import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEBHOOK_EVENT_TYPES } from "../src/lib/event-contract";

test("delivery receipts, first-class conversations, and key subscriptions have durable schema", () => {
  const migration = readFileSync("migrations/019_delivery_receipts_conversations_webhooks.sql", "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS delivery_receipts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS conversation_threads/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS webhook_subscriptions/);
  assert.match(migration, /api_client_key_id uuid NOT NULL REFERENCES api_client_keys/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_events/);
  assert.match(migration, /modem_message_reference integer/);
});

test("event contract covers outbound lifecycle, replies, conversations, and authorization", () => {
  for (const eventType of [
    "sms.outbound.queued",
    "sms.outbound.carrier_submitted",
    "sms.outbound.delivery_confirmed",
    "sms.outbound.delivery_failed",
    "sms.outbound.delivery_unknown",
    "sms.inbound.received",
    "conversation.created",
    "conversation.closed",
    "recipient.authorization.verified",
    "recipient.authorization.revoked"
  ]) {
    assert.equal(WEBHOOK_EVENT_TYPES.includes(eventType as never), true, eventType);
  }
});

test("opt-out and reconsent transitions publish canonical key-level events", () => {
  const authorizations = readFileSync("src/lib/recipient-authorizations.ts", "utf8");
  assert.match(authorizations, /eventType: "recipient\.opt_out\.recorded"/);
  assert.match(authorizations, /enqueueAuthorizationCallback\("recipient\.authorization\.reconsented"/);
});

test("gateway and client APIs expose receipt, conversation, and subscription workflows", () => {
  const gatewayApi = readFileSync("packages/gateway/src/api.ts", "utf8");
  const deliveryRoute = readFileSync("src/app/api/gateway/delivery-reports/route.ts", "utf8");
  const conversationRoute = readFileSync("src/app/api/conversations/route.ts", "utf8");
  const subscriptionRoute = readFileSync("src/app/api/webhook-subscriptions/route.ts", "utf8");
  assert.match(gatewayApi, /ingestDeliveryReports/);
  assert.match(deliveryRoute, /ingestDeliveryReceipt/);
  assert.match(conversationRoute, /createConversation/);
  assert.match(subscriptionRoute, /apiClientKeyId: auth\.client\.key_id/);
});

test("inbound replies attach to conversations and carry external correlation context", () => {
  const inbound = readFileSync("src/lib/inbound.ts", "utf8");
  assert.match(inbound, /conversation_thread_id/);
  assert.match(inbound, /candidateRoutingScopes/);
  assert.match(inbound, /conversation_external_reference/);
  assert.match(inbound, /outboundMetadata/);
});
