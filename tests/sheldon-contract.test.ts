import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("sheldon.json", "utf8"));

test("Sheldon schema 2 declares every enhanced contract section", () => {
  assert.equal(manifest.schema, 2);
  assert.equal(manifest.contract, "sheldon-deploy/0.2.0");
  for (const section of [
    "release",
    "services",
    "ingress",
    "networks",
    "secrets",
    "storage",
    "database",
    "rollout",
    "observability",
  ]) {
    assert.ok(manifest[section], section);
  }
  const result = spawnSync("node", ["scripts/validate-sheldon-manifest.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("release and Docker build inputs are exact, clean, and audited", () => {
  assert.equal(manifest.release.source.revision, "HEAD");
  assert.equal(manifest.release.source.require_clean_worktree, true);
  assert.equal(manifest.release.source.digest, "sha256");
  assert.equal(
    manifest.release.source.archive_command,
    "npm run release:candidate --",
  );
  assert.equal(
    manifest.release.source.audit_command,
    "npm run release:team-audit --",
  );
  assert.equal(manifest.services.app.build.context, "release_archive");
  assert.ok(manifest.release.source.exclusions.includes("backups/"));
  assert.ok(manifest.release.source.exclusions.includes("*.dump"));
  assert.ok(manifest.release.source.exclusions.includes(".env.*"));

  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /RUN mkdir -p public/);
  assert.match(
    dockerfile,
    /id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,required=true/,
  );
  assert.match(dockerfile, /AS migration/);
  assert.match(dockerfile, /CMD \["npm", "run", "db:migrate:production"\]/);
  assert.doesNotMatch(
    dockerfile,
    /FROM node:22-alpine AS runner[\s\S]*COPY --from=builder[^\n]*\/app\/migrations/,
  );
  assert.doesNotMatch(dockerfile, /id=sheldon_app_env/);
});

test("Relay Hub owns PostgreSQL 17 storage but runtime does not own schema", () => {
  assert.equal(manifest.services.postgres.image, "postgres:17.10-bookworm");
  assert.equal(manifest.services.postgres.publish_ports, false);
  assert.equal(manifest.database.isolation_tier, "platform-critical");
  assert.equal(manifest.database.version.major, 17);
  assert.equal(manifest.database.version.preserve_major, true);
  assert.equal(manifest.database.database_name, "relayhub_sms");
  assert.equal(
    manifest.database.cluster_admin_role,
    "relayhub_sms_cluster_admin",
  );
  assert.equal(manifest.database.owner_migrator_role, "relayhub_sms_owner");
  assert.equal(manifest.database.runtime_role, "relayhub_sms_runtime");
  assert.notEqual(
    manifest.database.cluster_admin_role,
    manifest.database.owner_migrator_role,
  );
  assert.notEqual(
    manifest.database.owner_migrator_role,
    manifest.database.runtime_role,
  );
  assert.equal(manifest.database.runtime_owns_schema, false);
  assert.equal(
    manifest.storage.volumes.relayhub_sms_postgres_data.owner_service,
    "postgres",
  );
});

test("migrations, cleanup, and database rollback remain separately gated", () => {
  assert.equal(manifest.database.migrations.deployment_coupled, false);
  assert.equal(manifest.database.migrations.build_target, "migration");
  assert.equal(
    manifest.database.migrations.requires_explicit_authority,
    true,
  );
  assert.equal(manifest.database.backup.requires_explicit_authority, true);
  assert.equal(manifest.rollout.cleanup.automatic, false);
  assert.equal(manifest.rollout.rollback.database_downgrade, false);
});

test("host watchdog has a required independent Relay Hub fallback", () => {
  const policy = manifest.observability.alert_policy;
  assert.equal(policy.watchdog_scope, "host");
  assert.equal(policy.relayhub_self_alert_via_sms_only, false);
  assert.equal(policy.independent_fallback_required, true);
  assert.equal(policy.independent_fallback_selected, false);
});

test("database scripts separate owner migration and runtime grants", () => {
  const migrate = readFileSync("scripts/migrate.mjs", "utf8");
  const grants = readFileSync("scripts/apply-runtime-grants.mjs", "utf8");
  const init = readFileSync("scripts/postgres-init.sh", "utf8");
  const deployCheck = readFileSync("scripts/production-deploy-check.sh", "utf8");

  assert.match(migrate, /MIGRATION_DATABASE_URL/);
  assert.match(migrate, /relayhub_sms_owner/);
  assert.doesNotMatch(migrate, /process\.env\.DATABASE_URL/);
  assert.match(grants, /REVOKE ALL ON DATABASE relayhub_sms FROM PUBLIC/);
  assert.match(grants, /ALTER DEFAULT PRIVILEGES FOR ROLE/);
  assert.match(init, /CONNECTION LIMIT 20/);
  assert.match(init, /statement_timeout = '30s'/);
  assert.match(init, /lock_timeout = '5s'/);
  assert.match(deployCheck, /migrations are intentionally separate/);
  assert.doesNotMatch(deployCheck, /RUN_MIGRATIONS/);
});
