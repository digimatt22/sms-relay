import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("messages use scoped idempotency instead of global idempotency key uniqueness", () => {
  const migration = readFileSync("migrations/006_scoped_idempotency.sql", "utf8");
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(migration, /DROP CONSTRAINT IF EXISTS messages_idempotency_key_key/);
  assert.match(migration, /messages_scoped_idempotency_idx/);
  assert.match(migration, /organization_id/);
  assert.match(migration, /COALESCE\(api_client_id/);
  assert.match(messages, /ON CONFLICT DO NOTHING/);
  assert.match(messages, /AND idempotency_key = \$3/);
});

test("outbound creation blocks active opt-outs by organization", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(messages, /FROM opt_outs/);
  assert.match(messages, /organization_id = \$1/);
  assert.match(messages, /status = 'active'/);
  assert.doesNotMatch(messages, /allowOptOutOverride/);
  assert.match(messages, /recipient_authorization_required/);
});

test("gateway claims are constrained by gateway pool membership", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(messages, /gateway_pool_memberships/);
  assert.match(messages, /gpm\.gateway_pool_id = messages\.gateway_pool_id/);
  assert.match(messages, /gpm\.gateway_id = \$1/);
});

test("client and gateway auth use key tables and reject revoked keys", () => {
  const clients = readFileSync("src/lib/api-clients.ts", "utf8");
  const guards = readFileSync("src/lib/guards.ts", "utf8");

  assert.match(clients, /FROM api_client_keys/);
  assert.match(clients, /k\.status = 'active'/);
  assert.match(guards, /FROM gateway_keys/);
  assert.match(guards, /k\.status = 'active'/);
});

test("callbacks have retry processing with bounded backoff", () => {
  const callbacks = readFileSync("src/lib/callbacks.ts", "utf8");

  assert.match(callbacks, /FOR UPDATE SKIP LOCKED/);
  assert.match(callbacks, /attempt_count < 8/);
  assert.match(callbacks, /LEAST\(\(attempt_count \+ 1\) \* 300, 3600\)/);
  assert.match(callbacks, /retryCallbackDelivery/);
});

test("maintenance enforces raw telemetry retention and usage rollups", () => {
  const migration = readFileSync("migrations/007_scope_gateway_telemetry.sql", "utf8");
  const maintenance = readFileSync("src/lib/maintenance.ts", "utf8");

  assert.match(migration, /ALTER TABLE gateway_logs/);
  assert.match(migration, /ALTER TABLE gateway_health/);
  assert.match(maintenance, /daily_usage_rollups/);
  assert.match(maintenance, /DELETE FROM gateway_logs WHERE created_at < now\(\) - interval '90 days'/);
  assert.match(maintenance, /DELETE FROM gateway_health WHERE created_at < now\(\) - interval '90 days'/);
});
