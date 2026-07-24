import { readFile } from "node:fs/promises";

function requireValue(condition, message) {
  if (!condition) throw new Error(`invalid Sheldon schema-2 manifest: ${message}`);
}

const manifest = JSON.parse(await readFile("sheldon.json", "utf8"));

requireValue(manifest.schema === 2, "schema must be 2");
requireValue(manifest.contract === "sheldon-deploy/0.2.0", "contract must be 0.2.0");
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
  requireValue(manifest[section], `missing ${section} section`);
}
requireValue(manifest.release.source.revision === "HEAD", "release revision must resolve from HEAD");
requireValue(manifest.release.source.require_clean_worktree === true, "clean worktree is required");
requireValue(manifest.release.source.digest === "sha256", "release digest must be SHA-256");
requireValue(manifest.services.app.build.context === "release_archive", "app must build from audited archive");
requireValue(manifest.services.app.user === "nextjs", "app must remain non-root");
requireValue(manifest.services.app.dependencies.postgres === "ready", "app must wait for PostgreSQL readiness");
requireValue(manifest.services.postgres.image.startsWith("postgres:17."), "PostgreSQL 17 must be pinned");
requireValue(manifest.services.postgres.publish_ports === false, "PostgreSQL cannot publish a host port");
requireValue(manifest.ingress.loopback_only === true, "public ingress must be loopback only");
requireValue(manifest.database.isolation_tier === "platform-critical", "Relay Hub database must be dedicated");
requireValue(manifest.database.database_name === "relayhub_sms", "database semantics changed");
requireValue(manifest.database.cluster_admin_role === "relayhub_sms_cluster_admin", "cluster administrator role changed");
requireValue(manifest.database.owner_migrator_role === "relayhub_sms_owner", "owner/migrator role changed");
requireValue(manifest.database.runtime_role === "relayhub_sms_runtime", "runtime role changed");
requireValue(manifest.database.cluster_admin_role !== manifest.database.owner_migrator_role, "cluster admin must be separate from owner/migrator");
requireValue(manifest.database.owner_migrator_role !== manifest.database.runtime_role, "runtime must not own schema");
requireValue(manifest.database.runtime_owns_schema === false, "runtime schema ownership is prohibited");
requireValue(manifest.database.version.major === 17, "PostgreSQL major version must remain 17");
requireValue(manifest.database.version.preserve_major === true, "major-version preservation is required");
requireValue(manifest.database.migrations.deployment_coupled === false, "migrations cannot run during deploy");
requireValue(manifest.database.migrations.requires_explicit_authority === true, "migration authority gate missing");
requireValue(manifest.database.backup.requires_explicit_authority === true, "backup authority gate missing");
requireValue(manifest.rollout.rollback.database_downgrade === false, "rollback cannot downgrade the database");
requireValue(manifest.rollout.cleanup.automatic === false, "cleanup cannot be automatic");
requireValue(manifest.observability.alert_policy.watchdog_scope === "host", "watchdog must be host-level");
requireValue(
  manifest.observability.alert_policy.relayhub_self_alert_via_sms_only === false,
  "Relay Hub cannot be its own only alert path",
);

const serialized = JSON.stringify(manifest);
requireValue(!/postgres(?:ql)?:\/\/[^"]+:[^"]+@/i.test(serialized), "manifest contains a credentialed database URL");
requireValue(!/(password|secret)\\s*value/i.test(serialized), "manifest appears to contain secret values");

console.log("Sheldon schema-2 manifest validation passed.");
