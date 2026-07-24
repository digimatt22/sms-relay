import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertReleasePathsSafe,
  prohibitedReleasePaths,
} from "../scripts/release-policy.mjs";

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

test("release policy permits migrations and a placeholder env example", () => {
  const candidates = [
    "migrations/019_delivery_receipts_conversations_webhooks.sql",
    ".env.example",
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
