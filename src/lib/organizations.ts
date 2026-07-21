import { cookies } from "next/headers";
import { query, transaction } from "@/lib/db";
import { normalizeRole } from "@/lib/rbac";
import { normalizePhoneNumber } from "@/lib/phone";
import { createInvitationToken, hashInvitationToken, hashPassword } from "@/lib/security";

export const DEFAULT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_GATEWAY_POOL_ID = "00000000-0000-0000-0000-000000000101";

const ORG_COOKIE = "relayhub_org";

export async function listOrganizationsForUser(userId: string, role?: string | null) {
  if (normalizeRole(role) === "platform_admin") {
    const result = await query(
      `SELECT id, name, slug, status
         FROM organizations
        ORDER BY name ASC`
    );
    return result.rows;
  }

  const result = await query(
    `SELECT o.id, o.name, o.slug, o.status
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
      ORDER BY o.name ASC`,
    [userId]
  );
  return result.rows;
}

export async function getCurrentOrganizationId(input?: { userId?: string; role?: string | null }) {
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ORG_COOKIE)?.value;
  if (selectedId && input?.userId) {
    const organizations = await listOrganizationsForUser(input.userId, input.role);
    if (organizations.some((organization: any) => organization.id === selectedId)) {
      return selectedId;
    }
  }
  return DEFAULT_ORGANIZATION_ID;
}

export async function setCurrentOrganizationId(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
}

export async function ensureDefaultGatewayPool(organizationId: string) {
  const existing = await query(
    `SELECT id
       FROM gateway_pools
      WHERE organization_id = $1
        AND is_default = true
      ORDER BY created_at ASC
      LIMIT 1`,
    [organizationId]
  );
  if (existing.rows[0]) return existing.rows[0].id as string;

  const result = await query(
    `INSERT INTO gateway_pools (organization_id, name, slug, is_default)
     VALUES ($1, 'Global Pool', 'global', true)
     ON CONFLICT (organization_id, slug) DO UPDATE
       SET is_default = true,
           updated_at = now()
     RETURNING id`,
    [organizationId]
  );
  return result.rows[0].id as string;
}

export async function createOrganization(input: { name: string; slug: string; userId?: string | null }) {
  const result = await query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     RETURNING id, name, slug, status`,
    [input.name, input.slug]
  );
  const organization = result.rows[0];
  await ensureDefaultGatewayPool(organization.id);
  if (input.userId) {
    await query(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'org_admin')
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [organization.id, input.userId]
    );
  }
  return organization;
}

export async function createDashboardUser(input: {
  email: string;
  name?: string | null;
  mobileNumber: string;
  password: string;
  role?: string;
}) {
  const mobileNumber = normalizePhoneNumber(input.mobileNumber);
  const result = await query(
    `INSERT INTO admin_users (email, name, mobile_number, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, admin_users.name),
           mobile_number_verified_at = CASE
             WHEN admin_users.mobile_number IS DISTINCT FROM EXCLUDED.mobile_number THEN NULL
             ELSE admin_users.mobile_number_verified_at
           END,
           mobile_number = EXCLUDED.mobile_number,
           updated_at = now()
     RETURNING id, email, name, mobile_number, role`,
    [
      input.email.toLowerCase(),
      input.name || null,
      mobileNumber,
      hashPassword(input.password),
      normalizeRole(input.role || "viewer")
    ]
  );
  return result.rows[0];
}

export async function createUserInvitation(input: {
  organizationId: string;
  email: string;
  name?: string | null;
  role: string;
  invitedByUserId: string;
}) {
  const token = createInvitationToken();
  const role = normalizeRole(input.role);
  if (role === "platform_admin") {
    throw new Error("Platform admin invitations must be created out of band");
  }

  const invitation = await transaction(async (db) => {
    await db.query(
      `UPDATE user_invitations
          SET status = 'revoked',
              revoked_at = now(),
              updated_at = now()
        WHERE organization_id = $1
          AND email = $2
          AND status = 'pending'`,
      [input.organizationId, input.email.toLowerCase()]
    );

    const result = await db.query(
      `INSERT INTO user_invitations (
         organization_id, email, name, role, token_hash, invited_by_user_id, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days')
       RETURNING id, organization_id, email, name, role, status, expires_at, created_at`,
      [
        input.organizationId,
        input.email.toLowerCase(),
        input.name || null,
        role,
        hashInvitationToken(token),
        input.invitedByUserId
      ]
    );
    return result.rows[0];
  });

  return { invitation, token };
}

export async function listPendingUserInvitations(organizationIds: string[]) {
  if (!organizationIds.length) return [];
  const result = await query(
    `SELECT i.*, o.name AS organization_name, u.email AS invited_by_email
       FROM user_invitations i
       JOIN organizations o ON o.id = i.organization_id
       LEFT JOIN admin_users u ON u.id = i.invited_by_user_id
      WHERE i.organization_id = ANY($1::uuid[])
        AND i.status = 'pending'
      ORDER BY i.created_at DESC`,
    [organizationIds]
  );
  return result.rows;
}

export async function acceptUserInvitation(input: {
  token: string;
  mobileNumber: string;
  password: string;
}) {
  const tokenHash = hashInvitationToken(input.token);
  const mobileNumber = normalizePhoneNumber(input.mobileNumber);
  return transaction(async (db) => {
    const invitationResult = await db.query(
      `SELECT *
         FROM user_invitations
        WHERE token_hash = $1
          AND status = 'pending'
          AND expires_at > now()
        FOR UPDATE`,
      [tokenHash]
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) return null;

    const userResult = await db.query(
      `INSERT INTO admin_users (email, name, mobile_number, password_hash, role, default_organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE
         SET name = COALESCE(EXCLUDED.name, admin_users.name),
             mobile_number_verified_at = CASE
               WHEN admin_users.mobile_number IS DISTINCT FROM EXCLUDED.mobile_number THEN NULL
               ELSE admin_users.mobile_number_verified_at
             END,
             mobile_number = EXCLUDED.mobile_number,
             password_hash = EXCLUDED.password_hash,
             role = CASE
               WHEN admin_users.role = 'platform_admin' THEN admin_users.role
               ELSE EXCLUDED.role
             END,
             default_organization_id = COALESCE(admin_users.default_organization_id, EXCLUDED.default_organization_id),
             updated_at = now()
       RETURNING id, email, name, role`,
      [
        invitation.email,
        invitation.name,
        mobileNumber,
        hashPassword(input.password),
        normalizeRole(invitation.role),
        invitation.organization_id
      ]
    );
    const user = userResult.rows[0];

    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET role = EXCLUDED.role,
             updated_at = now()`,
      [invitation.organization_id, user.id, normalizeRole(invitation.role)]
    );

    await db.query(
      `UPDATE user_invitations
          SET status = 'accepted',
              accepted_by_user_id = $2,
              accepted_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [invitation.id, user.id]
    );

    return { invitation, user };
  });
}

export async function upsertOrganizationMembership(input: {
  organizationId: string;
  userId: string;
  role: string;
}) {
  const result = await query(
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, user_id) DO UPDATE
       SET role = EXCLUDED.role,
           updated_at = now()
     RETURNING *`,
    [input.organizationId, input.userId, normalizeRole(input.role)]
  );
  return result.rows[0];
}

export async function removeOrganizationMembership(input: {
  organizationId: string;
  userId: string;
}) {
  const result = await query(
    `DELETE FROM organization_memberships
      WHERE organization_id = $1
        AND user_id = $2
      RETURNING *`,
    [input.organizationId, input.userId]
  );
  return result.rows[0] || null;
}
