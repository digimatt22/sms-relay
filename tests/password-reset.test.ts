import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPasswordResetCode } from "../src/lib/security";
import { redactSensitiveMessage } from "../src/lib/sensitive-messages";

test("password reset codes are six numeric digits", () => {
  assert.match(createPasswordResetCode(), /^\d{6}$/);
});

test("security message redaction removes codes from user-facing results", () => {
  const message = redactSensitiveMessage({
    body: "RelayHub code: 123456",
    metadata: { systemType: "password_reset" }
  });
  assert.equal(message.body, "[Security code hidden]");
});

test("SMS password recovery is rate limited, expiring, and single use", () => {
  const migration = readFileSync("migrations/012_sms_password_resets.sql", "utf8");
  const resets = readFileSync("src/lib/password-resets.ts", "utf8");
  const forgotPage = readFileSync("src/app/forgot-password/page.tsx", "utf8");
  const resetPage = readFileSync("src/app/reset-password/page.tsx", "utf8");

  assert.match(migration, /mobile_number text/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS password_reset_codes/);
  assert.match(resets, /RESET_CODE_LIFETIME_MINUTES = 15/);
  assert.match(resets, /RESET_CODE_MAX_ATTEMPTS = 5/);
  assert.match(resets, /RESET_REQUEST_COOLDOWN_SECONDS = 60/);
  assert.match(resets, /RESET_REQUEST_MAX_PER_HOUR = 5/);
  assert.match(resets, /systemType: "password_reset"/);
  assert.match(resets, /UPDATE admin_users/);
  assert.match(forgotPage, /Send reset code/);
  assert.match(resetPage, /autoComplete="one-time-code"/);
});

test("registration requires SMS mobile verification before login", () => {
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  const verification = readFileSync("src/lib/mobile-verification.ts", "utf8");
  const invitation = readFileSync("src/app/invitations/[token]/page.tsx", "utf8");

  assert.match(invitation, /name="mobileNumber"/);
  assert.match(auth, /mobile_number_verified_at IS NOT NULL/);
  assert.match(verification, /systemType: "mobile_verification"/);
  assert.match(verification, /VERIFICATION_REQUEST_MAX_PER_HOUR = 5/);
  assert.match(verification, /mobile_number_verified_at = now\(\)/);
});

test("security SMS bodies are hidden from dashboard and reply matching", () => {
  const sensitive = readFileSync("src/lib/sensitive-messages.ts", "utf8");
  const messages = readFileSync("src/lib/messages.ts", "utf8");
  const inbound = readFileSync("src/lib/inbound.ts", "utf8");

  assert.match(sensitive, /password_reset/);
  assert.match(sensitive, /mobile_verification/);
  assert.match(sensitive, /\[Security code hidden\]/);
  assert.match(messages, /redactSensitiveMessage/);
  assert.match(inbound, /NOT IN \('password_reset', 'mobile_verification'\)/);
});
