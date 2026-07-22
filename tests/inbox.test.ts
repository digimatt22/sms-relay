import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("inbox supports unread counts and marks opened messages read", () => {
  const migration = readFileSync("migrations/017_inbox_unread_state.sql", "utf8");
  const inbound = readFileSync("src/lib/inbound.ts", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS read_at timestamptz/);
  assert.match(migration, /WHERE read_at IS NULL/);
  assert.match(inbound, /countUnreadInboundMessages/);
  assert.match(inbound, /SET read_at = COALESCE\(read_at, now\(\)\)/);
  assert.match(inbound, /excludeId/);
  assert.match(layout, /className="nav-badge"/);
  assert.match(layout, /99\+/);
});

test("inbox filters and sorting are client scoped", () => {
  const inbox = readFileSync("src/app/inbox/page.tsx", "utf8");
  const inbound = readFileSync("src/lib/inbound.ts", "utf8");

  assert.match(inbox, /From date/);
  assert.match(inbox, /To date/);
  assert.match(inbox, /All gateways/);
  assert.match(inbox, /Newest first/);
  assert.match(inbox, /prefetch=\{false\}/);
  assert.match(inbound, /i\.organization_id = \$\$\{values\.length\}/);
  assert.match(inbound, /i\.gateway_id = \$\$\{values\.length\}/);
  assert.match(inbound, /i\.received_at >=/);
  assert.match(inbound, /i\.received_at </);
});
