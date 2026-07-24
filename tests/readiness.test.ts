import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkDatabaseReadiness } from "../src/lib/readiness";
import {
  assertDedicatedRuntimeDatabaseRole,
  RELAYHUB_RUNTIME_DATABASE_ROLE,
} from "../src/lib/db";

test("readiness executes a minimal read-only query and reports success", async () => {
  let statement = "";

  const result = await checkDatabaseReadiness(async (text) => {
    statement = text;
    return { rows: [{ "?column?": 1 }] };
  });

  assert.equal(statement, "SELECT 1");
  assert.deepEqual(result, {
    status: 200,
    body: { status: "ready" },
  });
});

test("readiness returns a generic failure without exposing database errors", async () => {
  const sensitiveError =
    "password authentication failed for user relayhub_sms_runtime at 172.18.0.2";

  const result = await checkDatabaseReadiness(async () => {
    throw new Error(sensitiveError);
  });

  assert.deepEqual(result, {
    status: 503,
    body: { status: "unavailable" },
  });
  assert.doesNotMatch(JSON.stringify(result), /password|relayhub_sms_runtime|172\.18\.0\.2/i);
});

test("liveness remains database-independent and readiness owns the database check", () => {
  const healthRoute = readFileSync("src/app/api/health/route.ts", "utf8");
  const readyRoute = readFileSync("src/app/api/ready/route.ts", "utf8");

  assert.match(healthRoute, /\{ status: "ok" \}/);
  assert.doesNotMatch(healthRoute, /query|DATABASE_URL|@\/lib\/db/);
  assert.match(readyRoute, /checkDatabaseReadiness/);
});

test("runtime database configuration requires the dedicated RelayHub role", () => {
  assert.equal(RELAYHUB_RUNTIME_DATABASE_ROLE, "relayhub_sms_runtime");
  assert.doesNotThrow(() =>
    assertDedicatedRuntimeDatabaseRole(
      "postgres://relayhub_sms_runtime:encoded%40secret@172.18.0.2:5432/relayhub_sms",
    ),
  );
  assert.throws(
    () =>
      assertDedicatedRuntimeDatabaseRole(
        "postgres://appuser:secret@172.18.0.2:5432/relayhub_sms",
      ),
    /dedicated relayhub_sms_runtime role/,
  );
});
