import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = "scripts/relayhub-independent-fallback.py";
const baseEnvironment = {
  ...process.env,
  RELAYHUB_FALLBACK_WEBHOOK_URL:
    "https://hooks.example.invalid/provider-path?token=do-not-print",
  RELAYHUB_FALLBACK_HOST_ID: "sheldon",
};

test("independent fallback dry-run emits only a redacted outage event", () => {
  const result = spawnSync(
    "python3",
    [script, "relayhub-host-watchdog.service"],
    {
      encoding: "utf8",
      env: { ...baseEnvironment, RELAYHUB_FALLBACK_DRY_RUN: "true" },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const event = JSON.parse(result.stdout);
  assert.equal(event.event, "relayhub_host_watchdog_failed");
  assert.equal(event.service, "relayhub-sms");
  assert.equal(event.host, "sheldon");
  assert.equal(event.failed_unit, "relayhub-host-watchdog.service");
  assert.equal(event.severity, "critical");
  assert.doesNotMatch(result.stdout, /provider-path|do-not-print|phone|message_body/);
});

test("fallback refuses Relay Hub, non-HTTPS, and unconfirmed live delivery", () => {
  for (const webhook of [
    "https://sns.digicolony.net/api/alerts/process",
    "http://hooks.example.invalid/outage",
    "https://127.0.0.1/outage",
  ]) {
    const result = spawnSync(
      "python3",
      [script, "relayhub-host-watchdog.service"],
      {
        encoding: "utf8",
        env: {
          ...baseEnvironment,
          RELAYHUB_FALLBACK_WEBHOOK_URL: webhook,
          RELAYHUB_FALLBACK_DRY_RUN: "true",
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /api\/alerts|hooks\.example|127\.0\.0\.1/);
  }

  const unconfirmed = spawnSync(
    "python3",
    [script, "relayhub-host-watchdog.service"],
    { encoding: "utf8", env: baseEnvironment },
  );
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /live fallback delivery is not confirmed/);
  assert.doesNotMatch(unconfirmed.stderr, /provider-path|do-not-print/);
});

test("fallback source is executable, deduplicated, and independent of Relay Hub", () => {
  const source = readFileSync(script, "utf8");
  const unit = readFileSync(
    "ops/systemd/relayhub-independent-fallback@.service",
    "utf8",
  );

  assert.equal(statSync(script).mode & 0o111, 0o111);
  assert.match(source, /recent_duplicate/);
  assert.match(source, /RELAYHUB_FALLBACK_CONFIRMED_INDEPENDENT/);
  assert.match(source, /RELAYHUB_FALLBACK_BEARER_TOKEN/);
  assert.doesNotMatch(source, /api\/alerts\/process|api\/messages/);
  assert.match(unit, /relayhub-independent-fallback %i/);
  assert.match(unit, /ReadWritePaths=%h\/\.local\/state\/sheldon\/watchdog/);
});

test("a recent delivered failure suppresses a duplicate without network access", () => {
  const temporary = mkdtempSync(join(tmpdir(), "relayhub-fallback-test-"));
  const statePath = join(temporary, "fallback.json");
  writeFileSync(
    statePath,
    JSON.stringify({
      event_id: "fixture",
      failed_unit: "relayhub-host-watchdog.service",
      delivered_at: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  try {
    const result = spawnSync(
      "python3",
      [script, "relayhub-host-watchdog.service"],
      {
        encoding: "utf8",
        env: {
          ...baseEnvironment,
          RELAYHUB_FALLBACK_CONFIRMED_INDEPENDENT: "true",
          RELAYHUB_FALLBACK_STATE_PATH: statePath,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      status: "suppressed",
      reason: "recent_duplicate",
    });
  } finally {
    rmSync(temporary, { recursive: true });
  }
});
