import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("account plans and gateway access schema are present", () => {
  const migration = readFileSync("migrations/010_account_plans_gateway_access.sql", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS plans/);
  assert.match(migration, /monthly_message_limit integer NOT NULL/);
  assert.match(migration, /included_users integer NOT NULL/);
  assert.match(migration, /included_api_keys integer NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS organization_plans/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS gateway_access/);
  assert.match(migration, /access_level text NOT NULL DEFAULT 'status_only'/);
  assert.match(migration, /'starter'.*1000/s);
  assert.match(migration, /'growth'.*10000/s);
  assert.match(migration, /'scale'.*50000/s);
});

test("historical pricing leads schema remains available", () => {
  const migration = readFileSync("migrations/011_pricing_leads.sql", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS pricing_leads/);
  assert.match(migration, /email text NOT NULL UNIQUE/);
  assert.match(migration, /\$49\/mo/);
  assert.doesNotMatch(migration, /placeholder/);
});

test("account context and plan capacity helpers back account-scoped UX", () => {
  const accountContext = readFileSync("src/lib/account-context.ts", "utf8");
  const plans = readFileSync("src/lib/plans.ts", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  assert.match(accountContext, /getAccountContext/);
  assert.match(accountContext, /membership_role/);
  assert.match(accountContext, /accountHasRole/);
  assert.match(plans, /assertPlanCapacity/);
  assert.match(plans, /Monthly message limit exceeded/);
  assert.match(layout, /label: isPlatformAdmin \? "Clients" : "Account"/);
  assert.match(layout, /label: isPlatformAdmin \? "Clients" : "Users"/);
  assert.doesNotMatch(layout, /Plan & Billing/);
  assert.doesNotMatch(layout, /\/account\/plan/);
});

test("gateway visibility separates status from details and management", () => {
  const gatewayAccess = readFileSync("src/lib/gateway-access.ts", "utf8");
  const gatewayList = readFileSync("src/app/gateways/page.tsx", "utf8");
  const gatewayDetail = readFileSync("src/app/gateways/[id]/page.tsx", "utf8");
  const logs = readFileSync("src/app/logs/page.tsx", "utf8");

  assert.match(gatewayAccess, /status_only/);
  assert.match(gatewayAccess, /details/);
  assert.match(gatewayAccess, /manage/);
  assert.match(gatewayList, /access_level/);
  assert.match(gatewayList, /hasGatewayAccessLevel\(gateway\.access_level, "details"\)/);
  assert.match(gatewayList, /account\.isPlatformAdmin \? \(\s*<section className="panel">\s*<h2>Installer<\/h2>/s);
  assert.match(gatewayDetail, /getGatewayAccessLevel/);
  assert.match(gatewayDetail, /hasGatewayAccessLevel\(accessLevel, "details"\)/);
  assert.match(logs, /access_level IN \('details', 'manage'\)/);
});

test("account topology and API key UI use active account context and clear labels", () => {
  const gatewayList = readFileSync("src/app/gateways/page.tsx", "utf8");
  const clients = readFileSync("src/app/clients/page.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  assert.match(gatewayList, /\{account\.organizationName\}/);
  assert.doesNotMatch(gatewayList, /M\.A\.T\.T\./);
  assert.match(layout, /label: "API Keys"/);
  assert.match(layout, /<WorkspaceSwitcher/);
  assert.doesNotMatch(layout, /Switch workspace/);
  assert.match(clients, /<h1>API Keys<\/h1>/);
  assert.match(clients, /account\.isPlatformAdmin \? undefined : organizationId/);
  assert.match(clients, /client\.organization_name/);
  assert.match(clients, /<label htmlFor="name">App Name<\/label>/);
  assert.match(clients, /<label htmlFor="keyLabel">Key Name<\/label>/);
  assert.match(clients, /<label htmlFor="apiOrganization">Client<\/label>/);
  assert.match(clients, /<select id="apiOrganization" name="organizationId"/);
  assert.match(clients, /This is not the secret key/);
});

test("plan and pricing user interfaces are hidden", () => {
  assert.equal(existsSync("src/app/account/plan/page.tsx"), false);
  assert.equal(existsSync("src/app/pricing/page.tsx"), false);
});
