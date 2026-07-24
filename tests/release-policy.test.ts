import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
// @ts-expect-error The deployment CLI is intentionally plain ESM for Node.
import { assertReleasePathsSafe, prohibitedReleasePaths } from "../scripts/release-policy.mjs";

test("release policy rejects backups, databases, secrets, keys, and archives", () => {
  const candidates = [
    "backups/relayhub-pre-019.dump",
    "backup/nightly.sql",
    ".env.local",
    "data/relayhub.db",
    "data/relayhub.sqlite3",
    "keys/runtime.pem",
    "keys/private.key",
    "exports/production-credentials.json",
    "exports/server-secrets.json",
    "release/source.zip",
  ];
  assert.deepEqual(prohibitedReleasePaths(candidates), candidates);
  assert.throws(
    () => assertReleasePathsSafe(candidates, "fixture"),
    /contains prohibited release paths/,
  );
});

test("release policy permits migrations and the non-env configuration template", () => {
  const candidates = [
    "migrations/019_delivery_receipts_conversations_webhooks.sql",
    "config/environment.example",
    "src/lib/db.ts",
  ];
  assert.deepEqual(prohibitedReleasePaths(candidates), []);
  assert.doesNotThrow(() => assertReleasePathsSafe(candidates, "fixture"));
});

test("Docker build context denies the same sensitive artifact classes", () => {
  const dockerignore = readFileSync(".dockerignore", "utf8");
  for (const pattern of [
    ".env.*",
    "backups/**",
    "**/*.dump",
    "**/*.db",
    "**/*.sqlite",
    "**/*.sqlite3",
    "**/*.pem",
    "**/*.key",
    "**/*credentials*.json",
    "**/*secrets*.json",
    "**/*.tar.gz",
    "**/*.zip",
  ]) {
    assert.match(dockerignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("release candidates audit a detached commit with the team marketplace", () => {
  const candidate = readFileSync("scripts/release-candidate.sh", "utf8");
  const audit = readFileSync(
    "scripts/team-marketplace-package-audit.py",
    "utf8",
  );

  assert.match(candidate, /git worktree add --detach/);
  assert.match(candidate, /team-marketplace-package-audit\.py/);
  assert.match(candidate, /requires a clean primary worktree/);
  assert.match(candidate, /release-policy\.mjs/);
  assert.match(candidate, /release candidate output is incomplete/);
  assert.match(candidate, /shasum -a 256 -c/);
  assert.match(audit, /Digicolony\/digicolony-codex-marketplace/);
  assert.match(audit, /digicolony-codex-marketplace/);
  assert.match(audit, /installed caches are not accepted/);
  assert.match(audit, /sys\.dont_write_bytecode = True/);
  assert.match(audit, /team-marketplace checkout is not clean/);
  assert.match(audit, /--untracked-files=all/);
  assert.match(audit, /compatibility_audit_only/);
  assert.match(audit, /schema2_deployment_supported/);
  assert.doesNotMatch(audit, /\.codex\/plugins\/cache|\.codex\/plugins/);
  assert.equal(statSync("scripts/release-candidate.sh").mode & 0o111, 0o111);
  assert.equal(
    statSync("scripts/team-marketplace-package-audit.py").mode & 0o111,
    0o111,
  );
});

test("release CLI entrypoint resolves its executable path safely", () => {
  const policy = readFileSync("scripts/release-policy.mjs", "utf8");
  assert.match(policy, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(policy, /path\.resolve\(process\.argv\[1\]\)/);
});
