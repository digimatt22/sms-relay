import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("message queue rows open message details without an instruction note", () => {
  const page = readFileSync("src/app/messages/page.tsx", "utf8");
  const row = readFileSync("src/app/messages/clickable-message-row.tsx", "utf8");

  assert.doesNotMatch(page, /open a row to requeue or cancel/i);
  assert.match(page, /<ClickableMessageRow/);
  assert.match(page, /href={`\/messages\/\$\{message\.id\}`}/);
  assert.match(row, /onClick={openMessage}/);
  assert.match(row, /role="link"/);
  assert.match(row, /tabIndex={0}/);
});
