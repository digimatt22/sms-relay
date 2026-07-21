import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("pricing leads are stored for public signups", () => {
  const migration = readFileSync("migrations/011_pricing_leads.sql", "utf8");
  const actions = readFileSync("src/app/actions.ts", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS pricing_leads/);
  assert.match(migration, /email text NOT NULL UNIQUE/);
  assert.match(migration, /\$49\/mo/);
  assert.doesNotMatch(migration, /placeholder/);
  assert.match(actions, /createPricingLeadAction/);
  assert.match(actions, /INSERT INTO pricing_leads/);
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
  assert.match(layout, /isPlatformAdmin \? \[\{ href: "\/account\/plan", label: "Plan & Billing"/);
  const accountPlanPage = readFileSync("src/app/account/plan/page.tsx", "utf8");
  assert.match(accountPlanPage, /requireRolePage\("platform_admin"\)/);
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

test("public pricing page uses seeded plan data", () => {
  const pricing = readFileSync("src/app/pricing/page.tsx", "utf8");

  assert.match(pricing, /listPublicPlans/);
  assert.match(pricing, /sent messages\/month/);
  assert.match(pricing, /display_price/);
  assert.match(pricing, /included_users/);
  assert.match(pricing, /createPricingLeadAction/);
  assert.match(pricing, /Get more information/);
  assert.doesNotMatch(pricing, /Open dashboard/i);
  assert.doesNotMatch(pricing, /placeholder pricing/i);
  assert.doesNotMatch(pricing, /placeholder content/i);
});
