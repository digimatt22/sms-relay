import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyConsentCommand } from "../src/lib/inbound";
import {
  buildConsentDisclosure,
  buildVerificationTemplate,
  renderVerificationTemplate
} from "../src/lib/messaging-programs";

test("STOP, START, and HELP keywords are classified conservatively", () => {
  assert.equal(classifyConsentCommand("stop"), "stop");
  assert.equal(classifyConsentCommand("please stop texting me"), "stop");
  assert.equal(classifyConsentCommand("unsubscribe"), "stop");
  assert.equal(classifyConsentCommand("START"), "start");
  assert.equal(classifyConsentCommand("yes"), null);
  assert.equal(classifyConsentCommand("help"), "help");
  assert.equal(classifyConsentCommand("stop by tomorrow"), null);
});

test("generated consent language and verification texts contain locked disclosures", () => {
  const disclosure = buildConsentDisclosure({
    organizationId: "11111111-1111-4111-8111-111111111111",
    name: "Owner updates",
    senderDisplayName: "DigiColony",
    messageClass: "marketing",
    purpose: "property and agent updates",
    expectedFrequency: "Up to 4 messages per month",
    helpContact: "support@example.com"
  });
  assert.match(disclosure, /Reply STOP to opt out or HELP for help/);
  assert.match(disclosure, /not a condition of purchase/i);

  const rendered = renderVerificationTemplate(buildVerificationTemplate(), {
    clientName: "DigiColony",
    programName: "Owner updates",
    code: "123456",
    frequencyNotice: "Up to 4 messages per month"
  });
  assert.match(rendered, /Code 123456/);
  assert.match(rendered, /Reply STOP/);
  assert.match(rendered, /HELP/);
});

test("ordinary messages are blocked at create, claim, and attempt boundaries", () => {
  const messages = readFileSync("src/lib/messages.ts", "utf8");
  assert.match(messages, /recipient_authorization_required/);
  assert.match(messages, /message_category <> 'ordinary'/);
  assert.match(messages, /message_category = 'ordinary'/);
  assert.match(messages, /platform_suppressions/);
  assert.match(messages, /required_gateway_id/);
  assert.doesNotMatch(messages, /recipient_authorizations authorization/);
});

test("migration creates authorization evidence, challenges, programs, and suppression", () => {
  const migration = readFileSync("migrations/014_recipient_authorization.sql", "utf8");
  for (const table of [
    "messaging_programs",
    "consent_disclosure_versions",
    "verification_template_versions",
    "recipient_authorizations",
    "recipient_authorization_events",
    "verification_challenges",
    "platform_suppressions"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("a default DigiColony system messaging program is seeded", () => {
  const migration = readFileSync("migrations/015_default_system_messaging_program.sql", "utf8");
  assert.match(migration, /DigiColony SNS System Notifications/);
  assert.match(migration, /user_requested_transactional/);
  assert.match(migration, /is_system/);
  assert.match(migration, /status, public_enrollment_enabled/);
  assert.match(migration, /'active', true/);
});

test("messaging program ownership is enforced by client at the database boundary", () => {
  const migration = readFileSync("migrations/016_client_scoped_messaging_programs.sql", "utf8");
  assert.match(migration, /UNIQUE \(id, organization_id\)/);
  assert.match(migration, /FOREIGN KEY \(messaging_program_id, organization_id\)/);
  assert.match(migration, /REFERENCES messaging_programs \(id, organization_id\)/);

  const programs = readFileSync("src/lib/messaging-programs.ts", "utf8");
  assert.match(programs, /approveMessagingProgram[\s\S]*organization_id = \$3/);
});
