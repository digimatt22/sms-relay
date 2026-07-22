import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneNumber } from "../src/lib/phone";
import { messageCreateSchema } from "../src/lib/validation";

test("phone normalization accepts common fixable formats", () => {
  assert.equal(normalizePhoneNumber("+15551234567"), "+15551234567");
  assert.equal(normalizePhoneNumber("5551234567"), "+15551234567");
  assert.equal(normalizePhoneNumber("1-555-123-4567"), "+15551234567");
  assert.equal(normalizePhoneNumber("(555) 123-4567"), "+15551234567");
  assert.equal(normalizePhoneNumber("555.123.4567"), "+15551234567");
  assert.equal(normalizePhoneNumber("‭+19542909026‬"), "+19542909026");
  assert.equal(normalizePhoneNumber("＋１（５５５）１２３－４５６７"), "+15551234567");
});

test("phone normalization rejects unfixable formats", () => {
  assert.throws(() => normalizePhoneNumber("555-1234"), /E\.164 or a 10-digit US number/);
  assert.throws(() => normalizePhoneNumber("+1 555 123 4567 x2"), /letters or extensions/);
  assert.throws(() => normalizePhoneNumber("1-800-FLOWERS"), /letters or extensions/);
  assert.throws(() => normalizePhoneNumber("++15551234567"), /only include \+/);
  assert.throws(() => normalizePhoneNumber("+1555123456789012"), /8 to 15 digits/);
});

test("message create schema normalizes valid phone and rejects invalid phone", () => {
  const programId = "11111111-1111-4111-8111-111111111111";
  const valid = messageCreateSchema.safeParse({
    to: "(555) 123-4567",
    body: "hello",
    priority: 100,
    metadata: {},
    programId
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.to, "+15551234567");
  }

  const invalid = messageCreateSchema.safeParse({
    to: "+1 555 123 4567 ext 2",
    body: "hello",
    priority: 100,
    metadata: {},
    programId
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.equal(invalid.error.flatten().fieldErrors.to?.[0], "Phone number cannot contain letters or extensions");
  }
});
