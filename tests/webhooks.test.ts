import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWebhookRequest } from "../src/lib/webhooks";

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
