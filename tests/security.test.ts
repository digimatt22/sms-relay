import test from "node:test";
import assert from "node:assert/strict";
import { redactPhone, hashPassword, verifyPassword, createGatewayKey, hashGatewayKey } from "../src/lib/security";

test("redactPhone preserves only last four digits", () => {
  assert.equal(redactPhone("+1 (555) 123-4567"), "***-***-4567");
});

test("password hashing verifies matching values", () => {
  const hash = hashPassword("secret");
  assert.equal(verifyPassword("secret", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
});

test("gateway keys hash deterministically", () => {
  const key = createGatewayKey();
  assert.equal(hashGatewayKey(key), hashGatewayKey(key));
  assert.notEqual(hashGatewayKey(key), key);
});
