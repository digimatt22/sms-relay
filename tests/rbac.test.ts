import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRole, hasRole } from "../src/lib/rbac";

test("legacy admin role normalizes to platform_admin", () => {
  assert.equal(normalizeRole("admin"), "platform_admin");
  assert.equal(normalizeRole("platform_admin"), "platform_admin");
  assert.equal(normalizeRole("unknown"), "viewer");
});

test("role hierarchy allows higher roles to perform lower-role work", () => {
  assert.equal(hasRole({ user: { role: "platform_admin" } } as any, "operator"), true);
  assert.equal(hasRole({ user: { role: "org_admin" } } as any, "operator"), true);
  assert.equal(hasRole({ user: { role: "operator" } } as any, "org_admin"), false);
  assert.equal(hasRole({ user: { role: "viewer" } } as any, "operator"), false);
});
