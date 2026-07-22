import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("webhook integration guide documents signatures, retries, and idempotency", () => {
  const docs = readFileSync("docs/dpaf/22-webhook-integration-guide.md", "utf8");

  assert.match(docs, /x-relayhub-signature/);
  assert.match(docs, /HMAC-SHA256/);
  assert.match(docs, /callback_deliveries/);
  assert.match(docs, /inboundMessageId/);
});

test("backup and deployment runbook documents migration, backup, restore, and appliance update", () => {
  const docs = readFileSync("docs/dpaf/23-backup-restore-deployment-runbook.md", "utf8");
  const packageJson = readFileSync("package.json", "utf8");
  const deployCheck = readFileSync("scripts/production-deploy-check.sh", "utf8");

  assert.match(docs, /npm run deploy:check/);
  assert.match(docs, /npm run db:migrate/);
  assert.match(docs, /pg_dump/);
  assert.match(docs, /pg_restore/);
  assert.match(docs, /sudo systemctl restart relayhub-gateway/);
  assert.match(packageJson, /"deploy:check"/);
  assert.match(deployCheck, /npm run typecheck/);
  assert.match(deployCheck, /npm run gateway:package/);
});

test("recipient authorization integration guide documents enrollment, enforcement, and STOP", () => {
  const guide = readFileSync("docs/dpaf/25-recipient-authorization-integration-guide.md", "utf8");
  assert.match(guide, /POST \/api\/recipient-authorizations/);
  assert.match(guide, /recipientInitiated/);
  assert.match(guide, /POST \/api\/messages/);
  assert.match(guide, /STOP (reply revokes the client-wide|suppresses all ordinary messages from that client)/);
  assert.match(guide, /platform-wide failsafe/);
});
