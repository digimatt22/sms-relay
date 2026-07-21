import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("inbound matching links to recent carrier-submitted outbound without requiring callback", () => {
  const source = readFileSync("src/lib/inbound.ts", "utf8");
  assert.match(source, /status = 'carrier_submitted'/);
  assert.match(source, /submitted_at <= \$2::timestamptz/);
  assert.match(source, /interval '7 days'/);
  assert.doesNotMatch(source, /AND callback_url IS NOT NULL/);
});
