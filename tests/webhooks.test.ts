import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWebhookRequest, deriveWebhookSigningSecret } from "../src/lib/webhooks";

test("webhook requests include HMAC signature headers when secret is configured", () => {
  process.env.RELAYHUB_WEBHOOK_SECRET = "test-secret";
  const request = createWebhookRequest("https://example.com/webhook", { event: "sms.inbound.received" });
  const headers = request.init.headers as Record<string, string>;
  const body = request.init.body as string;
  const expected = createHmac("sha256", "test-secret")
    .update(`${headers["x-relayhub-timestamp"]}.${body}`)
    .digest("hex");

  assert.equal(request.url, "https://example.com/webhook");
  assert.equal(headers["content-type"], "application/json");
  assert.match(headers["x-relayhub-signature"], /^sha256=/);
  assert.equal(headers["x-relayhub-signature"], `sha256=${expected}`);
  delete process.env.RELAYHUB_WEBHOOK_SECRET;
});

test("API-key webhook subscriptions receive distinct derived signing secrets", () => {
  process.env.RELAYHUB_WEBHOOK_SECRET = "test-secret";
  const first = deriveWebhookSigningSecret("11111111-1111-4111-8111-111111111111");
  const second = deriveWebhookSigningSecret("22222222-2222-4222-8222-222222222222");
  assert.match(first, /^whsec_/);
  assert.notEqual(first, second);
  const request = createWebhookRequest("https://example.com/webhook", { type: "sms.outbound.queued" }, first);
  assert.match((request.init.headers as Record<string, string>)["x-relayhub-signature"], /^sha256=/);
  delete process.env.RELAYHUB_WEBHOOK_SECRET;
});

test("webhook requests expose a stable delivery identifier", () => {
  const request = createWebhookRequest("https://example.com/webhook", { ok: true }, "secret", "delivery-123");
  assert.equal((request.init.headers as Record<string, string>)["x-relayhub-delivery"], "delivery-123");
});
