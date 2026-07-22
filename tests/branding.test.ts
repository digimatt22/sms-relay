import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_PLATFORM_NAME, getPlatformName, getPublicAppUrl } from "../src/lib/branding";

test("platform branding defaults to DigiColony SNS and supports white labeling", () => {
  const originalName = process.env.PLATFORM_NAME;
  try {
    delete process.env.PLATFORM_NAME;
    assert.equal(DEFAULT_PLATFORM_NAME, "DigiColony SNS");
    assert.equal(getPlatformName(), "DigiColony SNS");
    process.env.PLATFORM_NAME = "Customer Messaging";
    assert.equal(getPlatformName(), "Customer Messaging");
  } finally {
    if (originalName === undefined) delete process.env.PLATFORM_NAME;
    else process.env.PLATFORM_NAME = originalName;
  }
});

test("public links use the configured canonical application URL", () => {
  const originalRelayUrl = process.env.RELAYHUB_PUBLIC_URL;
  try {
    process.env.RELAYHUB_PUBLIC_URL = "https://sns.digicolony.net/";
    assert.equal(getPublicAppUrl(), "https://sns.digicolony.net");
    const organizations = readFileSync("src/app/organizations/page.tsx", "utf8");
    const invitePage = readFileSync("src/app/organizations/[id]/invite/page.tsx", "utf8");
    assert.match(organizations, /getPublicAppUrl/);
    assert.match(invitePage, /getPublicAppUrl/);
    assert.doesNotMatch(organizations, /<pre>\{`\/invitations\//);
  } finally {
    if (originalRelayUrl === undefined) delete process.env.RELAYHUB_PUBLIC_URL;
    else process.env.RELAYHUB_PUBLIC_URL = originalRelayUrl;
  }
});

test("signed-in users are redirected away from the sign-in screen", () => {
  const login = readFileSync("src/app/login/page.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(login, /if \(session\?\.user\) redirect\("\/"\)/);
  assert.match(layout, /\{session\?\.user \? \(/);
});

test("shared form styles provide consistent field and stacked-form spacing", () => {
  const styles = readFileSync("src/app/globals.css", "utf8");
  assert.match(styles, /\.form \+ \.form/);
  assert.match(styles, /\.form > p/);
  assert.match(styles, /\.login \.auth-footer/);
});

test("user-facing platform names use the shared branding configuration", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const login = readFileSync("src/app/login/page.tsx", "utf8");
  const invitation = readFileSync("src/app/invitations/[token]/page.tsx", "utf8");
  const verification = readFileSync("src/lib/mobile-verification.ts", "utf8");
  const reset = readFileSync("src/lib/password-resets.ts", "utf8");
  const environment = readFileSync(".env.example", "utf8");

  assert.match(layout, /getPlatformName/);
  assert.match(login, /getPlatformName/);
  assert.match(invitation, /getPlatformName/);
  assert.match(verification, /getPlatformName/);
  assert.match(reset, /getPlatformName/);
  assert.match(environment, /PLATFORM_NAME=DigiColony SNS/);
});
