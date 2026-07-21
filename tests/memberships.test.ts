import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("organizations page supports invitations and client-user editing", () => {
  const page = readFileSync("src/app/organizations/page.tsx", "utf8");
  const invitePage = readFileSync("src/app/organizations/[id]/invite/page.tsx", "utf8");
  const editPage = readFileSync("src/app/organizations/users/[membershipId]/edit/page.tsx", "utf8");
  const actions = readFileSync("src/app/actions.ts", "utf8");
  const organizations = readFileSync("src/lib/organizations.ts", "utf8");
  const migration = readFileSync("migrations/009_user_invitations.sql", "utf8");
  const statusMigration = readFileSync("migrations/013_client_user_status.sql", "utf8");

  assert.match(page, /<h2>Client Users<\/h2>/);
  assert.match(page, /name="clientId"/);
  assert.match(page, /Pencil/);
  assert.match(page, /Pending invite/);
  assert.match(page, /resendUserInvitationAction/);
  assert.match(page, /revokeUserInvitationAction/);
  assert.match(page, /removeOrganizationMembershipAction/);
  assert.match(editPage, /updateClientUserAction/);
  assert.match(editPage, /name="name"/);
  assert.match(editPage, /name="role"/);
  assert.match(editPage, /name="status"/);
  assert.match(editPage, /name="password"/);
  assert.match(actions, /must_change_password = true/);
  assert.match(invitePage, /createUserInvitationAction/);
  assert.match(invitePage, /listOrganizationsForUser/);
  assert.match(invitePage, /<label htmlFor="organizationId">Client<\/label>/);
  assert.match(invitePage, /platformAdmin \? \(/);
  assert.match(invitePage, /<select id="organizationId" name="organizationId"/);
  assert.match(invitePage, /value=\{selectedClient\.name\} readOnly/);
  assert.match(invitePage, /value=\{selectedOrganizationId\}/);
  assert.match(actions, /acceptUserInvitationAction/);
  assert.match(actions, /upsertOrganizationMembership/);
  assert.match(organizations, /createUserInvitation/);
  assert.match(organizations, /acceptUserInvitation/);
  assert.match(organizations, /INSERT INTO organization_memberships/);
  assert.match(organizations, /DELETE FROM organization_memberships/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_invitations/);
  assert.match(statusMigration, /status text NOT NULL DEFAULT 'active'/);
});

test("membership management API is available for automation", () => {
  const route = readFileSync("src/app/api/organizations/[id]/members/route.ts", "utf8");

  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /requireRoleApi\("org_admin"\)/);
});
