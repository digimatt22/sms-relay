import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("client and gateway rate limit schema is present", () => {
  const migration = readFileSync("migrations/008_rate_limit_routing_policy.sql", "utf8");

  assert.match(migration, /hourly_message_limit/);
  assert.match(migration, /daily_message_limit/);
  assert.match(migration, /routing_weight/);
  assert.match(migration, /hourly_send_limit/);
});

test("message creation enforces API client message limits", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(messages, /hourly_message_limit/);
  assert.match(messages, /daily_message_limit/);
  assert.match(messages, /API client hourly message limit exceeded/);
  assert.match(messages, /API client daily message limit exceeded/);
});

test("gateway claim respects hourly send caps and routing weight", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");
  const gatewayPage = readFileSync("src/app/gateways/[id]/page.tsx", "utf8");

  assert.match(messages, /hourly_send_limit/);
  assert.match(messages, /routing_weight/);
  assert.match(gatewayPage, /name="routingWeight"/);
  assert.match(gatewayPage, /name="hourlySendLimit"/);
});

test("gateway claim avoids gateways with repeated recent failures", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(messages, /failed_attempts/);
  assert.match(messages, /failed_attempts\.status = 'failed'/);
  assert.match(messages, /interval '15 minutes'/);
  assert.match(messages, /\) < 3/);
});

test("gateway claim uses recent health and signal eligibility", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(messages, /g\.disabled_at IS NULL/);
  assert.match(messages, /g\.maintenance_at IS NULL/);
  assert.match(messages, /g\.last_heartbeat_at >= now\(\) - interval '10 minutes'/);
  assert.match(messages, /FROM gateway_health latest_health/);
  assert.match(messages, /signalQuality,level/);
  assert.match(messages, /<> 'unusable'/);
});
