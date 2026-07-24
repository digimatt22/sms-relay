import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

test("database evidence compares ledger, schema, counts, and relationships", () => {
  const snapshot = readFileSync("scripts/database-snapshot.mjs", "utf8");
  const compare = readFileSync("scripts/database-compare.mjs", "utf8");

  assert.match(snapshot, /schema_migrations/);
  assert.match(snapshot, /table_counts/);
  assert.match(snapshot, /protected_table_counts/);
  assert.match(snapshot, /schemaSha256/);
  assert.match(snapshot, /orphan_messages_program/);
  assert.match(snapshot, /orphan_authorizations_program/);
  assert.match(snapshot, /orphan_api_keys/);
  assert.match(snapshot, /orphan_attempts/);
  assert.match(compare, /protected table counts/);
  assert.match(compare, /migration ledger/);
  assert.match(compare, /schema fingerprint/);
  assert.match(compare, /runtime owned objects/);
  assert.match(compare, /owner connection limit/);
});

test("backup and restore-check tooling is protected and PostgreSQL 17 pinned", () => {
  const backup = readFileSync("scripts/database-backup.sh", "utf8");
  const restore = readFileSync("scripts/database-restore-check.sh", "utf8");

  assert.match(backup, /backup path must be outside the repository/);
  assert.match(backup, /--format=custom/);
  assert.match(backup, /--no-owner/);
  assert.match(backup, /--no-acl/);
  assert.match(backup, /chmod 600/);
  assert.match(backup, /pg_restore --list/);
  assert.match(restore, /postgres:17\.10-bookworm/);
  assert.match(restore, /db:migrate:production/);
  assert.match(restore, /database-compare\.mjs/);
  assert.match(restore, /database-smoke\.ts/);
  assert.equal(statSync("scripts/database-backup.sh").mode & 0o111, 0o111);
  assert.equal(statSync("scripts/database-restore-check.sh").mode & 0o111, 0o111);
});

test("local Compose mirrors PostgreSQL 17 and the three-role contract", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const readme = readFileSync("README.md", "utf8");

  assert.match(compose, /postgres:17\.10-bookworm/);
  assert.match(compose, /POSTGRES_USER: relayhub_sms_cluster_admin/);
  assert.match(compose, /RELAYHUB_DB_OWNER_PASSWORD/);
  assert.match(compose, /RELAYHUB_DB_RUNTIME_PASSWORD/);
  assert.match(compose, /127\.0\.0\.1:5433:5432/);
  assert.match(compose, /postgres-init\.sh/);
  assert.match(readme, /db:migrate:production/);
  assert.match(
    readme,
    /PostgreSQL 16 local volume cannot be mounted\s+directly/,
  );
});

test("isolated smoke covers authorized and expected-failure SMS paths", () => {
  const smoke = readFileSync("scripts/database-smoke.ts", "utf8");

  assert.match(smoke, /authorized_sms_queue/);
  assert.match(smoke, /missing_consent/);
  assert.match(smoke, /stop_suppression/);
  assert.match(smoke, /invalid_credentials/);
  assert.match(smoke, /unavailable_database/);
  assert.match(smoke, /non_sending_restore_smoke/);
});

test("host watchdog is external and requires an independent fallback", () => {
  const watchdog = readFileSync("scripts/relayhub-host-watchdog.sh", "utf8");
  const service = readFileSync(
    "ops/systemd/relayhub-host-watchdog.service",
    "utf8",
  );
  const guide = readFileSync(
    "docs/runbooks/relayhub-host-monitoring.md",
    "utf8",
  );

  assert.match(watchdog, /api\/health/);
  assert.match(watchdog, /api\/ready/);
  assert.match(watchdog, /backup:stale/);
  assert.match(service, /OnFailure=relayhub-independent-fallback/);
  assert.match(guide, /cannot\s+detect or report the loss of Relay Hub itself/);
  assert.match(guide, /must select the channel/);
  assert.match(guide, /do not install or enable/);
});
