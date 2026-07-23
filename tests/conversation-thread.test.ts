import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("message details show an organization-scoped phone conversation", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");
  const page = readFileSync("src/app/messages/[id]/page.tsx", "utf8");
  const migration = readFileSync("migrations/018_conversation_indexes.sql", "utf8");

  assert.match(messages, /export async function listPhoneConversation/);
  assert.match(messages, /m\.organization_id = \$1[\s\S]*m\.to_number = \$2/);
  assert.match(messages, /i\.organization_id = \$1[\s\S]*i\.from_number = \$2/);
  assert.match(messages, /redactSensitiveMessage\(row\)/);
  assert.match(page, /listPhoneConversation\(organizationId, message\.to_number, message\.conversation_thread_id\)/);
  assert.match(page, /conversation\.map/);
  assert.match(page, /Selected message/);
  assert.match(migration, /messages \(organization_id, to_number, created_at\)/);
  assert.match(migration, /inbound_messages \(organization_id, from_number, received_at\)/);
});

test("conversation panel scrolls the selected message to the top", () => {
  const thread = readFileSync("src/app/messages/[id]/conversation-thread.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  assert.match(thread, /data-selected-message='true'/);
  assert.match(thread, /thread\.scrollTop = selected\.offsetTop - 4/);
  assert.match(styles, /\.conversation-thread[\s\S]*max-height: 560px[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.conversation-bubble\.selected/);
});
