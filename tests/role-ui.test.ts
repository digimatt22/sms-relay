import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dashboard mutation surfaces are gated by role", () => {
  const newMessagePage = readFileSync("src/app/messages/new/page.tsx", "utf8");
  const messageDetailPage = readFileSync("src/app/messages/[id]/page.tsx", "utf8");
  const gatewaysPage = readFileSync("src/app/gateways/page.tsx", "utf8");
  const gatewayDetailPage = readFileSync("src/app/gateways/[id]/page.tsx", "utf8");
  const clientsPage = readFileSync("src/app/clients/page.tsx", "utf8");
  const consentPage = readFileSync("src/app/consent/page.tsx", "utf8");
  const routingPage = readFileSync("src/app/routing/page.tsx", "utf8");

  assert.match(newMessagePage, /requireRolePage\("operator"\)/);
  assert.match(messageDetailPage, /hasRole\(session, "operator"\)/);
  assert.match(gatewayDetailPage, /accountHasRole\(account, "operator"\)/);
  assert.match(gatewayDetailPage, /hasGatewayAccessLevel\(accessLevel, "manage"\)/);
  assert.match(gatewayDetailPage, /canOperate \? \(/);
  assert.match(gatewaysPage, /hasRole\(session, "org_admin"\)/);
  assert.match(clientsPage, /hasRole\(session, "org_admin"\)/);
  assert.match(clientsPage, /Contact your client administrator to create an app and API key/);
  assert.match(consentPage, /accountHasRole\(account, "org_admin"\)/);
  assert.match(consentPage, /\{canManageConsent \? \(/);
  assert.match(consentPage, /canManageConsent && program\.status === "active"/);
  assert.match(consentPage, /canManageConsent && authorization\.status === "verified_authorized"/);
  assert.match(routingPage, /requireRolePage\("org_admin"\)/);
});

test("server actions enforce roles for forged form posts", () => {
  const actions = readFileSync("src/app/actions.ts", "utf8");

  assert.match(actions, /function requireActionRole\(minimumRole: Role\)/);
  assert.match(actions, /createMessageAction[\s\S]*requireAccountActionRole\("operator"\)/);
  assert.match(actions, /createGatewayAction[\s\S]*requireAccountActionRole\("org_admin"\)/);
  assert.match(actions, /createApiClientAction[\s\S]*requireAccountActionRole\("org_admin"\)/);
  assert.match(actions, /createGatewayPoolAction[\s\S]*requireActionRole\("org_admin"\)/);
  assert.match(actions, /function requireGatewayActionAccess\(gatewayId: string, minimumRole: Role\)/);
  assert.match(actions, /requestGatewayCommandAction[\s\S]*requireGatewayActionAccess\(gatewayId, "operator"\)/);
  assert.match(actions, /if \(role === "platform_admin"\) redirect\("\/organizations"\)/);
});
