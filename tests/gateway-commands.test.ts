import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("hub exposes gateway command claim and completion endpoints", () => {
  const claim = readFileSync("src/app/api/gateway/commands/claim/route.ts", "utf8");
  const complete = readFileSync("src/app/api/gateway/commands/[id]/complete/route.ts", "utf8");
  const gateways = readFileSync("src/lib/gateways.ts", "utf8");

  assert.match(claim, /claimGatewayCommands/);
  assert.match(complete, /completeGatewayCommand/);
  assert.match(gateways, /FOR UPDATE SKIP LOCKED/);
  assert.match(gateways, /status = 'claimed'/);
});

test("gateway appliance executes diagnostics, reset, restart, and update commands", () => {
  const api = readFileSync("packages/gateway/src/api.ts", "utf8");
  const index = readFileSync("packages/gateway/src/index.ts", "utf8");
  const updater = readFileSync("packages/gateway/src/updater.ts", "utf8");
  const detailPage = readFileSync("src/app/gateways/[id]/page.tsx", "utf8");

  assert.match(api, /claimCommands/);
  assert.match(api, /completeCommand/);
  assert.match(index, /case "diagnostics"/);
  assert.match(index, /case "reset_modem"/);
  assert.match(index, /case "restart_service"/);
  assert.match(index, /case "update_service"/);
  assert.match(updater, /gateway\.tar\.gz/);
  assert.match(updater, /systemctl/);
  assert.match(updater, /previous/);
  assert.match(detailPage, /Update gateway/);
  assert.match(index, /processCommands/);
});
