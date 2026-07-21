import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dashboard pages read through current organization context", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const messages = readFileSync("src/app/messages/page.tsx", "utf8");
  const gateways = readFileSync("src/app/gateways/page.tsx", "utf8");
  const clients = readFileSync("src/app/clients/page.tsx", "utf8");

  assert.match(layout, /switchOrganizationAction/);
  assert.match(layout, /listOrganizationsForUser/);
  assert.match(messages, /getCurrentOrganizationId/);
  assert.match(gateways, /g\.organization_id = \$1/);
  assert.match(clients, /listApiClients\(\{ organizationId \}\)/);
});

test("new organizations get their own default gateway pool", () => {
  const organizations = readFileSync("src/lib/organizations.ts", "utf8");
  const clients = readFileSync("src/lib/api-clients.ts", "utf8");
  const messages = readFileSync("src/lib/messages.ts", "utf8");

  assert.match(organizations, /ensureDefaultGatewayPool/);
  assert.match(organizations, /INSERT INTO gateway_pools/);
  assert.match(clients, /ensureDefaultGatewayPool\(organizationId\)/);
  assert.match(messages, /FROM gateway_pools p/);
  assert.match(messages, /p\.organization_id = c\.organization_id/);
});

test("management mutations include organization scope", () => {
  const actions = readFileSync("src/app/actions.ts", "utf8");
  const apiClients = readFileSync("src/lib/api-clients.ts", "utf8");
  const gateways = readFileSync("src/lib/gateways.ts", "utf8");

  assert.match(actions, /organizationId: await getCurrentOrganizationId/);
  assert.match(apiClients, /organization_id = \$4::uuid/);
  assert.match(gateways, /organization_id = \$2::uuid/);
});
