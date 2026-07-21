import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("organizations page supports invitations and membership role editing", () => {
  const page = readFileSync("src/app/organizations/page.tsx", "utf8");
  const invitePage = readFileSync("src/app/organizations/[id]/invite/page.tsx", "utf8");
  const actions = readFileSync("src/app/actions.ts", "utf8");
  const organizations = readFileSync("src/lib/organizations.ts", "utf8");
  const migration = readFileSync("migrations/009_user_invitations.sql", "utf8");

  assert.match(page, /Client users and invitations/);
  assert.match(page, /Pending invite/);
  assert.match(page, /resendUserInvitationAction/);
  assert.match(page, /revokeUserInvitationAction/);
  assert.match(page, /updateOrganizationMembershipAction/);
  assert.match(page, /removeOrganizationMembershipAction/);
  assert.match(invitePage, /createUserInvitationAction/);
  assert.match(invitePage, /listOrganizationsForUser/);
  assert.match(actions, /acceptUserInvitationAction/);
  assert.match(actions, /upsertOrganizationMembership/);
  assert.match(organizations, /createUserInvitation/);
  assert.match(organizations, /acceptUserInvitation/);
  assert.match(organizations, /INSERT INTO organization_memberships/);
  assert.match(organizations, /DELETE FROM organization_memberships/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_invitations/);
});

test("membership management API is available for automation", () => {
  const route = readFileSync("src/app/api/organizations/[id]/members/route.ts", "utf8");

  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /requireRoleApi\("org_admin"\)/);
});
