import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dashboard timestamps render in the viewer's browser timezone", () => {
  const component = readFileSync("src/components/local-date-time.tsx", "utf8");
  const dashboard = readFileSync("src/app/page.tsx", "utf8");
  const messages = readFileSync("src/app/messages/page.tsx", "utf8");
  const inbox = readFileSync("src/app/inbox/page.tsx", "utf8");

  assert.match(component, /useSyncExternalStore/);
  assert.match(component, /Intl\.DateTimeFormat/);
  assert.match(component, /timeZoneName: "short"/);
  assert.match(dashboard, /<LocalDateTime value={message\.created_at}/);
  assert.match(messages, /<LocalDateTime value={message\.created_at}/);
  assert.match(inbox, /<LocalDateTime value={message\.received_at}/);
});
