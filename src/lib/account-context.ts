import { query } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { normalizeRole, type Role } from "@/lib/rbac";

export type AccountContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  userId: string;
  globalRole: Role;
  accountRole: Role;
  isPlatformAdmin: boolean;
  plan: {
    id: string | null;
    slug: string;
    name: string;
    monthlyMessageLimit: number;
    includedUsers: number;
    includedApiKeys: number;
    includedGateways: number;
    privateGatewayAllowed: boolean;
    callbackAllowed: boolean;
    logRetentionDays: number;
    supportLevel: string;
    displayPrice: string;
  };
};

const fallbackPlan = {
  id: null,
  slug: "starter",
  name: "Starter",
  monthlyMessageLimit: 1000,
  includedUsers: 1,
  includedApiKeys: 2,
  includedGateways: 0,
  privateGatewayAllowed: false,
  callbackAllowed: false,
  logRetentionDays: 30,
  supportLevel: "standard",
  displayPrice: "$49/mo placeholder"
};

export async function getAccountContext(session: { user: { id: string; role?: string | null } }): Promise<AccountContext> {
  const globalRole = normalizeRole(session.user.role);
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const result = await query(
    `SELECT o.id,
            o.name,
            o.slug,
            m.role AS membership_role,
            p.id AS plan_id,
            p.slug AS plan_slug,
            p.name AS plan_name,
            p.monthly_message_limit,
            p.included_users,
            p.included_api_keys,
            p.included_gateways,
            p.private_gateway_allowed,
            p.callback_allowed,
            p.log_retention_days,
            p.support_level,
            p.display_price
       FROM organizations o
       LEFT JOIN organization_memberships m
         ON m.organization_id = o.id
        AND m.user_id = $2
        AND m.status = 'active'
       LEFT JOIN organization_plans op
         ON op.organization_id = o.id
        AND op.status = 'active'
       LEFT JOIN plans p ON p.id = op.plan_id
      WHERE o.id = $1`,
    [organizationId, session.user.id]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Current account could not be resolved");
  }

  return {
    organizationId: row.id,
    organizationName: row.name,
    organizationSlug: row.slug,
    userId: session.user.id,
    globalRole,
    accountRole: globalRole === "platform_admin" ? "platform_admin" : normalizeRole(row.membership_role),
    isPlatformAdmin: globalRole === "platform_admin",
    plan: row.plan_id
      ? {
          id: row.plan_id,
          slug: row.plan_slug,
          name: row.plan_name,
          monthlyMessageLimit: Number(row.monthly_message_limit),
          includedUsers: Number(row.included_users),
          includedApiKeys: Number(row.included_api_keys),
          includedGateways: Number(row.included_gateways),
          privateGatewayAllowed: Boolean(row.private_gateway_allowed),
          callbackAllowed: Boolean(row.callback_allowed),
          logRetentionDays: Number(row.log_retention_days),
          supportLevel: row.support_level,
          displayPrice: row.display_price
        }
      : fallbackPlan
  };
}

export function accountHasRole(context: AccountContext, minimumRole: Role) {
  const rank: Record<Role, number> = {
    viewer: 0,
    operator: 1,
    org_admin: 2,
    platform_admin: 3
  };
  return rank[context.accountRole] >= rank[minimumRole];
}
